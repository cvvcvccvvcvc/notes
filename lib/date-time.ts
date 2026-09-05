export const ruDate = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export const ruShortDate = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});

export const ruMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long' });

export const ruTime = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftedDay(day: string, distance: -1 | 1) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + distance);
  return dateKey(date);
}

export function minutesLabel(milliseconds: number) {
  return `${Math.max(0, Math.floor(milliseconds / 60_000))} мин`;
}
