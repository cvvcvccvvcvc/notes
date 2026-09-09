import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AppData, Task } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import {
  appendBacklogTask,
  finishScheduledTask,
  moveBacklogTask,
  moveBacklogGroup,
  moveBacklogGroupTo,
  moveBacklogTaskVertically,
  moveScheduledTask,
  removeBacklogTask,
  removeBacklogGroup,
  removeScheduledTask,
  sendScheduledTaskToBacklog,
  toggleScheduledTaskTimer,
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
  void it('starts, pauses and resumes the same task timer', () => {
    const current = data({ schedule: { '2026-09-05': [task('one')] } });
    const started = toggleScheduledTaskTimer(current, '2026-09-05', 'one', 100);
    const paused = toggleScheduledTaskTimer(started, '2026-09-05', 'one', 250);
    const resumed = toggleScheduledTaskTimer(paused, '2026-09-05', 'one', 400);

    assert.deepEqual(resumed.schedule['2026-09-05'][0].intervals, [
      { start: 100, end: 250 },
      { start: 400 },
    ]);
  });

  void it('keeps intervals ordered if the system clock moves backwards', () => {
    const current = data({
      schedule: {
        '2026-09-05': [task('one', { intervals: [{ start: 100, end: 250 }] })],
      },
    });

    const resumed = toggleScheduledTaskTimer(current, '2026-09-05', 'one', 200);

    assert.deepEqual(resumed.schedule['2026-09-05'][0].intervals, [
      { start: 100, end: 250 },
      { start: 250 },
    ]);
  });

  void it('finishes into history while plain removal creates no history', () => {
    const running = task('one', {
      text: 'Работа',
      intervals: [{ start: 100 }],
    });
    const current = data({ schedule: { '2026-09-05': [running] } });
    const finished = finishScheduledTask(current, {
      day: '2026-09-05',
      id: 'one',
      historyId: 'history-one',
      stamp: 250,
    });

    assert.deepEqual(finished.schedule['2026-09-05'], []);
    assert.deepEqual(finished.history, [
      {
        id: 'history-one',
        taskId: 'one',
        text: 'Работа',
        finishedAt: 250,
        finishedDay: '2026-09-05',
        intervals: [{ start: 100, end: 250 }],
      },
    ]);
    assert.deepEqual(
      removeScheduledTask(current, '2026-09-05', 'one').history,
      [],
    );
  });

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
  void it('adds a new task directly to its group once', () => {
    const current = data();
    const created = appendBacklogTask(current, 'study', task('new'));

    assert.deepEqual(created.backlog?.[1].tasks, [
      task('new', { backlogGroupId: 'study' }),
    ]);
    assert.equal(appendBacklogTask(created, 'study', task('new')), created);
    assert.equal(appendBacklogTask(current, 'missing', task('new')), current);
  });

  void it('removes only the requested task without creating history', () => {
    const one = task('one', { backlogGroupId: 'study' });
    const two = task('two', { backlogGroupId: 'study' });
    const current = data({
      backlog: [
        { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
        { id: 'study', title: 'Учёба', tasks: [one, two] },
      ],
    });

    const result = removeBacklogTask(current, 'study', 'one');
    assert.deepEqual(result.backlog?.[1].tasks, [two]);
    assert.deepEqual(result.history, []);
  });

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

void describe('project operations', () => {
  void it('moves projects without moving the fixed unsorted group', () => {
    const current = data({
      backlog: [
        { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
        { id: 'study', title: 'Учёба', tasks: [] },
        { id: 'work', title: 'Работа', tasks: [] },
      ],
    });

    const moved = moveBacklogGroup(current, 'work', -1);
    assert.deepEqual(
      moved.backlog?.map((group) => group.id),
      [UNSORTED_GROUP_ID, 'work', 'study'],
    );
    assert.equal(moveBacklogGroup(moved, 'work', -1), moved);
    assert.equal(moveBacklogGroup(current, UNSORTED_GROUP_ID, 1), current);
  });

  void it('places a dragged project at another project', () => {
    const current = data({
      backlog: [
        { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
        { id: 'one', title: 'Один', tasks: [] },
        { id: 'two', title: 'Два', tasks: [] },
        { id: 'three', title: 'Три', tasks: [] },
      ],
    });

    assert.deepEqual(
      moveBacklogGroupTo(current, 'one', 'three').backlog?.map(
        (group) => group.id,
      ),
      [UNSORTED_GROUP_ID, 'two', 'three', 'one'],
    );
    assert.equal(
      moveBacklogGroupTo(current, 'one', UNSORTED_GROUP_ID),
      current,
    );
  });
});
