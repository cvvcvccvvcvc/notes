import type { AppData, Task } from './data';
import { pauseTaskAt } from './task-operations';

function endOfDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Carry unfinished tasks into today exactly once, closing active time at its old midnight. */
export function rolloverPastTasks(data: AppData, today: string): AppData {
  const carried: Task[] = [];
  const schedule = { ...data.schedule };

  for (const day of Object.keys(schedule).sort()) {
    if (day >= today || !schedule[day]?.length) continue;
    carried.push(
      ...schedule[day].map((task) => pauseTaskAt(task, endOfDay(day))),
    );
    schedule[day] = [];
  }

  if (!carried.length) return data;
  schedule[today] = [...carried, ...(schedule[today] ?? [])];
  return { ...data, schedule };
}
