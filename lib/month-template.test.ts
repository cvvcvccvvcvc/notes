import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import {
  createMonthFromTemplate,
  monthTemplateTaskCount,
  nextMonthKey,
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
  assert.equal(monthTemplateTaskCount(current, '2027-01'), 7);

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
  assert.deepEqual(
    ['2027-01-06', '2027-01-20'].map((day) => result.schedule[day][0].text),
    ['Через среду', 'Через среду'],
  );
  assert.equal(result.schedule['2027-01-15'][0].text, 'День рождения');
  assert.deepEqual(result.monthPlanning?.createdMonths, ['2026-12', '2027-01']);
  assert.equal(createMonthFromTemplate(result, '2027-01'), result);
});
