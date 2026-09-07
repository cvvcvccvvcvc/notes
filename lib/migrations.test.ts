import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import { migrateAppData } from './migrations';

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

  const result = migrateAppData(data);

  assert.deepEqual(
    result.backlog?.map((group) => group.id),
    [UNSORTED_GROUP_ID, 'study'],
  );
  assert.equal(result.version, 5);
  assert.deepEqual(result.monthPlanning, { rules: [], createdMonths: [] });
  assert.equal(result.rules?.length, 3);
  assert.deepEqual(result.goals, []);
  assert.deepEqual(result.reviews, []);
  assert.equal(result.backlog?.[1].tasks[0].backlogGroupId, 'study');
  assert.equal(migrateAppData(result), result);
});

void test('migration replaces only the untouched legacy rules note', () => {
  const legacy = {
    id: 'work-rules',
    title: 'Правила работы',
    color: 'purple' as const,
    content:
      'макс 2 игры в Deadlock в день / 1.5 часа\n\nвесь написанный код смотреть и понимать',
  };
  const migrated = migrateAppData({
    version: 3,
    schedule: {},
    backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
    monthPlanning: { rules: [], createdMonths: [] },
    notes: [legacy],
    history: [],
  });
  assert.deepEqual(migrated.notes, []);
  assert.equal(migrated.rules?.length, 3);

  const edited = migrateAppData({
    version: 3,
    schedule: {},
    backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
    monthPlanning: { rules: [], createdMonths: [] },
    notes: [{ ...legacy, content: `${legacy.content}\n\nмоё правило` }],
    history: [],
  });
  assert.equal(edited.notes.length, 1);
});

void test('migration remembers months that already exist in the schedule', () => {
  const result = migrateAppData({
    version: 2,
    schedule: {
      '2026-09-05': [],
      '2026-10-01': [],
      'not-a-date': [],
    },
    backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
    notes: [],
    history: [],
  });

  assert.deepEqual(result.monthPlanning?.createdMonths, ['2026-09', '2026-10']);
});
