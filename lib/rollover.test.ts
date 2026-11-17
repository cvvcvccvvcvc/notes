import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
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
    backlog: [],
    notes: [],
    history: [],
  };

  const result = rolloverPastTasks(data, '2026-09-05');

  assert.deepEqual(result.schedule['2026-09-04'], []);
  assert.equal(result.schedule['2026-09-05'][0].id, 'task-1');
  assert.equal(
    result.schedule['2026-09-05'][0].intervals[0].end,
    new Date('2026-09-05T00:00:00').getTime(),
  );
  assert.deepEqual(result.history, []);
  assert.equal(rolloverPastTasks(result, '2026-09-05'), result);
});

void test('missed days keep their order before tasks already planned for today', () => {
  const data: AppData = {
    version: 7,
    schedule: {
      '2026-09-03': [{ id: 'early', text: 'Раннее', intervals: [] }],
      '2026-09-04': [{ id: 'late', text: 'Позднее', intervals: [] }],
      '2026-09-05': [{ id: 'planned', text: 'Сегодня', intervals: [] }],
    },
    backlog: [],
    notes: [],
    history: [],
  };
  const result = rolloverPastTasks(data, '2026-09-05');
  assert.deepEqual(
    result.schedule['2026-09-05'].map((task) => task.id),
    ['early', 'late', 'planned'],
  );
  assert.deepEqual(result.schedule['2026-09-03'], []);
  assert.deepEqual(result.schedule['2026-09-04'], []);
  assert.equal(rolloverPastTasks(result, '2026-09-05'), result);
});

void test('rollover completes opted-in tasks on their original day and carries the rest', () => {
  const data: AppData = {
    version: 9,
    schedule: {
      '2026-09-03': [
        {
          id: 'auto-early',
          text: 'Завершить автоматически',
          autoComplete: true,
          templateRuleId: 'rule-1',
          intervals: [{ start: new Date('2026-09-03T23:30:00').getTime() }],
        },
      ],
      '2026-09-04': [
        { id: 'carry', text: 'Перенести', intervals: [] },
        {
          id: 'auto-late',
          text: 'Тоже завершить',
          autoComplete: true,
          intervals: [],
        },
      ],
    },
    backlog: [],
    notes: [],
    history: [],
  };

  const result = rolloverPastTasks(data, '2026-09-05');
  assert.deepEqual(
    result.schedule['2026-09-05'].map((task) => task.id),
    ['carry'],
  );
  assert.deepEqual(result.schedule['2026-09-03'], []);
  assert.deepEqual(result.schedule['2026-09-04'], []);
  assert.deepEqual(
    result.history.map((item) => item.id),
    ['auto-late', 'auto-early'],
  );
  assert.equal(result.history[0].finishedDay, '2026-09-04');
  assert.equal(
    result.history[0].finishedAt,
    new Date('2026-09-04T23:59:59.999').getTime(),
  );
  assert.equal(result.history[1].finishedDay, '2026-09-03');
  assert.equal(result.history[1].templateRuleId, 'rule-1');
  assert.equal(
    result.history[1].intervals[0].end,
    result.history[1].finishedAt,
  );
  assert.equal(rolloverPastTasks(result, '2026-09-05'), result);
});
