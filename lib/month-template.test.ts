import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import {
  appendMonthTemplateRule,
  createMonthFromTemplate,
  moveMonthTemplateRule,
  monthTemplateTaskCount,
  nextMonthKey,
  removeMonthTemplateRule,
  updateMonthTemplateRule,
} from './month-template';

function data(): AppData {
  return {
    version: 3,
    schedule: {
      '2027-01-07': [{ id: 'existing', text: 'Уже записано', intervals: [] }],
    },
    backlog: [],
    monthPlanning: {
      createdMonths: ['2026-12'],
      rules: [
        {
          id: 'weekly',
          text: 'Каждый четверг',
          color: 'blue',
          schedule: { kind: 'weekly', weekday: 4 },
        },
        {
          id: 'fortnightly',
          text: 'Через среду',
          schedule: { kind: 'fortnightly', anchorDay: '2027-01-06' },
        },
        {
          id: 'monthly',
          text: 'Оплата',
          schedule: { kind: 'monthly', day: 20 },
        },
        {
          id: 'birthday',
          text: 'День рождения',
          schedule: { kind: 'annual', month: 1, day: 15 },
        },
        {
          id: 'blank',
          text: '   ',
          schedule: { kind: 'weekly', weekday: 1 },
        },
      ],
    },
    notes: [],
    history: [],
  };
}

void test('month generation materializes each date and matching rules exactly once', () => {
  const current = data();
  assert.equal(nextMonthKey(current, '2026-09-05'), '2027-01');
  assert.equal(monthTemplateTaskCount(current, '2027-01'), 8);

  const result = createMonthFromTemplate(current, '2027-01');

  assert.equal(
    Object.keys(result.schedule).filter((day) => day.startsWith('2027-01-'))
      .length,
    31,
  );
  assert.deepEqual(
    result.schedule['2027-01-07'].map((task) => task.id),
    ['existing', 'month-template:weekly:2027-01-07'],
  );
  assert.equal(result.schedule['2027-01-07'][1].color, 'blue');
  assert.equal(result.schedule['2027-01-06'][0].text, 'Через среду');
  assert.deepEqual(
    result.schedule['2027-01-20'].map((task) => task.text),
    ['Через среду', 'Оплата'],
  );
  assert.equal(result.schedule['2027-01-15'][0].text, 'День рождения');
  assert.deepEqual(result.monthPlanning?.createdMonths, ['2026-12', '2027-01']);
  assert.equal(createMonthFromTemplate(result, '2027-01'), result);
});

void test('a monthly date that does not exist is skipped without shifting', () => {
  const current: AppData = {
    version: 7,
    schedule: {},
    monthPlanning: {
      createdMonths: [],
      rules: [
        {
          id: 'last-day',
          text: 'Тридцать первое',
          schedule: { kind: 'monthly', day: 31 },
        },
      ],
    },
    notes: [],
    history: [],
  };
  assert.equal(monthTemplateTaskCount(current, '2027-02'), 0);
  assert.equal(monthTemplateTaskCount(current, '2027-03'), 1);
  const february = createMonthFromTemplate(current, '2027-02');
  assert.equal(Object.values(february.schedule).flat().length, 0);
  assert.equal(
    createMonthFromTemplate(february, '2027-03').schedule['2027-03-31'][0].id,
    'month-template:last-day:2027-03-31',
  );
});

void test('template rule operations preserve order and created months', () => {
  const current = data();
  const added = appendMonthTemplateRule(current, {
    id: 'new',
    text: 'Новое',
    schedule: { kind: 'weekly', weekday: 1 },
  });
  const updated = updateMonthTemplateRule(added, 'new', (rule) => ({
    ...rule,
    color: 'rose',
  }));
  const moved = moveMonthTemplateRule(updated, 'new', -1);
  const removed = removeMonthTemplateRule(moved, 'blank');

  assert.deepEqual(removed.monthPlanning?.createdMonths, ['2026-12']);
  assert.equal(removed.monthPlanning?.rules.at(-1)?.id, 'new');
  assert.equal(removed.monthPlanning?.rules.at(-1)?.color, 'rose');
  assert.equal(
    removed.monthPlanning?.rules.some((rule) => rule.id === 'blank'),
    false,
  );
});
