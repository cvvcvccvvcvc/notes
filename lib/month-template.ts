import type {
  AppData,
  MonthPlanning,
  MonthTemplateRule,
  MonthTemplateSchedule,
  Task,
} from './data';
import { dateKey } from './date-time';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_KEY = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function parseMonth(month: string) {
  if (!MONTH_KEY.test(month)) throw new Error(`Invalid month key: ${month}`);
  const [year, number] = month.split('-').map(Number);
  return { year, monthIndex: number - 1 };
}

function monthDates(month: string) {
  const { year, monthIndex } = parseMonth(month);
  const length = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from(
    { length },
    (_, index) => new Date(year, monthIndex, index + 1, 12),
  );
}

function planning(data: AppData): MonthPlanning {
  return data.monthPlanning ?? { rules: [], createdMonths: [] };
}

function dayNumber(day: string) {
  if (!DAY_KEY.test(day)) return null;
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

export function defaultMonthTemplateSchedule(
  kind: MonthTemplateSchedule['kind'],
  today = new Date(),
): MonthTemplateSchedule {
  if (kind === 'weekly') return { kind, weekday: today.getDay() };
  if (kind === 'fortnightly') return { kind, anchorDay: dateKey(today) };
  return { kind, month: today.getMonth() + 1, day: today.getDate() };
}

export function nextMonthKey(data: AppData, today: string) {
  const currentMonth = today.slice(0, 7);
  const latest = [...planning(data).createdMonths, currentMonth]
    .filter((month) => MONTH_KEY.test(month))
    .sort()
    .at(-1)!;
  const { year, monthIndex } = parseMonth(latest);
  const next = new Date(year, monthIndex + 1, 1, 12);
  return dateKey(next).slice(0, 7);
}

export function matchingTemplateRules(rules: MonthTemplateRule[], date: Date) {
  const key = dateKey(date);
  return rules.filter((rule) => {
    if (!rule.text.trim()) return false;
    if (rule.schedule.kind === 'weekly')
      return date.getDay() === rule.schedule.weekday;
    if (rule.schedule.kind === 'annual')
      return (
        date.getMonth() + 1 === rule.schedule.month &&
        date.getDate() === rule.schedule.day
      );
    const anchor = dayNumber(rule.schedule.anchorDay);
    const candidate = dayNumber(key);
    return (
      anchor !== null && candidate !== null && (candidate - anchor) % 14 === 0
    );
  });
}

export function monthTemplateTaskCount(data: AppData, month: string) {
  const rules = planning(data).rules;
  return monthDates(month).reduce(
    (count, date) => count + matchingTemplateRules(rules, date).length,
    0,
  );
}

/** Materialize a month once. Existing tasks and their order are preserved. */
export function createMonthFromTemplate(data: AppData, month: string) {
  const currentPlanning = planning(data);
  if (currentPlanning.createdMonths.includes(month)) return data;

  const schedule = { ...data.schedule };
  for (const date of monthDates(month)) {
    const day = dateKey(date);
    const existing = schedule[day] ?? [];
    const existingIds = new Set(existing.map((task) => task.id));
    const generated: Task[] = matchingTemplateRules(currentPlanning.rules, date)
      .map((rule) => ({
        id: `month-template:${rule.id}:${day}`,
        text: rule.text.trim(),
        intervals: [],
        ...(rule.color ? { color: rule.color } : {}),
      }))
      .filter((task) => !existingIds.has(task.id));
    schedule[day] = [...existing, ...generated];
  }

  return {
    ...data,
    schedule,
    monthPlanning: {
      ...currentPlanning,
      createdMonths: [...currentPlanning.createdMonths, month].sort(),
    },
  };
}
