/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData, Task } from '../data.ts';
import { mergeAppData, validateAppData } from './merge.ts';

function task(id: string, text = id): Task {
  return { id, text, intervals: [] };
}

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    schedule: { '2026-09-05': [task('a', 'Base')] },
    backlog: [{ id: 'general', title: 'Без группы', tasks: [] }],
    notes: [],
    history: [],
    ...overrides,
  };
}

function merged(result: ReturnType<typeof mergeAppData>): AppData {
  if (!result.ok) throw new Error(JSON.stringify(result.conflicts));
  return result.data;
}

void test('merges independent fields of the same task', () => {
  const base = data();
  const local = data({
    schedule: { '2026-09-05': [{ ...task('a', 'Local text'), intervals: [] }] },
  });
  const remote = data({
    schedule: {
      '2026-09-05': [{ ...task('a', 'Base'), color: 'blue', intervals: [] }],
    },
  });

  assert.deepEqual(
    merged(mergeAppData({ base, local, remote })).schedule['2026-09-05'][0],
    {
      id: 'a',
      text: 'Local text',
      intervals: [],
      color: 'blue',
    },
  );
});

void test('preserves fields introduced by a newer data version', () => {
  const baseTask = { ...task('a', 'Base'), futureTaskField: 'base' };
  const baseGroup = {
    id: 'general',
    title: 'Без группы',
    tasks: [],
    futureGroupField: 'base',
  };
  const base = {
    ...data({
      schedule: { '2026-09-05': [baseTask] },
      backlog: [baseGroup],
      monthPlanning: {
        rules: [],
        createdMonths: [],
        futurePlanningField: 'base',
      },
    }),
    futureRootField: 'base',
  } as AppData;
  const local = structuredClone(base);
  local.schedule['2026-09-05'][0].text = 'Local text';
  local.backlog![0].title = 'Local title';
  const remote = structuredClone(base) as AppData & {
    futureRootField: string;
  };
  remote.futureRootField = 'remote';
  (
    remote.schedule['2026-09-05'][0] as Task & {
      futureTaskField: string;
    }
  ).futureTaskField = 'remote';
  (remote.backlog![0] as typeof baseGroup).futureGroupField = 'remote';
  (
    remote.monthPlanning! as AppData['monthPlanning'] & {
      futurePlanningField: string;
    }
  ).futurePlanningField = 'remote';

  const result = merged(mergeAppData({ base, local, remote })) as AppData & {
    futureRootField: string;
  };

  assert.equal(result.futureRootField, 'remote');
  assert.equal(result.schedule['2026-09-05'][0].text, 'Local text');
  assert.equal(
    (
      result.schedule['2026-09-05'][0] as Task & {
        futureTaskField: string;
      }
    ).futureTaskField,
    'remote',
  );
  assert.equal(result.backlog![0].title, 'Local title');
  assert.equal(
    (result.backlog![0] as typeof baseGroup).futureGroupField,
    'remote',
  );
  assert.equal(
    (
      result.monthPlanning! as AppData['monthPlanning'] & {
        futurePlanningField: string;
      }
    ).futurePlanningField,
    'remote',
  );
});

void test('reports divergent edits to a field from a newer data version', () => {
  const base = { ...data(), futureRootField: 'base' } as AppData;
  const local = { ...base, futureRootField: 'local' } as AppData;
  const remote = { ...base, futureRootField: 'remote' } as AppData;

  const result = mergeAppData({ base, local, remote });

  assert.equal(result.ok, false);
  if (!result.ok)
    assert.deepEqual(result.conflicts[0], {
      kind: 'field',
      entity: 'appData',
      entityId: 'root',
      field: 'futureRootField',
      base: 'base',
      local: 'local',
      remote: 'remote',
    });
});

void test('merges independent task-group fields', () => {
  const base = data();
  const local = data({
    backlog: [
      { id: 'general', title: 'Без группы', color: 'yellow', tasks: [] },
    ],
  });
  const remote = data({
    backlog: [
      {
        id: 'general',
        title: 'Позже',
        content: 'Контекст проекта',
        tasks: [],
      },
    ],
  });

  assert.deepEqual(merged(mergeAppData({ base, local, remote })).backlog, [
    {
      id: 'general',
      title: 'Позже',
      content: 'Контекст проекта',
      color: 'yellow',
      tasks: [],
    },
  ]);
});

void test('merges a task move with a text edit without changing its id', () => {
  const original = { ...task('a', 'Base'), backlogGroupId: 'general' };
  const base = data({ schedule: { '2026-09-05': [original] } });
  const local = data({
    schedule: { '2026-09-05': [], '2026-09-06': [original] },
  });
  const remote = data({
    schedule: {
      '2026-09-05': [{ ...original, text: 'Edited remotely' }],
    },
  });

  const result = merged(mergeAppData({ base, local, remote }));
  assert.deepEqual(result.schedule['2026-09-05'], []);
  assert.equal(result.schedule['2026-09-06'][0].id, 'a');
  assert.equal(result.schedule['2026-09-06'][0].text, 'Edited remotely');
  assert.equal(result.schedule['2026-09-06'][0].backlogGroupId, 'general');
});

void test('merges a schedule-to-backlog move with an independent color edit', () => {
  const base = data();
  const local = data({
    schedule: { '2026-09-05': [] },
    backlog: [
      { id: 'general', title: 'Без группы', tasks: [task('a', 'Base')] },
    ],
  });
  const remote = data({
    schedule: { '2026-09-05': [{ ...task('a', 'Base'), color: 'purple' }] },
  });

  const result = merged(mergeAppData({ base, local, remote }));
  assert.deepEqual(result.schedule['2026-09-05'], []);
  assert.deepEqual(result.backlog?.[0].tasks[0], {
    id: 'a',
    text: 'Base',
    intervals: [],
    color: 'purple',
    backlogGroupId: 'general',
  });
});

void test('collapses identical edits and accepts delete versus unchanged', () => {
  const edited = data({ schedule: { '2026-09-05': [task('a', 'Same edit')] } });
  assert.equal(
    merged(mergeAppData({ base: data(), local: edited, remote: edited }))
      .schedule['2026-09-05'][0].text,
    'Same edit',
  );

  const deleted = data({ schedule: { '2026-09-05': [] } });
  assert.deepEqual(
    merged(mergeAppData({ base: data(), local: deleted, remote: data() }))
      .schedule['2026-09-05'],
    [],
  );
});

void test('reports delete versus edit and divergent field edits', () => {
  const deleted = data({ schedule: { '2026-09-05': [] } });
  const edited = data({ schedule: { '2026-09-05': [task('a', 'Edited')] } });
  const deleteEdit = mergeAppData({
    base: data(),
    local: deleted,
    remote: edited,
  });
  assert.equal(deleteEdit.ok, false);
  if (!deleteEdit.ok) {
    assert.equal(deleteEdit.conflicts[0].kind, 'entity');
    const conflict = deleteEdit.conflicts[0];
    if (conflict.kind === 'entity')
      assert.equal(conflict.reason, 'delete_vs_edit');
  }

  const divergent = mergeAppData({
    base: data(),
    local: data({ schedule: { '2026-09-05': [task('a', 'Local')] } }),
    remote: data({ schedule: { '2026-09-05': [task('a', 'Remote')] } }),
  });
  assert.equal(divergent.ok, false);
  if (!divergent.ok) {
    assert.deepEqual(
      divergent.conflicts.map(
        (conflict) => conflict.kind === 'field' && conflict.field,
      ),
      ['text'],
    );
  }
});

void test('reports divergent location and interval edits', () => {
  const location = mergeAppData({
    base: data(),
    local: data({
      schedule: { '2026-09-05': [], '2026-09-06': [task('a', 'Base')] },
    }),
    remote: data({
      schedule: { '2026-09-05': [], '2026-09-07': [task('a', 'Base')] },
    }),
  });
  assert.equal(location.ok, false);
  if (!location.ok) {
    assert.equal(location.conflicts[0].kind, 'field');
    const conflict = location.conflicts[0];
    if (conflict.kind === 'field') assert.equal(conflict.field, 'location');
  }

  const intervals = mergeAppData({
    base: data(),
    local: data({
      schedule: {
        '2026-09-05': [{ ...task('a', 'Base'), intervals: [{ start: 1 }] }],
      },
    }),
    remote: data({
      schedule: {
        '2026-09-05': [{ ...task('a', 'Base'), intervals: [{ start: 2 }] }],
      },
    }),
  });
  assert.equal(intervals.ok, false);
  if (!intervals.ok) {
    assert.equal(intervals.conflicts[0].kind, 'field');
    const conflict = intervals.conflicts[0];
    if (conflict.kind === 'field') assert.equal(conflict.field, 'intervals');
  }
});

void test('merges order only when one side is unchanged or both sides agree', () => {
  const base = data({
    schedule: { '2026-09-05': [task('a'), task('b'), task('c')] },
  });
  const local = data({
    schedule: { '2026-09-05': [task('b'), task('a'), task('c')] },
  });
  const remote = data({
    schedule: { '2026-09-05': [task('a'), task('c'), task('b')] },
  });
  const conflict = mergeAppData({ base, local, remote });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.conflicts[0].kind, 'order');
    const orderConflict = conflict.conflicts[0];
    if (orderConflict.kind === 'order') {
      assert.deepEqual(orderConflict.container, {
        kind: 'schedule',
        day: '2026-09-05',
      });
    }
  }

  assert.deepEqual(
    merged(mergeAppData({ base, local, remote: base })).schedule[
      '2026-09-05'
    ].map(({ id }) => id),
    ['b', 'a', 'c'],
  );
});

void test('merges independent additions without losing their positions', () => {
  const base = data({
    schedule: { '2026-09-05': [task('a'), task('b')] },
  });
  const local = data({
    schedule: {
      '2026-09-05': [task('local-first'), task('a'), task('b')],
    },
  });
  const remote = data({
    schedule: {
      '2026-09-05': [task('a'), task('b'), task('remote-last')],
    },
  });

  assert.deepEqual(
    merged(mergeAppData({ base, local, remote })).schedule['2026-09-05'].map(
      ({ id }) => id,
    ),
    ['local-first', 'a', 'b', 'remote-last'],
  );
});

void test('preserves each device order for additions in the same gap', () => {
  const base = data({ schedule: { '2026-09-05': [] } });
  const local = data({
    schedule: {
      '2026-09-05': [task('local-1'), task('local-2')],
    },
  });
  const remote = data({
    schedule: {
      '2026-09-05': [task('remote-1'), task('remote-2')],
    },
  });

  const ids = merged(mergeAppData({ base, local, remote })).schedule[
    '2026-09-05'
  ].map(({ id }) => id);
  assert.ok(ids.indexOf('local-1') < ids.indexOf('local-2'));
  assert.ok(ids.indexOf('remote-1') < ids.indexOf('remote-2'));
  assert.deepEqual(
    new Set(ids),
    new Set(['local-1', 'local-2', 'remote-1', 'remote-2']),
  );
});

void test('unions applied imports and takes the greatest schema version', () => {
  const result = merged(
    mergeAppData({
      base: data({ version: 1, appliedImports: ['base'] }),
      local: data({ version: 3, appliedImports: ['base', 'local'] }),
      remote: data({ version: 2, appliedImports: ['remote'] }),
    }),
  );
  assert.equal(result.version, 3);
  assert.deepEqual(result.appliedImports, ['base', 'local', 'remote']);
});

void test('merges template fields and unions created months', () => {
  const rule = {
    id: 'classes',
    text: 'MO',
    schedule: { kind: 'weekly' as const, weekday: 3 },
  };
  const base = data({
    monthPlanning: { rules: [rule], createdMonths: ['2026-09'] },
  });
  const local = data({
    monthPlanning: {
      rules: [{ ...rule, text: '17:30 — MO' }],
      createdMonths: ['2026-09', '2026-10'],
    },
  });
  const remote = data({
    monthPlanning: {
      rules: [{ ...rule, color: 'blue' }],
      createdMonths: ['2026-09', '2026-11'],
    },
  });

  assert.deepEqual(
    merged(mergeAppData({ base, local, remote })).monthPlanning,
    {
      rules: [
        {
          ...rule,
          text: '17:30 — MO',
          color: 'blue',
        },
      ],
      createdMonths: ['2026-09', '2026-10', '2026-11'],
    },
  );
});

void test('merges independent rule edits and additions', () => {
  const base = data({ rules: [{ id: 'focus', text: 'Focus' }] });
  const local = data({
    rules: [
      { id: 'focus', text: 'Work first' },
      { id: 'local-rule', text: 'Local' },
    ],
  });
  const remote = data({
    rules: [
      { id: 'focus', text: 'Focus' },
      { id: 'remote-rule', text: 'Remote' },
    ],
  });

  const result = merged(mergeAppData({ base, local, remote }));
  assert.equal(
    result.rules?.find((rule) => rule.id === 'focus')?.text,
    'Work first',
  );
  assert.deepEqual(
    new Set(result.rules?.map((rule) => rule.id)),
    new Set(['focus', 'local-rule', 'remote-rule']),
  );
});

void test('merges independent goals and completed reviews', () => {
  const base = data({ reviewTrackingStartedOn: '2026-09-02' });
  const local = data({
    reviewTrackingStartedOn: '2026-09-02',
    goals: [
      {
        id: 'weekly-goal',
        period: { kind: 'week', key: '2026-08-31' },
        text: 'Finish the draft',
      },
    ],
  });
  const remote = data({
    reviewTrackingStartedOn: '2026-09-01',
    reviews: [
      {
        id: 'weekly-review',
        period: { kind: 'week', key: '2026-08-31' },
        results: [],
        goalSnapshot: [],
        status: 'completed',
        createdAt: 1,
        completedAt: 2,
      },
    ],
  });

  const result = merged(mergeAppData({ base, local, remote }));
  assert.equal(result.reviewTrackingStartedOn, '2026-09-01');
  assert.equal(result.goals?.[0].id, 'weekly-goal');
  assert.equal(result.reviews?.[0].id, 'weekly-review');
});

void test('rejects two reviews for the same period', () => {
  const invalid = data({
    reviews: ['one', 'two'].map((id) => ({
      id,
      period: { kind: 'month' as const, key: '2026-09' },
      results: [],
      goalSnapshot: [],
      status: 'draft' as const,
      createdAt: 1,
    })),
  });

  assert.deepEqual(
    validateAppData(invalid, 'local').map(({ code }) => code),
    ['duplicate_review_period'],
  );
});

void test('rejects duplicate month-template rule ids', () => {
  const invalid = data({
    monthPlanning: {
      rules: [
        {
          id: 'same',
          text: 'one',
          schedule: { kind: 'weekly', weekday: 1 },
        },
        {
          id: 'same',
          text: 'two',
          schedule: { kind: 'weekly', weekday: 2 },
        },
      ],
      createdMonths: [],
    },
  });

  assert.deepEqual(
    validateAppData(invalid, 'local').map(({ code }) => code),
    ['duplicate_month_template_rule_id'],
  );
});

void test('rejects duplicate task ids before merge', () => {
  const invalid = data({
    schedule: { '2026-09-05': [task('a')] },
    backlog: [{ id: 'general', title: 'Без группы', tasks: [task('a')] }],
  });
  const validation = validateAppData(invalid, 'local');
  assert.deepEqual(
    validation.map(({ code }) => code),
    ['duplicate_task_id', 'task_not_in_exactly_one_container'],
  );

  const result = mergeAppData({ base: data(), local: invalid, remote: data() });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const conflict = result.conflicts[0];
    if (conflict.kind === 'invariant') assert.equal(conflict.source, 'local');
  }
});
