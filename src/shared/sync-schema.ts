import { z } from 'zod';

import { appDataSchema, type AppData } from './data-schema.js';

export { appDataSchema } from './data-schema.js';
export type SyncAppData = AppData;

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
  data: AppData | null;
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
