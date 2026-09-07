import type { AppData } from '../data';

/** Monotonic server revision. Clients compare it but never generate it. */
export type SyncRevision = number;

export type RemoteSnapshot = {
  revision: SyncRevision;
  data: AppData | null;
};

export type SyncGetResponse = RemoteSnapshot;

export type SyncPutRequest = {
  requestId: string;
  baseRevision: SyncRevision;
  data: AppData;
};

export type SyncPutSuccess = {
  ok: true;
  revision: SyncRevision;
};

/** Body returned with HTTP 409 when baseRevision is no longer current. */
export type SyncPutConflict = {
  ok: false;
  error: {
    code: 'REVISION_CONFLICT' | 'REQUEST_ID_REUSED';
    message: string;
  };
  remote: RemoteSnapshot;
};

export type SyncConflictState = {
  remote: RemoteSnapshot;
  conflicts: MergeConflict[];
};

export type SyncMeta = {
  schemaVersion: 1;
  /** Revision represented by base. Null means this device has never synced. */
  baseRevision: SyncRevision | null;
  /** Last server state acknowledged by this device; required for three-way merge. */
  base: AppData | null;
  dirty: boolean;
  pending?: SyncPutRequest;
  conflict?: SyncConflictState;
};

/** Persisted locally as one unit so data and its merge base cannot drift apart. */
export type SyncEnvelope = {
  data: AppData;
  sync: SyncMeta;
};

export type TaskLocation =
  | { kind: 'schedule'; day: string }
  | { kind: 'backlog'; groupId: string };

export type SyncEntityKind =
  | 'task'
  | 'dayWindow'
  | 'taskGroup'
  | 'rule'
  | 'goal'
  | 'periodReview'
  | 'note'
  | 'historyItem'
  | 'monthTemplateRule';

export type EntityConflict = {
  kind: 'entity';
  entity: SyncEntityKind;
  entityId: string;
  reason: 'concurrent_add' | 'delete_vs_edit';
  base: unknown;
  local: unknown;
  remote: unknown;
};

export type FieldConflict = {
  kind: 'field';
  entity: SyncEntityKind;
  entityId: string;
  field: string;
  base: unknown;
  local: unknown;
  remote: unknown;
};

export type OrderContainer =
  | { kind: 'schedule'; day: string }
  | { kind: 'backlog'; groupId: string }
  | { kind: 'backlogGroups' }
  | { kind: 'rules' }
  | { kind: 'goals' }
  | { kind: 'reviews' }
  | { kind: 'notes' }
  | { kind: 'history' }
  | { kind: 'monthTemplateRules' };

export type OrderConflict = {
  kind: 'order';
  container: OrderContainer;
  base: string[];
  local: string[];
  remote: string[];
};

export type InvariantConflict = {
  kind: 'invariant';
  source: 'base' | 'local' | 'remote' | 'merged';
  code:
    | 'duplicate_task_id'
    | 'task_not_in_exactly_one_container'
    | 'duplicate_task_group_id'
    | 'duplicate_rule_id'
    | 'duplicate_goal_id'
    | 'duplicate_review_id'
    | 'duplicate_review_result_id'
    | 'duplicate_review_period'
    | 'duplicate_note_id'
    | 'duplicate_history_item_id'
    | 'duplicate_month_template_rule_id'
    | 'missing_backlog_group';
  entityId: string;
  message: string;
};

export type MergeConflict =
  | EntityConflict
  | FieldConflict
  | OrderConflict
  | InvariantConflict;

export type MergeResult =
  | { ok: true; data: AppData }
  | { ok: false; conflicts: MergeConflict[] };
