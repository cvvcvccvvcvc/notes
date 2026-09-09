import { z } from 'zod';

export const ENTITY_ID_MAX_LENGTH = 160;

const idSchema = z.string().min(1).max(ENTITY_ID_MAX_LENGTH);
const timestampSchema = z.number().int().nonnegative();
const DAY_KEY = /^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function isDayKey(value: string) {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dayKeySchema = z.string().refine(isDayKey, 'Некорректная дата');

const taskColorSchema = z.enum(['blue', 'yellow', 'purple', 'rose']);
const noteColorSchema = z.enum(['teal', 'purple', 'white', 'red']);
export const noteAttachmentMimeTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
export const NOTE_ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;
export const NOTE_ATTACHMENT_MAX_COUNT = 100;

const intervalSchema = z.looseObject({
  start: timestampSchema,
  end: timestampSchema.optional(),
});

const intervalsSchema = z
  .array(intervalSchema)
  .max(10_000)
  .superRefine((intervals, context) => {
    intervals.forEach((interval, index) => {
      if (interval.end !== undefined && interval.end < interval.start)
        context.addIssue({
          code: 'custom',
          path: [index, 'end'],
          message: 'Конец интервала не может быть раньше начала',
        });
      if (interval.end === undefined && index !== intervals.length - 1)
        context.addIssue({
          code: 'custom',
          path: [index, 'end'],
          message: 'Открытым может быть только последний интервал',
        });
      const previousEnd = intervals[index - 1]?.end;
      if (previousEnd !== undefined && interval.start < previousEnd)
        context.addIssue({
          code: 'custom',
          path: [index, 'start'],
          message: 'Интервалы должны идти по порядку',
        });
    });
  });

const completedIntervalsSchema = intervalsSchema.superRefine(
  (intervals, context) => {
    intervals.forEach((interval, index) => {
      if (interval.end === undefined)
        context.addIssue({
          code: 'custom',
          path: [index, 'end'],
          message: 'Завершённый интервал должен иметь конец',
        });
    });
  },
);

const plannedTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const dayWindowSchema = z
  .object({
    start: plannedTimeSchema.optional(),
    end: plannedTimeSchema.optional(),
  })
  .refine(
    ({ start, end }) => !start || !end || end > start,
    'Конец должен быть позже начала',
  );

const taskSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  intervals: intervalsSchema,
  color: taskColorSchema.optional(),
  backlogGroupId: idSchema.optional(),
  plannedStart: plannedTimeSchema.optional(),
  source: z
    .looseObject({
      noteId: idSchema,
      snapshot: z.string().max(100_000),
    })
    .optional(),
});

const historyItemSchema = z.looseObject({
  id: idSchema,
  taskId: idSchema,
  text: z.string().max(100_000),
  finishedAt: timestampSchema,
  finishedDay: dayKeySchema.optional(),
  intervals: completedIntervalsSchema,
});

const noteAttachmentSchema = z.looseObject({
  id: idSchema,
  mimeType: noteAttachmentMimeTypeSchema,
  size: z.number().int().nonnegative().max(NOTE_ATTACHMENT_MAX_BYTES),
  createdAt: timestampSchema,
});

const noteSchema = z.looseObject({
  id: idSchema,
  title: z.string().max(10_000),
  content: z.string().max(1_000_000),
  color: noteColorSchema,
  pinned: z.boolean().optional(),
  attachments: z
    .array(noteAttachmentSchema)
    .max(NOTE_ATTACHMENT_MAX_COUNT)
    .optional(),
});

const ruleSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(10_000),
});

const reviewPeriodSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('week'), key: dayKeySchema }),
  z.object({
    kind: z.literal('month'),
    key: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  z.object({ kind: z.literal('year'), key: z.string().regex(/^\d{4}$/) }),
]);

const goalSchema = z.looseObject({
  id: idSchema,
  period: reviewPeriodSchema,
  text: z.string().max(100_000),
});

const reviewResultSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  included: z.boolean(),
  sourceHistoryItemId: idSchema.optional(),
});

const periodReviewSchema = z.looseObject({
  id: idSchema,
  period: reviewPeriodSchema,
  results: z.array(reviewResultSchema).max(100_000),
  goalSnapshot: z.array(z.string().max(100_000)).max(10_000),
  status: z.enum(['draft', 'completed']),
  createdAt: timestampSchema,
  completedAt: timestampSchema.optional(),
});

const taskGroupSchema = z.looseObject({
  id: idSchema,
  title: z.string().max(10_000),
  content: z.string().max(1_000_000).optional(),
  color: taskColorSchema.optional(),
  tasks: z.array(taskSchema).max(100_000),
});

const monthTemplateScheduleSchema = z.discriminatedUnion('kind', [
  z.looseObject({
    kind: z.literal('weekly'),
    weekday: z.number().int().min(0).max(6),
  }),
  z.looseObject({
    kind: z.literal('fortnightly'),
    anchorDay: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/),
  }),
  z.looseObject({
    kind: z.literal('annual'),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
]);

const monthTemplateRuleSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  color: taskColorSchema.optional(),
  schedule: monthTemplateScheduleSchema,
});

const monthPlanningSchema = z.looseObject({
  rules: z.array(monthTemplateRuleSchema).max(10_000),
  createdMonths: z
    .array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/))
    .max(10_000),
});

export const appDataSchema = z.looseObject({
  version: z.number().int().positive(),
  /** Historical ids of one-time imports applied by older releases. */
  appliedImports: z.array(z.string().max(500)).max(10_000).optional(),
  schedule: z.record(dayKeySchema, z.array(taskSchema).max(100_000)),
  backlog: z.array(taskGroupSchema).max(10_000).optional(),
  monthPlanning: monthPlanningSchema.optional(),
  dayWindows: z.record(z.string(), dayWindowSchema).optional(),
  rules: z.array(ruleSchema).max(100).optional(),
  reviewTrackingStartedOn: dayKeySchema.optional(),
  goals: z.array(goalSchema).max(100_000).optional(),
  reviews: z.array(periodReviewSchema).max(10_000).optional(),
  notes: z.array(noteSchema).max(100_000),
  history: z.array(historyItemSchema).max(1_000_000),
});

export type TaskColor = z.infer<typeof taskColorSchema>;
export type Task = z.infer<typeof taskSchema>;
export type HistoryItem = z.infer<typeof historyItemSchema>;
export type NoteAttachmentMimeType = z.infer<
  typeof noteAttachmentMimeTypeSchema
>;
export type NoteAttachment = z.infer<typeof noteAttachmentSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type ReviewPeriod = z.infer<typeof reviewPeriodSchema>;
export type ReviewPeriodKind = ReviewPeriod['kind'];
export type Goal = z.infer<typeof goalSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export type PeriodReview = z.infer<typeof periodReviewSchema>;
export type TaskGroup = z.infer<typeof taskGroupSchema>;
export type MonthTemplateSchedule = z.infer<typeof monthTemplateScheduleSchema>;
export type MonthTemplateRule = z.infer<typeof monthTemplateRuleSchema>;
export type MonthPlanning = z.infer<typeof monthPlanningSchema>;
export type AppData = z.infer<typeof appDataSchema>;
