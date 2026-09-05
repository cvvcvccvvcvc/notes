import { z } from 'zod';

const idSchema = z.string().min(1).max(160);
const timestampSchema = z.number().int().nonnegative();

export const intervalSchema = z.looseObject({
  start: timestampSchema,
  end: timestampSchema.optional(),
});

export const taskSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  intervals: z.array(intervalSchema).max(10_000),
  color: z.enum(['blue', 'yellow', 'purple', 'rose']).optional(),
  backlogGroupId: idSchema.optional(),
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
  color: z.enum(['teal', 'purple', 'white', 'red']),
  pinned: z.boolean().optional(),
});

export const taskGroupSchema = z.looseObject({
  id: idSchema,
  title: z.string().max(10_000),
  color: z.enum(['blue', 'yellow', 'purple', 'rose']).optional(),
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

export const monthTemplateRuleSchema = z.looseObject({
  id: idSchema,
  text: z.string().max(100_000),
  color: z.enum(['blue', 'yellow', 'purple', 'rose']).optional(),
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
  appliedImports: z.array(z.string().max(500)).max(10_000).optional(),
  schedule: z.record(z.string(), z.array(taskSchema).max(100_000)),
  backlog: z.array(taskGroupSchema).max(10_000).optional(),
  monthPlanning: monthPlanningSchema.optional(),
  notes: z.array(noteSchema).max(100_000),
  history: z.array(historyItemSchema).max(1_000_000),
});

export type SyncAppData = z.infer<typeof appDataSchema>;

export const syncPutSchema = z
  .strictObject({
    requestId: z.uuid(),
    baseRevision: z.number().int().nonnegative(),
    data: appDataSchema,
  })
  .strict();

export type SyncPutRequest = z.infer<typeof syncPutSchema>;

export type SyncSnapshot = {
  revision: number;
  data: SyncAppData | null;
};

export type SyncPutSuccess = {
  ok: true;
  revision: number;
};

export type SyncConflict = {
  ok: false;
  error: {
    code: 'REVISION_CONFLICT' | 'REQUEST_ID_REUSED';
    message: string;
  };
  remote: SyncSnapshot;
};

export type SyncPutResponse = SyncPutSuccess | SyncConflict;
