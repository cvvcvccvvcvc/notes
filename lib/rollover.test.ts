import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import { rolloverPastTasks } from './rollover';

void test('rollover preserves a task and closes its running interval at midnight', () => {
  const data: AppData = {
    version: 2,
    schedule: {
      '2026-09-04': [
        {
          id: 'task-1',
          text: 'Продолжить работу',
          intervals: [{ start: new Date('2026-09-04T23:30:00').getTime() }],
        },
      ],
    },
    backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
    notes: [],
    history: [],
  };

  const result = rolloverPastTasks(data, '2026-09-05');

  assert.deepEqual(result.schedule['2026-09-04'], []);
  assert.equal(result.backlog?.[0].tasks[0].id, 'task-1');
  assert.equal(
    result.backlog?.[0].tasks[0].intervals[0].end,
    new Date('2026-09-05T00:00:00').getTime(),
  );
  assert.deepEqual(result.history, []);
  assert.equal(rolloverPastTasks(result, '2026-09-05'), result);
});
