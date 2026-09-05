import type { AppData, Task } from './data';
import { dayWindowSchema } from '../src/shared/data-schema';

export function setDayWindow(
  data: AppData,
  day: string,
  window: { start?: string; end?: string },
): AppData {
  const parsed = dayWindowSchema.safeParse(window);
  if (!parsed.success) return data;
  return {
    ...data,
    dayWindows: {
      ...data.dayWindows,
      [day]: {
        ...(parsed.data.start ? { start: parsed.data.start } : {}),
        ...(parsed.data.end ? { end: parsed.data.end } : {}),
      },
    },
  };
}

/** Keep the user's order. Never infer an exact start or duration for flexible tasks. */
export function dayTimeline(
  tasks: Task[],
  window: { start?: string; end?: string } = {},
) {
  let previous = window.start;
  const nextTimes: (string | undefined)[] = Array.from({
    length: tasks.length,
  });
  let next = window.end;
  for (let i = tasks.length - 1; i >= 0; i--) {
    nextTimes[i] = next;
    if (tasks[i].plannedStart) next = tasks[i].plannedStart;
  }
  return tasks.map((task, index) => {
    const time = task.plannedStart;
    const outOfOrder = !!time && !!previous && time < previous;
    const outside =
      !!time &&
      ((!!window.start && time < window.start) ||
        (!!window.end && time > window.end));
    const lower = previous;
    if (time) previous = time;
    const upper = nextTimes[index];
    const startsFlexibleSection =
      !time && (index === 0 || !!tasks[index - 1].plannedStart);
    const range = startsFlexibleSection ? rangeLabel(lower, upper) : undefined;
    return {
      task,
      range,
      warning: outOfOrder
        ? 'Время раньше предыдущей опорной точки'
        : outside
          ? 'За границами дня'
          : undefined,
    };
  });
}

function rangeLabel(lower?: string, upper?: string) {
  if (lower && upper)
    return lower <= upper ? `${lower} — ${upper}` : 'Проверьте порядок времени';
  if (lower) return `После ${lower}`;
  if (upper) return `До ${upper}`;
  return 'Без привязки ко времени';
}
