import type {
  AppData,
  HistoryItem,
  MonthTemplateRule,
  Note,
  Rule,
  Task,
  TaskGroup,
} from '../data';
import type {
  InvariantConflict,
  MergeConflict,
  MergeResult,
  OrderContainer,
  SyncEntityKind,
  TaskLocation,
} from './types';

type MergeSource = 'base' | 'local' | 'remote' | 'merged';
type Entity = { id: string } & Record<string, unknown>;

type TaskRecord = Entity & {
  text: string;
  intervals: Task['intervals'];
  color: Task['color'];
  backlogGroupId: Task['backlogGroupId'];
  source: Task['source'];
  plannedStart: Task['plannedStart'];
  location: TaskLocation;
};

type GroupRecord = Entity & { title: string; color?: TaskGroup['color'] };

type IndexedData = {
  tasks: Map<string, TaskRecord>;
  taskOrders: Map<string, string[]>;
  groups: Map<string, GroupRecord>;
  groupOrder: string[];
  rules: Map<string, Rule & Entity>;
  ruleOrder: string[];
  notes: Map<string, Note & Entity>;
  noteOrder: string[];
  history: Map<string, HistoryItem & Entity>;
  historyOrder: string[];
  monthTemplateRules: Map<string, MonthTemplateRule & Entity>;
  monthTemplateRuleOrder: string[];
};

const TASK_FIELDS = [
  'text',
  'intervals',
  'color',
  'backlogGroupId',
  'source',
  'location',
  'plannedStart',
] as const;
const GROUP_FIELDS = ['title', 'color'] as const;
const RULE_FIELDS = ['text'] as const;
const NOTE_FIELDS = ['title', 'content', 'color', 'pinned'] as const;
const HISTORY_FIELDS = ['taskId', 'text', 'finishedAt', 'intervals'] as const;
const MONTH_TEMPLATE_RULE_FIELDS = ['text', 'color', 'schedule'] as const;

export function mergeAppData(input: {
  base: AppData;
  local: AppData;
  remote: AppData;
}): MergeResult {
  const inputConflicts = [
    ...validateAppData(input.base, 'base'),
    ...validateAppData(input.local, 'local'),
    ...validateAppData(input.remote, 'remote'),
  ];
  if (inputConflicts.length > 0)
    return { ok: false, conflicts: inputConflicts };

  const base = indexData(input.base);
  const local = indexData(input.local);
  const remote = indexData(input.remote);
  const conflicts: MergeConflict[] = [];

  const windowRecords = (data: AppData) =>
    new Map(
      Object.entries(data.dayWindows ?? {}).map(([id, window]) => [
        id,
        { id, window },
      ]),
    );
  const dayWindows = mergeEntityMaps(
    'dayWindow',
    ['window'],
    windowRecords(input.base),
    windowRecords(input.local),
    windowRecords(input.remote),
    conflicts,
  );

  const groups = mergeEntityMaps(
    'taskGroup',
    GROUP_FIELDS,
    base.groups,
    local.groups,
    remote.groups,
    conflicts,
  );
  const tasks = mergeEntityMaps(
    'task',
    TASK_FIELDS,
    base.tasks,
    local.tasks,
    remote.tasks,
    conflicts,
  );
  const notes = mergeEntityMaps(
    'note',
    NOTE_FIELDS,
    base.notes,
    local.notes,
    remote.notes,
    conflicts,
  );
  const rules = mergeEntityMaps(
    'rule',
    RULE_FIELDS,
    base.rules,
    local.rules,
    remote.rules,
    conflicts,
  );
  const history = mergeEntityMaps(
    'historyItem',
    HISTORY_FIELDS,
    base.history,
    local.history,
    remote.history,
    conflicts,
  );
  const monthTemplateRules = mergeEntityMaps(
    'monthTemplateRule',
    MONTH_TEMPLATE_RULE_FIELDS,
    base.monthTemplateRules,
    local.monthTemplateRules,
    remote.monthTemplateRules,
    conflicts,
  );

  if (conflicts.length > 0) return { ok: false, conflicts };

  for (const task of tasks.values()) {
    if (
      task.location.kind === 'backlog' &&
      !groups.has(task.location.groupId)
    ) {
      conflicts.push({
        kind: 'invariant',
        source: 'merged',
        code: 'missing_backlog_group',
        entityId: task.id,
        message: `Task ${task.id} points to missing backlog group ${task.location.groupId}`,
      });
    }
  }
  if (conflicts.length > 0) return { ok: false, conflicts };

  const groupOrder = mergeOrder(
    { kind: 'backlogGroups' },
    filterEntityOrder(base.groupOrder, base.groups, groups),
    filterEntityOrder(local.groupOrder, local.groups, groups),
    filterEntityOrder(remote.groupOrder, remote.groups, groups),
    conflicts,
  );
  const noteOrder = mergeOrder(
    { kind: 'notes' },
    filterEntityOrder(base.noteOrder, base.notes, notes),
    filterEntityOrder(local.noteOrder, local.notes, notes),
    filterEntityOrder(remote.noteOrder, remote.notes, notes),
    conflicts,
  );
  const ruleOrder = mergeOrder(
    { kind: 'rules' },
    filterEntityOrder(base.ruleOrder, base.rules, rules),
    filterEntityOrder(local.ruleOrder, local.rules, rules),
    filterEntityOrder(remote.ruleOrder, remote.rules, rules),
    conflicts,
  );
  const historyOrder = mergeOrder(
    { kind: 'history' },
    filterEntityOrder(base.historyOrder, base.history, history),
    filterEntityOrder(local.historyOrder, local.history, history),
    filterEntityOrder(remote.historyOrder, remote.history, history),
    conflicts,
  );
  const monthTemplateRuleOrder = mergeOrder(
    { kind: 'monthTemplateRules' },
    filterEntityOrder(
      base.monthTemplateRuleOrder,
      base.monthTemplateRules,
      monthTemplateRules,
    ),
    filterEntityOrder(
      local.monthTemplateRuleOrder,
      local.monthTemplateRules,
      monthTemplateRules,
    ),
    filterEntityOrder(
      remote.monthTemplateRuleOrder,
      remote.monthTemplateRules,
      monthTemplateRules,
    ),
    conflicts,
  );

  const containerKeys = new Set([
    ...base.taskOrders.keys(),
    ...local.taskOrders.keys(),
    ...remote.taskOrders.keys(),
    ...[...tasks.values()].map((task) => locationKey(task.location)),
  ]);
  const taskOrders = new Map<string, string[]>();
  for (const key of [...containerKeys].sort()) {
    taskOrders.set(
      key,
      mergeOrder(
        keyToContainer(key),
        filterTaskOrder(base, tasks, key),
        filterTaskOrder(local, tasks, key),
        filterTaskOrder(remote, tasks, key),
        conflicts,
      ),
    );
  }

  if (conflicts.length > 0) return { ok: false, conflicts };

  const schedule: Record<string, Task[]> = {};
  for (const key of [...containerKeys].sort()) {
    if (!key.startsWith('schedule:')) continue;
    const day = key.slice('schedule:'.length);
    schedule[day] = (taskOrders.get(key) ?? []).map((id) =>
      taskFromRecord(tasks.get(id)!),
    );
  }

  const backlog = groupOrder.map((id): TaskGroup => {
    const group = groups.get(id)!;
    const key = locationKey({ kind: 'backlog', groupId: id });
    return {
      id,
      title: group.title,
      color: group.color,
      tasks: (taskOrders.get(key) ?? []).map((taskId) => ({
        ...taskFromRecord(tasks.get(taskId)!),
        backlogGroupId: id,
      })),
    };
  });

  const data: AppData = {
    version: Math.max(
      input.base.version,
      input.local.version,
      input.remote.version,
    ),
    appliedImports: unionStrings(
      input.base.appliedImports,
      input.local.appliedImports,
      input.remote.appliedImports,
    ),
    schedule,
    dayWindows: Object.fromEntries(
      [...dayWindows].map(([id, record]) => [id, record.window]),
    ),
    backlog,
    rules: ruleOrder.map((id) => cloneValue(rules.get(id)!)) as Rule[],
    monthPlanning: {
      rules: monthTemplateRuleOrder.map((id) =>
        cloneValue(monthTemplateRules.get(id)!),
      ) as MonthTemplateRule[],
      createdMonths: unionStrings(
        input.base.monthPlanning?.createdMonths,
        input.local.monthPlanning?.createdMonths,
        input.remote.monthPlanning?.createdMonths,
      ).sort(),
    },
    notes: noteOrder.map((id) => cloneValue(notes.get(id)!)) as Note[],
    history: historyOrder.map((id) =>
      cloneValue(history.get(id)!),
    ) as HistoryItem[],
  };

  const mergedConflicts = validateAppData(data, 'merged');
  const outputTaskCounts = countActiveTasks(data);
  for (const id of tasks.keys()) {
    if ((outputTaskCounts.get(id) ?? 0) === 0) {
      mergedConflicts.push({
        kind: 'invariant',
        source: 'merged',
        code: 'task_not_in_exactly_one_container',
        entityId: id,
        message: `Task ${id} was not placed in a schedule day or backlog group`,
      });
    }
  }
  return mergedConflicts.length > 0
    ? { ok: false, conflicts: mergedConflicts }
    : { ok: true, data };
}

export function validateAppData(
  data: AppData,
  source: MergeSource = 'merged',
): InvariantConflict[] {
  const conflicts: InvariantConflict[] = [];
  const taskCounts = countActiveTasks(data);

  for (const [id, count] of taskCounts) {
    if (count > 1) {
      conflicts.push({
        kind: 'invariant',
        source,
        code: 'duplicate_task_id',
        entityId: id,
        message: `Task ${id} appears ${count} times`,
      });
      conflicts.push({
        kind: 'invariant',
        source,
        code: 'task_not_in_exactly_one_container',
        entityId: id,
        message: `Task ${id} must appear in exactly one schedule day or backlog group`,
      });
    }
  }

  collectDuplicateIds(
    data.backlog ?? [],
    'duplicate_task_group_id',
    source,
    conflicts,
  );
  collectDuplicateIds(data.notes, 'duplicate_note_id', source, conflicts);
  collectDuplicateIds(data.rules ?? [], 'duplicate_rule_id', source, conflicts);
  collectDuplicateIds(
    data.history,
    'duplicate_history_item_id',
    source,
    conflicts,
  );
  collectDuplicateIds(
    data.monthPlanning?.rules ?? [],
    'duplicate_month_template_rule_id',
    source,
    conflicts,
  );
  return conflicts;
}

function countActiveTasks(data: AppData): Map<string, number> {
  const counts = new Map<string, number>();
  const count = (task: Task) =>
    counts.set(task.id, (counts.get(task.id) ?? 0) + 1);
  for (const tasks of Object.values(data.schedule)) tasks.forEach(count);
  for (const group of data.backlog ?? []) group.tasks.forEach(count);
  return counts;
}

function indexData(data: AppData): IndexedData {
  const tasks = new Map<string, TaskRecord>();
  const taskOrders = new Map<string, string[]>();
  const groups = new Map<string, GroupRecord>();

  for (const [day, dayTasks] of Object.entries(data.schedule)) {
    const key = locationKey({ kind: 'schedule', day });
    taskOrders.set(
      key,
      dayTasks.map((task) => task.id),
    );
    for (const task of dayTasks)
      tasks.set(task.id, taskRecord(task, { kind: 'schedule', day }));
  }

  for (const group of data.backlog ?? []) {
    groups.set(group.id, {
      id: group.id,
      title: group.title,
      color: group.color,
    });
    const location: TaskLocation = { kind: 'backlog', groupId: group.id };
    taskOrders.set(
      locationKey(location),
      group.tasks.map((task) => task.id),
    );
    for (const task of group.tasks)
      tasks.set(task.id, taskRecord(task, location));
  }

  return {
    tasks,
    taskOrders,
    groups,
    groupOrder: (data.backlog ?? []).map((group) => group.id),
    rules: new Map(
      (data.rules ?? []).map((rule) => [rule.id, rule as Rule & Entity]),
    ),
    ruleOrder: (data.rules ?? []).map((rule) => rule.id),
    notes: new Map(data.notes.map((note) => [note.id, note as Note & Entity])),
    noteOrder: data.notes.map((note) => note.id),
    history: new Map(
      data.history.map((item) => [item.id, item as HistoryItem & Entity]),
    ),
    historyOrder: data.history.map((item) => item.id),
    monthTemplateRules: new Map(
      (data.monthPlanning?.rules ?? []).map((rule) => [
        rule.id,
        rule as MonthTemplateRule & Entity,
      ]),
    ),
    monthTemplateRuleOrder: (data.monthPlanning?.rules ?? []).map(
      (rule) => rule.id,
    ),
  };
}

function taskRecord(task: Task, location: TaskLocation): TaskRecord {
  return {
    id: task.id,
    text: task.text,
    intervals: cloneValue(task.intervals),
    color: task.color,
    backlogGroupId: task.backlogGroupId,
    source: cloneValue(task.source),
    plannedStart: task.plannedStart,
    location,
  };
}

function taskFromRecord(record: TaskRecord): Task {
  return {
    id: record.id,
    text: record.text,
    ...(record.plannedStart === undefined
      ? {}
      : { plannedStart: record.plannedStart }),
    intervals: cloneValue(record.intervals),
    ...(record.color === undefined ? {} : { color: record.color }),
    ...(record.backlogGroupId === undefined
      ? {}
      : { backlogGroupId: record.backlogGroupId }),
    ...(record.source === undefined
      ? {}
      : { source: cloneValue(record.source) }),
  };
}

function mergeEntityMaps<T extends Entity>(
  entity: SyncEntityKind,
  fields: readonly string[],
  base: Map<string, T>,
  local: Map<string, T>,
  remote: Map<string, T>,
  conflicts: MergeConflict[],
): Map<string, T> {
  const merged = new Map<string, T>();
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);

  for (const id of ids) {
    const baseValue = base.get(id);
    const localValue = local.get(id);
    const remoteValue = remote.get(id);

    if (!baseValue) {
      if (localValue && remoteValue) {
        if (isDeepEqual(localValue, remoteValue))
          merged.set(id, cloneValue(localValue));
        else
          conflicts.push({
            kind: 'entity',
            entity,
            entityId: id,
            reason: 'concurrent_add',
            base: undefined,
            local: cloneValue(localValue),
            remote: cloneValue(remoteValue),
          });
      } else if (localValue || remoteValue) {
        merged.set(id, cloneValue((localValue ?? remoteValue)!));
      }
      continue;
    }

    if (!localValue && !remoteValue) continue;
    if (!localValue || !remoteValue) {
      const surviving = (localValue ?? remoteValue)!;
      if (!isDeepEqual(surviving, baseValue)) {
        conflicts.push({
          kind: 'entity',
          entity,
          entityId: id,
          reason: 'delete_vs_edit',
          base: cloneValue(baseValue),
          local: cloneValue(localValue),
          remote: cloneValue(remoteValue),
        });
      }
      continue;
    }

    const value: Entity = { id };
    for (const field of fields) {
      const mergedField = mergeField(
        baseValue[field],
        localValue[field],
        remoteValue[field],
      );
      if (mergedField.ok) value[field] = cloneValue(mergedField.value);
      else {
        conflicts.push({
          kind: 'field',
          entity,
          entityId: id,
          field,
          base: cloneValue(baseValue[field]),
          local: cloneValue(localValue[field]),
          remote: cloneValue(remoteValue[field]),
        });
      }
    }
    merged.set(id, value as T);
  }

  return merged;
}

function mergeField(
  base: unknown,
  local: unknown,
  remote: unknown,
): { ok: true; value: unknown } | { ok: false } {
  if (isDeepEqual(local, remote)) return { ok: true, value: local };
  if (isDeepEqual(local, base)) return { ok: true, value: remote };
  if (isDeepEqual(remote, base)) return { ok: true, value: local };
  return { ok: false };
}

function mergeOrder(
  container: OrderContainer,
  base: string[],
  local: string[],
  remote: string[],
  conflicts: MergeConflict[],
): string[] {
  if (isDeepEqual(local, remote)) return [...local];
  if (isDeepEqual(local, base)) return [...remote];
  if (isDeepEqual(remote, base)) return [...local];
  const insertions = mergeConcurrentInsertions(base, local, remote);
  if (insertions) return insertions;
  conflicts.push({
    kind: 'order',
    container,
    base: [...base],
    local: [...local],
    remote: [...remote],
  });
  return [...base];
}

/**
 * Merge additions made independently without guessing about concurrent moves.
 * Existing ids must retain the base order on both sides. New ids are merged
 * inside the gap where they were inserted, preserving each side's own order.
 */
function mergeConcurrentInsertions(
  base: string[],
  local: string[],
  remote: string[],
): string[] | null {
  const baseIds = new Set(base);
  if (
    !isDeepEqual(
      local.filter((id) => baseIds.has(id)),
      base,
    ) ||
    !isDeepEqual(
      remote.filter((id) => baseIds.has(id)),
      base,
    )
  )
    return null;

  const localGaps = additionsByGap(local, baseIds, base.length + 1);
  const remoteGaps = additionsByGap(remote, baseIds, base.length + 1);
  const localGapById = gapById(localGaps);
  const remoteGapById = gapById(remoteGaps);
  for (const [id, localGap] of localGapById) {
    const remoteGap = remoteGapById.get(id);
    if (remoteGap !== undefined && remoteGap !== localGap) return null;
  }

  const result: string[] = [];
  for (let gap = 0; gap < localGaps.length; gap += 1) {
    const additions = mergeInsertionSequence(localGaps[gap], remoteGaps[gap]);
    if (!additions) return null;
    result.push(...additions);
    if (gap < base.length) result.push(base[gap]);
  }
  return result;
}

function additionsByGap(
  order: string[],
  baseIds: Set<string>,
  gapCount: number,
) {
  const gaps = Array.from({ length: gapCount }, () => [] as string[]);
  let gap = 0;
  for (const id of order) {
    if (baseIds.has(id)) gap += 1;
    else gaps[gap].push(id);
  }
  return gaps;
}

function gapById(gaps: string[][]) {
  const result = new Map<string, number>();
  gaps.forEach((ids, gap) => ids.forEach((id) => result.set(id, gap)));
  return result;
}

function mergeInsertionSequence(local: string[], remote: string[]) {
  const ids = [...new Set([...local, ...remote])];
  const edges = new Map(ids.map((id) => [id, new Set<string>()]));
  const indegree = new Map(ids.map((id) => [id, 0]));

  for (const sequence of [local, remote]) {
    for (let index = 1; index < sequence.length; index += 1) {
      const before = sequence[index - 1];
      const after = sequence[index];
      if (before === after || edges.get(before)!.has(after)) continue;
      edges.get(before)!.add(after);
      indegree.set(after, indegree.get(after)! + 1);
    }
  }

  const ready = ids.filter((id) => indegree.get(id) === 0).sort();
  const result: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(id);
    for (const after of edges.get(id)!) {
      const next = indegree.get(after)! - 1;
      indegree.set(after, next);
      if (next === 0) {
        ready.push(after);
        ready.sort();
      }
    }
  }
  return result.length === ids.length ? result : null;
}

function filterEntityOrder<T extends Entity>(
  order: string[],
  source: Map<string, T>,
  merged: Map<string, T>,
): string[] {
  return order.filter((id) => source.has(id) && merged.has(id));
}

function filterTaskOrder(
  source: IndexedData,
  merged: Map<string, TaskRecord>,
  key: string,
): string[] {
  return (source.taskOrders.get(key) ?? []).filter(
    (id) =>
      source.tasks.has(id) &&
      merged.has(id) &&
      locationKey(merged.get(id)!.location) === key,
  );
}

function locationKey(location: TaskLocation): string {
  return location.kind === 'schedule'
    ? `schedule:${location.day}`
    : `backlog:${location.groupId}`;
}

function keyToContainer(key: string): OrderContainer {
  return key.startsWith('schedule:')
    ? { kind: 'schedule', day: key.slice('schedule:'.length) }
    : { kind: 'backlog', groupId: key.slice('backlog:'.length) };
}

function unionStrings(...values: Array<string[] | undefined>): string[] {
  return [...new Set(values.flatMap((value) => value ?? []))];
}

function collectDuplicateIds(
  entities: Array<{ id: string }>,
  code: InvariantConflict['code'],
  source: MergeSource,
  conflicts: InvariantConflict[],
) {
  const seen = new Set<string>();
  for (const entity of entities) {
    if (seen.has(entity.id)) {
      conflicts.push({
        kind: 'invariant',
        source,
        code,
        entityId: entity.id,
        message: `Duplicate ${entity.id}`,
      });
    }
    seen.add(entity.id);
  }
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => isDeepEqual(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      isDeepEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => isDeepEqual(left[key], right[key]))
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as T;
  }
  return value;
}
