import { z } from 'zod';

const idSchema = z.string().min(1).max(160);
const timestampSchema = z.number().int().nonnegative();

export const taskColorSchema = z.enum(['blue', 'yellow', 'purple', 'rose']);
export const noteColorSchema = z.enum(['teal', 'purple', 'white', 'red']);

export const intervalSchema = z.looseObject({
  start: timestampSchema,
  end: timestampSchema.optional(),
});

export const plannedTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const dayWindowSchema = z
  .object({
    start: plannedTimeSchema.optional(),
    end: plannedTimeSchema.optional(),
  })
  .refine(
    ({ start, end }) => !start || !end || end > start,
    'Конец должен быть позже начала',
  );

export const taskSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  intervals: z.array(intervalSchema).max(10_000),
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

export const historyItemSchema = z.looseObject({
  id: idSchema,
  taskId: idSchema,
  text: z.string().max(100_000),
  finishedAt: timestampSchema,
  intervals: z.array(intervalSchema).max(10_000),
});

export const noteSchema = z.looseObject({
  id: idSchema,
  title: z.string().max(10_000),
  content: z.string().max(1_000_000),
  color: noteColorSchema,
  pinned: z.boolean().optional(),
});

export const ruleSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(10_000),
});

export const taskGroupSchema = z.looseObject({
  id: idSchema,
  title: z.string().max(10_000),
  color: taskColorSchema.optional(),
  tasks: z.array(taskSchema).max(100_000),
});

export const monthTemplateScheduleSchema = z.discriminatedUnion('kind', [
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

export const monthTemplateRuleSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  color: taskColorSchema.optional(),
  schedule: monthTemplateScheduleSchema,
});

export const monthPlanningSchema = z.looseObject({
  rules: z.array(monthTemplateRuleSchema).max(10_000),
  createdMonths: z
    .array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/))
    .max(10_000),
});

export const appDataSchema = z.looseObject({
  version: z.number().int().positive(),
  /** Historical ids of one-time imports applied by older releases. */
  appliedImports: z.array(z.string().max(500)).max(10_000).optional(),
  schedule: z.record(z.string(), z.array(taskSchema).max(100_000)),
  backlog: z.array(taskGroupSchema).max(10_000).optional(),
  monthPlanning: monthPlanningSchema.optional(),
  dayWindows: z.record(z.string(), dayWindowSchema).optional(),
  rules: z.array(ruleSchema).max(100).optional(),
  notes: z.array(noteSchema).max(100_000),
  history: z.array(historyItemSchema).max(1_000_000),
});

export type Interval = z.infer<typeof intervalSchema>;
export type TaskColor = z.infer<typeof taskColorSchema>;
export type Task = z.infer<typeof taskSchema>;
export type HistoryItem = z.infer<typeof historyItemSchema>;
export type NoteColor = z.infer<typeof noteColorSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type TaskGroup = z.infer<typeof taskGroupSchema>;
export type MonthTemplateSchedule = z.infer<typeof monthTemplateScheduleSchema>;
export type MonthTemplateRule = z.infer<typeof monthTemplateRuleSchema>;
export type MonthPlanning = z.infer<typeof monthPlanningSchema>;
export type AppData = z.infer<typeof appDataSchema>;
