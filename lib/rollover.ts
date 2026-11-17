import type { AppData, Task } from './data';
import { pauseTaskAt, taskHistoryItem } from './task-operations';

function endOfDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Close each past day once: finish opted-in tasks, carry the rest into today. */
export function rolloverPastTasks(data: AppData, today: string): AppData {
  const carried: Task[] = [];
  const completed: AppData['history'] = [];
  const schedule = { ...data.schedule };

  for (const day of Object.keys(schedule).sort()) {
    if (day >= today || !schedule[day]?.length) continue;
    const midnight = endOfDay(day);
    for (const task of schedule[day]) {
      if (task.autoComplete)
        completed.push(taskHistoryItem(task, task.id, midnight - 1, day));
      else carried.push(pauseTaskAt(task, midnight));
    }
    schedule[day] = [];
  }

  if (!carried.length && !completed.length) return data;
  if (carried.length)
    schedule[today] = [...carried, ...(schedule[today] ?? [])];
  return {
    ...data,
    schedule,
    history: completed.length
      ? [...completed.reverse(), ...data.history]
      : data.history,
  };
}
