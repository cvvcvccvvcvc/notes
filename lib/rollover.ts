import type { AppData, Task, TaskGroup } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import { pauseTaskAt } from './task-operations';

function endOfDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function appendUnique(group: TaskGroup, tasks: Task[]) {
  const existing = new Set(group.tasks.map((task) => task.id));
  return {
    ...group,
    tasks: [...group.tasks, ...tasks.filter((task) => !existing.has(task.id))],
  };
}

/** Move unfinished tasks from past days to the backlog exactly once. */
export function rolloverPastTasks(data: AppData, today: string): AppData {
  let groups = data.backlog ?? [];
  const schedule = { ...data.schedule };
  let changed = false;

  for (const day of Object.keys(schedule).sort()) {
    if (day >= today || !schedule[day]?.length) continue;
    changed = true;
    for (const sourceTask of schedule[day]) {
      const task = pauseTaskAt(sourceTask, endOfDay(day));
      const groupId = groups.some((group) => group.id === task.backlogGroupId)
        ? task.backlogGroupId!
        : UNSORTED_GROUP_ID;
      groups = groups.map((group) =>
        group.id === groupId
          ? appendUnique(group, [{ ...task, backlogGroupId: groupId }])
          : group,
      );
    }
    schedule[day] = [];
  }

  return changed ? { ...data, schedule, backlog: groups } : data;
}
