import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import { migrateAppData } from './migrations';
import { rolloverPastTasks } from './rollover';

void test('migration repairs the backlog invariants even for current-version data', () => {
  const data: AppData = {
    version: 2,
    schedule: {},
    backlog: [
      {
        id: 'study',
        title: 'Учёба',
        tasks: [
          {
            id: 'one',
            text: 'читать',
            intervals: [],
            backlogGroupId: 'deleted-group',
          },
        ],
      },
    ],
    notes: [],
    history: [],
  };

  const result = migrateAppData(data, '2026-09-05');

  assert.deepEqual(
    result.backlog?.map((group) => group.id),
    ['study'],
  );
  assert.equal(result.version, 8);
  assert.deepEqual(result.monthPlanning, { rules: [], createdMonths: [] });
  assert.equal(result.rules?.length, 3);
  assert.deepEqual(result.goals, []);
  assert.deepEqual(result.reviews, []);
  assert.equal(result.backlog?.[0].tasks[0].backlogGroupId, 'study');
  assert.equal(migrateAppData(result, '2026-09-05'), result);
});

void test('migration preserves legacy unsorted tasks in today and removes stale provenance', () => {
  const current: AppData = {
    version: 6,
    schedule: {
      '2026-09-05': [
        {
          id: 'planned',
          text: 'Запланировано',
          intervals: [],
          backlogGroupId: UNSORTED_GROUP_ID,
        },
      ],
    },
    backlog: [
      {
        id: UNSORTED_GROUP_ID,
        title: 'Не разобрано',
        tasks: [
          {
            id: 'legacy',
            text: 'Сохранить',
            intervals: [],
            backlogGroupId: UNSORTED_GROUP_ID,
          },
        ],
      },
    ],
    notes: [],
    history: [],
  };
  const migrated = migrateAppData(current, '2026-09-05');
  assert.deepEqual(migrated.backlog, []);
  assert.deepEqual(
    migrated.schedule['2026-09-05'].map((task) => task.id),
    ['planned', 'legacy'],
  );
  assert.equal(migrated.schedule['2026-09-05'][0].backlogGroupId, undefined);
  assert.equal(migrated.schedule['2026-09-05'][1].backlogGroupId, undefined);
  assert.deepEqual(migrated.history, []);
  assert.equal(migrateAppData(migrated, '2026-09-05'), migrated);
});

void test('migration and rollover preserve both legacy project and missed-day tasks', () => {
  const oldDay = '2026-09-04';
  const today = '2026-09-05';
  const data: AppData = {
    version: 6,
    schedule: {
      [oldDay]: [{ id: 'missed', text: 'Со вчера', intervals: [] }],
      [today]: [{ id: 'planned', text: 'На сегодня', intervals: [] }],
    },
    backlog: [
      {
        id: UNSORTED_GROUP_ID,
        title: 'Не разобрано',
        tasks: [{ id: 'legacy', text: 'Из проекта', intervals: [] }],
      },
    ],
    notes: [],
    history: [],
  };

  const result = rolloverPastTasks(migrateAppData(data, today), today);
  assert.deepEqual(
    result.schedule[today].map((task) => task.id),
    ['missed', 'planned', 'legacy'],
  );
  assert.deepEqual(result.schedule[oldDay], []);
  assert.deepEqual(result.backlog, []);
  assert.equal(rolloverPastTasks(migrateAppData(result, today), today), result);
});

void test('migration replaces only the untouched legacy rules note', () => {
  const legacy = {
    id: 'work-rules',
    title: 'Правила работы',
    color: 'purple' as const,
    content:
      'макс 2 игры в Deadlock в день / 1.5 часа\n\nвесь написанный код смотреть и понимать',
  };
  const migrated = migrateAppData(
    {
      version: 3,
      schedule: {},
      backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
      monthPlanning: { rules: [], createdMonths: [] },
      notes: [legacy],
      history: [],
    },
    '2026-09-05',
  );
  assert.deepEqual(migrated.notes, []);
  assert.equal(migrated.rules?.length, 3);

  const edited = migrateAppData(
    {
      version: 3,
      schedule: {},
      backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
      monthPlanning: { rules: [], createdMonths: [] },
      notes: [{ ...legacy, content: `${legacy.content}\n\nмоё правило` }],
      history: [],
    },
    '2026-09-05',
  );
  assert.equal(edited.notes.length, 1);
});

void test('migration remembers months that already exist in the schedule', () => {
  const result = migrateAppData(
    {
      version: 2,
      schedule: {
        '2026-09-05': [],
        '2026-10-01': [],
        'not-a-date': [],
      },
      backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
      notes: [],
      history: [],
    },
    '2026-09-05',
  );

  assert.deepEqual(result.monthPlanning?.createdMonths, ['2026-09', '2026-10']);
});
