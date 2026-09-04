import type { AppData, Task } from './data';

// User-provided dates, not recurrence rules. In particular, November 6 is intentional.
const IMPORT_ID = 'schedule-2026-09-04';
const entries: Record<string, string[]> = {
  '2026-09-05': [
    'посмотреть пару видосов об SQL',
    'проверить SUSDC (сделки? в прибыль? хеджировать начать)',
    'позвонить на танцы и записаться',
    'пинг понг?',
  ],
  '2026-09-06': ['я не работаю!!', 'пинг понг?'],
  '2026-09-07': ['посмотреть MO'],
  '2026-09-08': [
    'кончается подписка breckenridgegeoffrey6526+86763@gmail.com (ресет потратить)',
  ],
  '2026-09-13': ['я не работаю'],
  '2026-09-15': ['арсик вернет 3 тыщ'],
};

for (const day of [
  '09-09',
  '09-16',
  '09-23',
  '09-30',
  '10-07',
  '10-14',
  '10-21',
  '10-28',
  '11-06',
  '11-11',
  '11-18',
  '11-25',
  '12-02',
  '12-09',
  '12-16',
  '12-23',
])
  entries[`2026-${day}`] = ['17:30 — MO'];

for (const day of [
  '09-09',
  '09-23',
  '10-07',
  '10-21',
  '11-11',
  '11-25',
  '12-09',
  '12-23',
])
  entries[`2026-${day}`].push('20:50 — JC');

for (const day of [
  '09-10',
  '09-17',
  '09-24',
  '10-01',
  '10-08',
  '10-15',
  '10-22',
  '10-29',
  '11-05',
  '11-12',
  '11-19',
  '11-26',
  '12-03',
  '12-10',
  '12-17',
  '12-24',
])
  entries[`2026-${day}`] = ['17:30 — OS', '19:10 — PG', '20:50 — ML'];

/** Add once, preserving existing tasks/notes/history and today's sandbox examples. */
export function importPreviewSchedule(data: AppData, today: string): AppData {
  if (data.appliedImports?.includes(IMPORT_ID)) return data;
  const schedule = { ...data.schedule };
  for (
    let stamp = Date.UTC(2026, 8, 5);
    stamp <= Date.UTC(2026, 11, 26);
    stamp += 86_400_000
  ) {
    const day = new Date(stamp).toISOString().slice(0, 10);
    if (day === today) continue;
    const existing = schedule[day] ?? [];
    const incoming: Task[] = (entries[day] ?? [])
      .filter((text) => !existing.some((task) => task.text.trim() === text))
      .map((text, index) => ({
        id: `${IMPORT_ID}:${day}:${index}`,
        text,
        intervals: [],
      }));
    schedule[day] = [...existing, ...incoming];
  }
  return {
    ...data,
    schedule,
    appliedImports: [...(data.appliedImports ?? []), IMPORT_ID],
  };
}
