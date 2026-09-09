import assert from 'node:assert/strict';
import test from 'node:test';

import { appDataSchema } from '../src/shared/data-schema';
import type { AppData, MonthTemplateRule } from './data';
import { createMonthFromTemplate } from './month-template';

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 6,
    schedule: {},
    backlog: [],
    notes: [],
    history: [],
    ...overrides,
  };
}

void test('persisted data accepts only real calendar days', () => {
  assert.equal(
    appDataSchema.safeParse(data({ schedule: { '2026-02-28': [] } })).success,
    true,
  );
  assert.equal(
    appDataSchema.safeParse(data({ schedule: { '2026-02-29': [] } })).success,
    false,
  );
  assert.equal(
    appDataSchema.safeParse(data({ schedule: { someday: [] } })).success,
    false,
  );
});

void test('persisted task intervals are chronological with at most one open tail', () => {
  const task = (intervals: Array<{ start: number; end?: number }>) =>
    data({
      schedule: { '2026-09-09': [{ id: 'task', text: 'Дело', intervals }] },
    });

  assert.equal(
    appDataSchema.safeParse(task([{ start: 10, end: 20 }, { start: 20 }]))
      .success,
    true,
  );
  assert.equal(
    appDataSchema.safeParse(task([{ start: 20, end: 10 }])).success,
    false,
  );
  assert.equal(
    appDataSchema.safeParse(task([{ start: 10 }, { start: 20 }])).success,
    false,
  );
  assert.equal(
    appDataSchema.safeParse(
      task([
        { start: 20, end: 30 },
        { start: 10, end: 40 },
      ]),
    ).success,
    false,
  );
});

void test('history cannot contain a running interval', () => {
  const current = data({
    history: [
      {
        id: 'history',
        taskId: 'task',
        text: 'Дело',
        finishedAt: 20,
        intervals: [{ start: 10 }],
      },
    ],
  });

  assert.equal(appDataSchema.safeParse(current).success, false);
});

void test('month generation keeps deterministic task ids inside the schema limit', () => {
  const rule: MonthTemplateRule = {
    id: 'r'.repeat(160),
    text: 'Дело',
    schedule: { kind: 'annual', month: 9, day: 9 },
  };
  const current = data({
    monthPlanning: { rules: [rule], createdMonths: [] },
  });

  const first = createMonthFromTemplate(current, '2026-09');
  const second = createMonthFromTemplate(current, '2026-09');
  const generated = first.schedule['2026-09-09'][0];

  assert.equal(generated.id.length <= 160, true);
  assert.equal(generated.id, second.schedule['2026-09-09'][0].id);
  assert.equal(appDataSchema.safeParse(first).success, true);
});
