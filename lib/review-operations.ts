import type {
  AppData,
  Goal,
  HistoryItem,
  PeriodReview,
  ReviewPeriod,
  ReviewPeriodKind,
  ReviewResult,
} from './data';
import { dateKey } from './date-time';

const periodOrder: Record<ReviewPeriodKind, number> = {
  week: 0,
  month: 1,
  year: 2,
};

function dayDate(day: string) {
  return new Date(`${day}T12:00:00`);
}

function addDays(day: string, amount: number) {
  const date = dayDate(day);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function currentReviewPeriod(
  kind: ReviewPeriodKind,
  day: string,
): ReviewPeriod {
  if (kind === 'month') return { kind, key: day.slice(0, 7) };
  if (kind === 'year') return { kind, key: day.slice(0, 4) };
  const date = dayDate(day);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return { kind, key: dateKey(date) };
}

export function reviewPeriodRange(period: ReviewPeriod) {
  if (period.kind === 'week')
    return { start: period.key, end: addDays(period.key, 6) };
  if (period.kind === 'month') {
    const [year, month] = period.key.split('-').map(Number);
    return {
      start: `${period.key}-01`,
      end: dateKey(new Date(year, month, 0, 12)),
    };
  }
  return { start: `${period.key}-01-01`, end: `${period.key}-12-31` };
}

export function moveReviewPeriod(
  period: ReviewPeriod,
  direction: -1 | 1,
): ReviewPeriod {
  if (period.kind === 'week')
    return { kind: 'week', key: addDays(period.key, direction * 7) };
  if (period.kind === 'month') {
    const [year, month] = period.key.split('-').map(Number);
    const date = new Date(year, month - 1 + direction, 1, 12);
    return { kind: 'month', key: dateKey(date).slice(0, 7) };
  }
  return { kind: 'year', key: String(Number(period.key) + direction) };
}

export function reviewPeriodLabel(period: ReviewPeriod) {
  const { start, end } = reviewPeriodRange(period);
  if (period.kind === 'year') return `${period.key} год`;
  if (period.kind === 'month') {
    const label = new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      year: 'numeric',
    }).format(dayDate(start));
    return label[0].toUpperCase() + label.slice(1);
  }
  const format = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  return `${format.format(dayDate(start))} — ${format.format(dayDate(end))}`;
}

export function historyItemDay(item: HistoryItem) {
  return item.finishedDay ?? dateKey(new Date(item.finishedAt));
}

export function historyItemsForPeriod(data: AppData, period: ReviewPeriod) {
  const { start, end } = reviewPeriodRange(period);
  return data.history
    .filter((item) => {
      const day = historyItemDay(item);
      return day >= start && day <= end;
    })
    .sort((left, right) => left.finishedAt - right.finishedAt);
}

export function goalsForPeriod(data: AppData, period: ReviewPeriod) {
  return (data.goals ?? []).filter(
    (goal) =>
      goal.period.kind === period.kind && goal.period.key === period.key,
  );
}

export function reviewForPeriod(data: AppData, period: ReviewPeriod) {
  return (data.reviews ?? []).find(
    (review) =>
      review.period.kind === period.kind && review.period.key === period.key,
  );
}

export function startReviewTracking(data: AppData, today: string): AppData {
  if (data.reviewTrackingStartedOn) return data;
  return { ...data, reviewTrackingStartedOn: today };
}

export function dueReviewPeriods(data: AppData, today: string) {
  const startedOn = data.reviewTrackingStartedOn;
  if (!startedOn) return [];
  const completed = new Set(
    (data.reviews ?? [])
      .filter((review) => review.status === 'completed')
      .map((review) => `${review.period.kind}:${review.period.key}`),
  );
  const due: ReviewPeriod[] = [];

  for (const kind of ['week', 'month', 'year'] as const) {
    let period = moveReviewPeriod(currentReviewPeriod(kind, startedOn), -1);
    while (reviewPeriodRange(period).end < today) {
      const becameDueOn = addDays(reviewPeriodRange(period).end, 1);
      if (
        becameDueOn >= startedOn &&
        !completed.has(`${period.kind}:${period.key}`)
      )
        due.push(period);
      period = moveReviewPeriod(period, 1);
    }
  }

  return due.sort((left, right) => {
    const byEnd = reviewPeriodRange(left).end.localeCompare(
      reviewPeriodRange(right).end,
    );
    return byEnd || periodOrder[left.kind] - periodOrder[right.kind];
  });
}

export function appendGoal(data: AppData, goal: Goal): AppData {
  return { ...data, goals: [...(data.goals ?? []), goal] };
}

export function updateGoal(
  data: AppData,
  id: string,
  change: (goal: Goal) => Goal,
): AppData {
  return {
    ...data,
    goals: (data.goals ?? []).map((goal) =>
      goal.id === id ? change(goal) : goal,
    ),
  };
}

export function removeGoal(data: AppData, id: string): AppData {
  return {
    ...data,
    goals: (data.goals ?? []).filter((goal) => goal.id !== id),
  };
}

export function createPeriodReview(
  data: AppData,
  input: {
    id: string;
    period: ReviewPeriod;
    createdAt: number;
    resultIds: string[];
  },
): AppData {
  if (reviewForPeriod(data, input.period)) return data;
  const history = historyItemsForPeriod(data, input.period);
  if (history.length !== input.resultIds.length)
    throw new Error('Each history item needs one review result id');
  const review: PeriodReview = {
    id: input.id,
    period: input.period,
    status: 'draft',
    createdAt: input.createdAt,
    goalSnapshot: goalsForPeriod(data, input.period)
      .map((goal) => goal.text.trim())
      .filter(Boolean),
    results: history.map((item, index) => ({
      id: input.resultIds[index],
      text: item.text,
      included: true,
      sourceHistoryItemId: item.id,
    })),
  };
  return { ...data, reviews: [...(data.reviews ?? []), review] };
}

export function updateReviewResult(
  data: AppData,
  reviewId: string,
  resultId: string,
  change: (result: ReviewResult) => ReviewResult,
): AppData {
  return updateReview(data, reviewId, (review) => ({
    ...review,
    results: review.results.map((result) =>
      result.id === resultId ? change(result) : result,
    ),
  }));
}

export function appendReviewResult(
  data: AppData,
  reviewId: string,
  result: ReviewResult,
): AppData {
  return updateReview(data, reviewId, (review) => ({
    ...review,
    results: [...review.results, result],
  }));
}

export function removeReviewResult(
  data: AppData,
  reviewId: string,
  resultId: string,
): AppData {
  return updateReview(data, reviewId, (review) => ({
    ...review,
    results: review.results.filter((result) => result.id !== resultId),
  }));
}

export function completePeriodReview(
  data: AppData,
  reviewId: string,
  completedAt: number,
): AppData {
  return updateReview(data, reviewId, (review) => ({
    ...review,
    status: 'completed',
    completedAt: review.completedAt ?? completedAt,
    goalSnapshot: goalsForPeriod(data, review.period)
      .map((goal) => goal.text.trim())
      .filter(Boolean),
  }));
}

function updateReview(
  data: AppData,
  id: string,
  change: (review: PeriodReview) => PeriodReview,
): AppData {
  return {
    ...data,
    reviews: (data.reviews ?? []).map((review) =>
      review.id === id ? change(review) : review,
    ),
  };
}
