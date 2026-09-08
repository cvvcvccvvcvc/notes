import type { AppData, Task, TaskGroup } from './data';
import { UNSORTED_GROUP_ID } from './backlog';

export type TaskState = 'idle' | 'running' | 'paused';

export function taskState(task: Task): TaskState {
  if (!task.intervals.length) return 'idle';
  return task.intervals.at(-1)?.end == null ? 'running' : 'paused';
}

export function taskDuration(task: Task, now: number) {
  return task.intervals.reduce(
    (sum, interval) => sum + ((interval.end ?? now) - interval.start),
    0,
  );
}

/** Close the only interval that may still be open. */
export function pauseTaskAt(task: Task, stamp: number): Task {
  if (taskState(task) !== 'running') return task;
  return {
    ...task,
    intervals: task.intervals.map((interval, index) =>
      index === task.intervals.length - 1
        ? { ...interval, end: Math.max(interval.start, stamp) }
        : interval,
    ),
  };
}

export function toggleScheduledTaskTimer(
  data: AppData,
  day: string,
  id: string,
  stamp: number,
) {
  return updateScheduledTask(data, day, id, (task) =>
    taskState(task) === 'running'
      ? pauseTaskAt(task, stamp)
      : { ...task, intervals: [...task.intervals, { start: stamp }] },
  );
}

export function finishScheduledTask(
  data: AppData,
  input: { day: string; id: string; historyId: string; stamp: number },
) {
  const { day, id, historyId, stamp } = input;
  const tasks = data.schedule[day] ?? [];
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) return data;
  const finished = pauseTaskAt(task, stamp);
  return {
    ...data,
    schedule: {
      ...data.schedule,
      [day]: tasks.filter((candidate) => candidate.id !== id),
    },
    history: [
      {
        id: historyId,
        taskId: task.id,
        text: task.text,
        finishedAt: stamp,
        finishedDay: day,
        intervals: finished.intervals,
      },
      ...data.history,
    ],
  };
}

export function removeScheduledTask(data: AppData, day: string, id: string) {
  const tasks = data.schedule[day] ?? [];
  if (!tasks.some((task) => task.id === id)) return data;
  return {
    ...data,
    schedule: {
      ...data.schedule,
      [day]: tasks.filter((task) => task.id !== id),
    },
  };
}

export function restoreScheduledTask(
  data: AppData,
  day: string,
  task: Task,
  index: number,
) {
  const tasks = [...(data.schedule[day] ?? [])];
  if (tasks.some((item) => item.id === task.id)) return data;
  tasks.splice(Math.min(index, tasks.length), 0, task);
  return { ...data, schedule: { ...data.schedule, [day]: tasks } };
}

export function updateScheduledTasks(
  data: AppData,
  day: string,
  change: (tasks: Task[]) => Task[],
) {
  const current = data.schedule[day] ?? [];
  const tasks = change(current);
  if (tasks === current) return data;
  return { ...data, schedule: { ...data.schedule, [day]: tasks } };
}

export function updateScheduledTask(
  data: AppData,
  day: string,
  id: string,
  change: (task: Task) => Task,
) {
  return updateScheduledTasks(data, day, (tasks) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return tasks;
    const task = change(tasks[index]);
    if (task === tasks[index]) return tasks;
    const next = [...tasks];
    next[index] = task;
    return next;
  });
}

export function moveScheduledTask(
  data: AppData,
  input: {
    day: string;
    id: string;
    direction: -1 | 1;
    adjacentDay: string;
    today: string;
    now: number;
  },
) {
  const { day, id, direction, adjacentDay, today, now } = input;
  const source = data.schedule[day] ?? [];
  const from = source.findIndex((task) => task.id === id);
  if (from < 0) return data;

  const to = from + direction;
  if (to >= 0 && to < source.length) {
    const tasks = [...source];
    [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
    return { ...data, schedule: { ...data.schedule, [day]: tasks } };
  }

  if (adjacentDay < today) return data;
  const task =
    day === today && adjacentDay > today
      ? pauseTaskAt(source[from], now)
      : source[from];
  const target = [...(data.schedule[adjacentDay] ?? [])];
  if (direction < 0) target.push(task);
  else target.unshift(task);
  return {
    ...data,
    schedule: {
      ...data.schedule,
      [day]: source.filter((candidate) => candidate.id !== id),
      [adjacentDay]: target,
    },
  };
}

export function moveScheduledTaskToDay(
  data: AppData,
  input: {
    sourceDay: string;
    id: string;
    targetDay: string;
    targetId?: string;
    today: string;
    now: number;
  },
) {
  const { sourceDay, id, targetDay, targetId, today, now } = input;
  if (targetDay < today) return data;
  const source = data.schedule[sourceDay] ?? [];
  const index = source.findIndex((task) => task.id === id);
  if (index < 0) return data;
  const task =
    sourceDay === today && targetDay > today
      ? pauseTaskAt(source[index], now)
      : source[index];
  const withoutTask = source.filter((candidate) => candidate.id !== id);

  if (sourceDay === targetDay) {
    const targetIndex = source.findIndex(
      (candidate) => candidate.id === targetId,
    );
    if (targetIndex < 0) return data;
    withoutTask.splice(Math.min(targetIndex, withoutTask.length), 0, task);
    return {
      ...data,
      schedule: { ...data.schedule, [sourceDay]: withoutTask },
    };
  }

  const target = [...(data.schedule[targetDay] ?? [])];
  const targetIndex = target.findIndex(
    (candidate) => candidate.id === targetId,
  );
  target.splice(targetIndex < 0 ? target.length : targetIndex, 0, task);
  return {
    ...data,
    schedule: {
      ...data.schedule,
      [sourceDay]: withoutTask,
      [targetDay]: target,
    },
  };
}

function backlogTarget(groups: TaskGroup[], preferred?: string) {
  if (preferred && groups.some((group) => group.id === preferred))
    return preferred;
  return groups.some((group) => group.id === UNSORTED_GROUP_ID)
    ? UNSORTED_GROUP_ID
    : null;
}

export function sendScheduledTaskToBacklog(
  data: AppData,
  day: string,
  id: string,
  now: number,
) {
  const groups = data.backlog ?? [];
  const source = data.schedule[day] ?? [];
  const task = source.find((candidate) => candidate.id === id);
  if (!task) return data;
  const groupId = backlogTarget(groups, task.backlogGroupId);
  if (!groupId) return data;
  const moved = {
    ...pauseTaskAt(task, now),
    backlogGroupId: groupId,
  };
  return {
    ...data,
    schedule: {
      ...data.schedule,
      [day]: source.filter((candidate) => candidate.id !== id),
    },
    backlog: groups.map((group) =>
      group.id === groupId
        ? { ...group, tasks: [...group.tasks, moved] }
        : group,
    ),
  };
}

export function removeBacklogGroup(data: AppData, id: string) {
  if (id === UNSORTED_GROUP_ID) return data;
  const groups = data.backlog ?? [];
  const removed = groups.find((group) => group.id === id);
  const unsorted = groups.find((group) => group.id === UNSORTED_GROUP_ID);
  if (!removed || !unsorted) return data;
  return {
    ...data,
    backlog: groups
      .filter((group) => group.id !== id)
      .map((group) =>
        group.id === UNSORTED_GROUP_ID
          ? {
              ...group,
              tasks: [
                ...group.tasks,
                ...removed.tasks.map((task) => ({
                  ...task,
                  backlogGroupId: UNSORTED_GROUP_ID,
                })),
              ],
            }
          : group,
      ),
  };
}

export function moveBacklogGroup(data: AppData, id: string, direction: -1 | 1) {
  if (id === UNSORTED_GROUP_ID) return data;
  const groups = data.backlog ?? [];
  const from = groups.findIndex((group) => group.id === id);
  const to = from + direction;
  if (
    from < 0 ||
    to < 0 ||
    to >= groups.length ||
    groups[to].id === UNSORTED_GROUP_ID
  )
    return data;
  const backlog = [...groups];
  [backlog[from], backlog[to]] = [backlog[to], backlog[from]];
  return { ...data, backlog };
}

export function moveBacklogGroupTo(
  data: AppData,
  sourceId: string,
  targetId: string,
) {
  if (
    sourceId === targetId ||
    sourceId === UNSORTED_GROUP_ID ||
    targetId === UNSORTED_GROUP_ID
  )
    return data;
  const groups = data.backlog ?? [];
  const from = groups.findIndex((group) => group.id === sourceId);
  const to = groups.findIndex((group) => group.id === targetId);
  if (from < 0 || to < 0) return data;
  const backlog = [...groups];
  const [moved] = backlog.splice(from, 1);
  backlog.splice(to, 0, moved);
  return { ...data, backlog };
}

export function updateBacklogTask(
  data: AppData,
  groupId: string,
  id: string,
  change: (task: Task) => Task,
) {
  const groups = data.backlog ?? [];
  const groupIndex = groups.findIndex((group) => group.id === groupId);
  const taskIndex = groups[groupIndex]?.tasks.findIndex(
    (task) => task.id === id,
  );
  if (groupIndex < 0 || taskIndex == null || taskIndex < 0) return data;
  const task = change(groups[groupIndex].tasks[taskIndex]);
  if (task === groups[groupIndex].tasks[taskIndex]) return data;
  const tasks = [...groups[groupIndex].tasks];
  tasks[taskIndex] = task;
  const backlog = [...groups];
  backlog[groupIndex] = { ...groups[groupIndex], tasks };
  return { ...data, backlog };
}

export function appendBacklogTask(data: AppData, groupId: string, task: Task) {
  const groups = data.backlog ?? [];
  if (
    Object.values(data.schedule).some((tasks) =>
      tasks.some((candidate) => candidate.id === task.id),
    ) ||
    groups.some((group) =>
      group.tasks.some((candidate) => candidate.id === task.id),
    )
  )
    return data;
  if (!groups.some((group) => group.id === groupId)) return data;
  return {
    ...data,
    backlog: groups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            tasks: [...group.tasks, { ...task, backlogGroupId: groupId }],
          }
        : group,
    ),
  };
}

export function removeBacklogTask(data: AppData, groupId: string, id: string) {
  const groups = data.backlog ?? [];
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group?.tasks.some((task) => task.id === id)) return data;
  return {
    ...data,
    backlog: groups.map((candidate) =>
      candidate.id === groupId
        ? {
            ...candidate,
            tasks: candidate.tasks.filter((task) => task.id !== id),
          }
        : candidate,
    ),
  };
}

export function moveBacklogTask(
  data: AppData,
  input: {
    sourceGroupId: string;
    id: string;
    targetGroupId: string;
    targetId?: string;
  },
) {
  const { sourceGroupId, id, targetGroupId, targetId } = input;
  const groups = data.backlog ?? [];
  const source = groups.find((group) => group.id === sourceGroupId);
  const targetGroup = groups.find((group) => group.id === targetGroupId);
  const task = source?.tasks.find((candidate) => candidate.id === id);
  if (!source || !targetGroup || !task) return data;
  const targetIndex = targetGroup.tasks.findIndex(
    (candidate) => candidate.id === targetId,
  );
  if (sourceGroupId === targetGroupId && targetIndex < 0) return data;
  const moved = { ...task, backlogGroupId: targetGroupId };
  return {
    ...data,
    backlog: groups.map((group) => {
      if (sourceGroupId === targetGroupId && group.id === sourceGroupId) {
        const tasks = group.tasks.filter((candidate) => candidate.id !== id);
        tasks.splice(Math.min(targetIndex, tasks.length), 0, moved);
        return { ...group, tasks };
      }
      if (group.id === sourceGroupId)
        return {
          ...group,
          tasks: group.tasks.filter((candidate) => candidate.id !== id),
        };
      if (group.id === targetGroupId) {
        const tasks = [...group.tasks];
        tasks.splice(targetIndex < 0 ? tasks.length : targetIndex, 0, moved);
        return { ...group, tasks };
      }
      return group;
    }),
  };
}

export function moveBacklogTaskVertically(
  data: AppData,
  groupId: string,
  id: string,
  direction: -1 | 1,
) {
  const groups = data.backlog ?? [];
  const groupIndex = groups.findIndex((group) => group.id === groupId);
  const group = groups[groupIndex];
  const from = group?.tasks.findIndex((task) => task.id === id) ?? -1;
  if (!group || from < 0) return data;
  const to = from + direction;
  if (to >= 0 && to < group.tasks.length) {
    const tasks = [...group.tasks];
    [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
    const backlog = [...groups];
    backlog[groupIndex] = { ...group, tasks };
    return { ...data, backlog };
  }

  const targetGroup = groups[groupIndex + direction];
  if (!targetGroup) return data;
  return moveBacklogTask(data, {
    sourceGroupId: groupId,
    id,
    targetGroupId: targetGroup.id,
    targetId: direction < 0 ? undefined : targetGroup.tasks.at(0)?.id,
  });
}

export function takeBacklogTask(
  data: AppData,
  groupId: string,
  id: string,
  today: string,
) {
  const groups = data.backlog ?? [];
  const group = groups.find((candidate) => candidate.id === groupId);
  const task = group?.tasks.find((candidate) => candidate.id === id);
  if (!task) return data;
  return {
    ...data,
    backlog: groups.map((candidate) =>
      candidate.id === groupId
        ? {
            ...candidate,
            tasks: candidate.tasks.filter((item) => item.id !== id),
          }
        : candidate,
    ),
    schedule: {
      ...data.schedule,
      [today]: [...(data.schedule[today] ?? []), task],
    },
  };
}

export function takeFutureTask(
  data: AppData,
  day: string,
  id: string,
  today: string,
) {
  const source = data.schedule[day] ?? [];
  const task = source.find((candidate) => candidate.id === id);
  if (!task) return data;
  return {
    ...data,
    schedule: {
      ...data.schedule,
      [day]: source.filter((candidate) => candidate.id !== id),
      [today]: [...(data.schedule[today] ?? []), task],
    },
  };
}
