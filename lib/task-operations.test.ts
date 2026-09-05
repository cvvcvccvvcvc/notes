import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AppData, Task } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import {
  moveBacklogTask,
  moveBacklogTaskVertically,
  moveScheduledTask,
  removeBacklogGroup,
  sendScheduledTaskToBacklog,
} from './task-operations';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, text: id, intervals: [], ...overrides };
}

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 2,
    schedule: {},
    backlog: [
      { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
      { id: 'study', title: 'Учёба', tasks: [] },
    ],
    notes: [],
    history: [],
    ...overrides,
  };
}

void describe('schedule task operations', () => {
  void it('falls back to the unsorted group instead of losing a task whose old group was deleted', () => {
    const running = task('one', {
      backlogGroupId: 'deleted-group',
      intervals: [{ start: 100 }],
    });
    const current = data({ schedule: { '2026-09-05': [running] } });

    const result = sendScheduledTaskToBacklog(
      current,
      '2026-09-05',
      running.id,
      250,
    );

    assert.deepEqual(result.schedule['2026-09-05'], []);
    assert.deepEqual(result.backlog?.[0].tasks, [
      {
        ...running,
        backlogGroupId: UNSORTED_GROUP_ID,
        intervals: [{ start: 100, end: 250 }],
      },
    ]);
  });

  void it('pauses a running task when it leaves today for tomorrow', () => {
    const running = task('one', { intervals: [{ start: 100 }] });
    const current = data({ schedule: { '2026-09-05': [running] } });

    const result = moveScheduledTask(current, {
      day: '2026-09-05',
      id: running.id,
      direction: 1,
      adjacentDay: '2026-09-06',
      today: '2026-09-05',
      now: 300,
    });

    assert.deepEqual(result.schedule['2026-09-05'], []);
    assert.deepEqual(result.schedule['2026-09-06'], [
      { ...running, intervals: [{ start: 100, end: 300 }] },
    ]);
  });
});

void describe('backlog task operations', () => {
  void it('does not remove a task when a drop target group is stale', () => {
    const current = data({
      backlog: [
        { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
        {
          id: 'study',
          title: 'Учёба',
          tasks: [task('one', { backlogGroupId: 'study' })],
        },
      ],
    });

    assert.equal(
      moveBacklogTask(current, {
        sourceGroupId: 'study',
        id: 'one',
        targetGroupId: 'missing',
      }),
      current,
    );
  });

  void it('moves through group boundaries while preserving task identity', () => {
    const one = task('one', { backlogGroupId: 'study' });
    const current = data({
      backlog: [
        { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
        { id: 'study', title: 'Учёба', tasks: [one] },
        { id: 'later', title: 'Позже', tasks: [task('two')] },
      ],
    });

    const result = moveBacklogTaskVertically(current, 'study', 'one', 1);

    assert.deepEqual(result.backlog?.[1].tasks, []);
    assert.deepEqual(
      result.backlog?.[2].tasks.map((item) => item.id),
      ['one', 'two'],
    );
    assert.equal(result.backlog?.[2].tasks[0].backlogGroupId, 'later');
  });

  void it('moves a removed group contents into the unsorted group', () => {
    const one = task('one', { backlogGroupId: 'study' });
    const current = data({
      backlog: [
        { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
        { id: 'study', title: 'Учёба', tasks: [one] },
      ],
    });

    const result = removeBacklogGroup(current, 'study');

    assert.deepEqual(
      result.backlog?.map((group) => group.id),
      [UNSORTED_GROUP_ID],
    );
    assert.deepEqual(result.backlog?.[0].tasks, [
      { ...one, backlogGroupId: UNSORTED_GROUP_ID },
    ]);
  });
});
