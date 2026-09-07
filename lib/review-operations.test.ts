import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import {
  appendGoal,
  completePeriodReview,
  createPeriodReview,
  currentReviewPeriod,
  dueReviewPeriods,
  moveReviewPeriod,
  reviewPeriodRange,
  updateReviewResult,
} from './review-operations';

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 5,
    schedule: {},
    notes: [],
    history: [],
    goals: [],
    reviews: [],
    ...overrides,
  };
}

void test('weeks remain Monday through Sunday across month boundaries', () => {
  const week = currentReviewPeriod('week', '2026-09-01');
  assert.deepEqual(week, { kind: 'week', key: '2026-08-31' });
  assert.deepEqual(reviewPeriodRange(week), {
    start: '2026-08-31',
    end: '2026-09-06',
  });
  assert.deepEqual(moveReviewPeriod(week, 1), {
    kind: 'week',
    key: '2026-09-07',
  });
});

void test('every missed finished period remains due until completed', () => {
  const current = data({ reviewTrackingStartedOn: '2026-08-31' });
  assert.deepEqual(dueReviewPeriods(current, '2026-09-15'), [
    { kind: 'week', key: '2026-08-24' },
    { kind: 'month', key: '2026-08' },
    { kind: 'week', key: '2026-08-31' },
    { kind: 'week', key: '2026-09-07' },
  ]);

  const withFirstCompleted = {
    ...current,
    reviews: [
      {
        id: 'review-one',
        period: { kind: 'week' as const, key: '2026-08-31' },
        results: [],
        goalSnapshot: [],
        status: 'completed' as const,
        createdAt: 1,
        completedAt: 2,
      },
    ],
  };
  assert.deepEqual(dueReviewPeriods(withFirstCompleted, '2026-09-15'), [
    { kind: 'week', key: '2026-08-24' },
    { kind: 'month', key: '2026-08' },
    { kind: 'week', key: '2026-09-07' },
  ]);
});

void test('first launch only adopts periods that become due from that day', () => {
  assert.deepEqual(
    dueReviewPeriods(
      data({ reviewTrackingStartedOn: '2026-09-07' }),
      '2026-09-07',
    ),
    [{ kind: 'week', key: '2026-08-31' }],
  );
});

void test('review edits its own snapshot without changing day history', () => {
  const current = appendGoal(
    data({
      history: [
        {
          id: 'history-one',
          taskId: 'task-one',
          text: 'Сделать черновик',
          finishedAt: 10,
          finishedDay: '2026-09-02',
          intervals: [],
        },
      ],
    }),
    {
      id: 'goal-one',
      period: { kind: 'week', key: '2026-08-31' },
      text: 'Запустить черновик',
    },
  );
  const started = createPeriodReview(current, {
    id: 'review-one',
    period: { kind: 'week', key: '2026-08-31' },
    createdAt: 20,
    resultIds: ['result-one'],
  });
  const edited = updateReviewResult(
    started,
    'review-one',
    'result-one',
    (result) => ({ ...result, text: 'Черновик готов' }),
  );
  const completed = completePeriodReview(edited, 'review-one', 30);

  assert.equal(completed.history[0].text, 'Сделать черновик');
  assert.equal(completed.reviews?.[0].results[0].text, 'Черновик готов');
  assert.deepEqual(completed.reviews?.[0].goalSnapshot, ['Запустить черновик']);
  assert.equal(completed.reviews?.[0].status, 'completed');
});
