import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AppData, Task } from './data';
import {
  insertBacklogTask,
  insertTaskAfter,
  finishScheduledTask,
  moveBacklogTask,
  moveBacklogGroup,
  moveBacklogGroupTo,
  moveBacklogTaskVertically,
  moveScheduledTask,
  removeBacklogTask,
  removeBacklogGroup,
  removeScheduledTask,
  restoreBacklogGroup,
  sendScheduledTaskToBacklog,
  toggleScheduledTaskTimer,
} from './task-operations';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, text: id, intervals: [], ...overrides };
}

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 7,
    schedule: {},
    backlog: [{ id: 'study', title: 'Учёба', tasks: [] }],
    notes: [],
    history: [],
    ...overrides,
  };
}

void describe('schedule task operations', () => {
  void it('inserts a task before the first, between tasks, and at the end', () => {
    const one = task('one');
    const two = task('two');
    const created = task('new');
    assert.deepEqual(insertTaskAfter([one, two], created, null), [
      created,
      one,
      two,
    ]);
    assert.deepEqual(insertTaskAfter([one, two], created, 'one'), [
      one,
      created,
      two,
    ]);
    assert.deepEqual(insertTaskAfter([one, two], created), [one, two, created]);
  });

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

  void it('records the actual completion day when finishing a future task', () => {
    const current = data({ schedule: { '2026-09-07': [task('later')] } });
    const result = finishScheduledTask(current, {
      day: '2026-09-07',
      id: 'later',
      historyId: 'done',
      stamp: 250,
      finishedDay: '2026-09-05',
    });
    assert.equal(result.history[0].finishedDay, '2026-09-05');
    assert.deepEqual(result.schedule['2026-09-07'], []);
  });

  void it('sends a task only to the chosen existing project', () => {
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
      'study',
    );

    assert.deepEqual(result.schedule['2026-09-05'], []);
    assert.deepEqual(result.backlog?.[0].tasks, [
      {
        ...running,
        backlogGroupId: 'study',
        intervals: [{ start: 100, end: 250 }],
      },
    ]);
    assert.equal(
      sendScheduledTaskToBacklog(
        current,
        '2026-09-05',
        running.id,
        250,
        'missing',
      ),
      current,
    );
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
    const created = insertBacklogTask(current, 'study', task('new'));

    assert.deepEqual(created.backlog?.[0].tasks, [
      task('new', { backlogGroupId: 'study' }),
    ]);
    assert.equal(insertBacklogTask(created, 'study', task('new')), created);
    assert.equal(insertBacklogTask(current, 'missing', task('new')), current);
  });

  void it('inserts inside a project without changing existing task IDs', () => {
    const current = data({
      backlog: [
        { id: 'study', title: 'Учёба', tasks: [task('one'), task('two')] },
      ],
    });
    const inserted = insertBacklogTask(current, 'study', task('new'), 'one');
    assert.deepEqual(
      inserted.backlog?.[0].tasks.map((item) => item.id),
      ['one', 'new', 'two'],
    );
    assert.deepEqual(
      insertBacklogTask(
        current,
        'study',
        task('new'),
        null,
      ).backlog?.[0].tasks.map((item) => item.id),
      ['new', 'one', 'two'],
    );
  });

  void it('removes only the requested task without creating history', () => {
    const one = task('one', { backlogGroupId: 'study' });
    const two = task('two', { backlogGroupId: 'study' });
    const current = data({
      backlog: [{ id: 'study', title: 'Учёба', tasks: [one, two] }],
    });

    const result = removeBacklogTask(current, 'study', 'one');
    assert.deepEqual(result.backlog?.[0].tasks, [two]);
    assert.deepEqual(result.history, []);
  });

  void it('does not remove a task when a drop target group is stale', () => {
    const current = data({
      backlog: [
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
        { id: 'study', title: 'Учёба', tasks: [one] },
        { id: 'later', title: 'Позже', tasks: [task('two')] },
      ],
    });

    const result = moveBacklogTaskVertically(current, 'study', 'one', 1);

    assert.deepEqual(result.backlog?.[0].tasks, []);
    assert.deepEqual(
      result.backlog?.[1].tasks.map((item) => item.id),
      ['one', 'two'],
    );
    assert.equal(result.backlog?.[1].tasks[0].backlogGroupId, 'later');
  });

  void it('moves a removed project contents into today without losing identity', () => {
    const one = task('one', { backlogGroupId: 'study' });
    const current = data({
      schedule: { '2026-09-05': [task('planned')] },
      backlog: [{ id: 'study', title: 'Учёба', tasks: [one] }],
    });

    const result = removeBacklogGroup(current, 'study', '2026-09-05');

    assert.deepEqual(result.backlog, []);
    assert.deepEqual(
      result.schedule['2026-09-05'].map((task) => task.id),
      ['planned', 'one'],
    );
    assert.equal(result.schedule['2026-09-05'][1].backlogGroupId, undefined);
    assert.deepEqual(result.history, []);
  });

  void it('restores a removed project at its position without duplicating moved tasks', () => {
    const one = task('one', { backlogGroupId: 'study' });
    const two = task('two', { backlogGroupId: 'study' });
    const three = task('three', { backlogGroupId: 'study' });
    const current = data({
      backlog: [
        {
          id: 'study',
          title: 'Учёба',
          content: 'Контекст',
          tasks: [one, two, three],
        },
        { id: 'later', title: 'Позже', tasks: [] },
      ],
    });
    const removed = removeBacklogGroup(current, 'study', '2026-09-05');
    const edited = {
      ...removed,
      schedule: {
        '2026-09-05': [{ ...one, text: 'Отредактировано после удаления' }],
        '2026-09-06': [two],
      },
    };

    const restored = restoreBacklogGroup(
      edited,
      current.backlog![0],
      0,
      '2026-09-05',
    );

    assert.deepEqual(
      restored.backlog?.map((group) => group.id),
      ['study', 'later'],
    );
    assert.equal(restored.backlog?.[0].content, 'Контекст');
    assert.deepEqual(restored.backlog?.[0].tasks, [
      {
        ...one,
        text: 'Отредактировано после удаления',
        backlogGroupId: 'study',
      },
    ]);
    assert.deepEqual(restored.schedule['2026-09-05'], []);
    assert.equal(restored.schedule['2026-09-06'][0].id, 'two');
  });
});

void describe('project operations', () => {
  void it('moves projects through the full list', () => {
    const current = data({
      backlog: [
        { id: 'study', title: 'Учёба', tasks: [] },
        { id: 'work', title: 'Работа', tasks: [] },
      ],
    });

    const moved = moveBacklogGroup(current, 'work', -1);
    assert.deepEqual(
      moved.backlog?.map((group) => group.id),
      ['work', 'study'],
    );
    assert.equal(moveBacklogGroup(moved, 'work', -1), moved);
  });

  void it('places a dragged project at another project', () => {
    const current = data({
      backlog: [
        { id: 'one', title: 'Один', tasks: [] },
        { id: 'two', title: 'Два', tasks: [] },
        { id: 'three', title: 'Три', tasks: [] },
      ],
    });

    assert.deepEqual(
      moveBacklogGroupTo(current, 'one', 'three').backlog?.map(
        (group) => group.id,
      ),
      ['two', 'three', 'one'],
    );
    assert.equal(moveBacklogGroupTo(current, 'one', 'missing'), current);
  });
});
