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
  assert.equal(result.version, 3);
  assert.deepEqual(result.monthPlanning, { rules: [], createdMonths: [] });
  assert.equal(result.backlog?.[1].tasks[0].backlogGroupId, 'study');
  assert.equal(migrateAppData(result), result);
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
