import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from './data';
import {
  acceptTemplateSuggestion,
  skipTemplateSuggestion,
  templateSuggestions,
  defaultMonthTemplateSchedule,
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

void test('opening a month exposes dates and suggestions without writing tasks', () => {
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
    result.schedule['2027-01-07'],
    current.schedule['2027-01-07'],
  );
  assert.equal(Object.values(result.schedule).flat().length, 1);
  assert.deepEqual(
    templateSuggestions(result, ['2027-01-07']).map((item) => item.rule.id),
    ['weekly'],
  );
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
    templateSuggestions(createMonthFromTemplate(february, '2027-03'), [
      '2027-03-31',
    ])[0].id,
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

void test('daily suggestions are derived, skips apply to one date and rule removal removes ghosts', () => {
  const current = appendMonthTemplateRule(
    { ...data(), monthPlanning: { rules: [], createdMonths: [] } },
    {
      id: 'daily',
      text: 'Вода',
      schedule: { kind: 'daily' },
    },
  );
  assert.deepEqual(defaultMonthTemplateSchedule('daily'), { kind: 'daily' });
  assert.equal(
    templateSuggestions(current, ['2027-02-01', '2027-02-02']).length,
    2,
  );
  const skipped = skipTemplateSuggestion(current, 'daily', '2027-02-01');
  assert.deepEqual(
    templateSuggestions(skipped, ['2027-02-01', '2027-02-02']).map(
      (item) => item.day,
    ),
    ['2027-02-02'],
  );
  assert.equal(skipTemplateSuggestion(skipped, 'daily', '2027-02-01'), skipped);
  assert.equal(
    templateSuggestions(removeMonthTemplateRule(skipped, 'daily'), [
      '2027-02-02',
    ]).length,
    0,
  );
});

void test('plans and actual completion day satisfy a rule, other dates and backlog do not', () => {
  const current = appendMonthTemplateRule(
    { ...data(), monthPlanning: { rules: [], createdMonths: [] } },
    {
      id: 'daily',
      text: 'Вода',
      schedule: { kind: 'daily' },
    },
  );
  current.schedule['2027-02-01'] = [
    { id: 'manual', text: '  ВОДА  ', intervals: [] },
  ];
  current.history = [
    {
      id: 'h',
      taskId: 'old',
      text: 'Вода',
      intervals: [],
      finishedAt: new Date('2027-02-02T12:00:00').getTime(),
      finishedDay: '2027-02-02',
    },
  ];
  current.backlog = [
    {
      id: 'project',
      title: 'Проект',
      tasks: [{ id: 'later', text: 'Вода', intervals: [] }],
    },
  ];
  assert.deepEqual(
    templateSuggestions(current, [
      '2027-02-01',
      '2027-02-02',
      '2027-02-03',
    ]).map((item) => item.day),
    ['2027-02-03'],
  );
  delete current.history[0].finishedDay;
  assert.equal(templateSuggestions(current, ['2027-02-02']).length, 0);
});

void test('accepting preserves color and time, is idempotent and survives removal of the rule', () => {
  const current = appendMonthTemplateRule(
    { ...data(), monthPlanning: { rules: [], createdMonths: [] } },
    {
      id: 'daily',
      text: '09:30 Вода',
      color: 'rose',
      schedule: { kind: 'daily' },
    },
  );
  const input = {
    ruleId: 'daily',
    day: '2027-02-01',
    targetDay: '2027-02-01',
    taskId: 'new',
  };
  const accepted = acceptTemplateSuggestion(current, input);
  assert.deepEqual(accepted.schedule[input.day][0], {
    id: 'month-template:daily:2027-02-01',
    templateRuleId: 'daily',
    text: 'Вода',
    intervals: [],
    plannedStart: '09:30',
    color: 'rose',
  });
  assert.equal(acceptTemplateSuggestion(accepted, input), accepted);
  assert.equal(
    removeMonthTemplateRule(accepted, 'daily').schedule[input.day].length,
    1,
  );
});

void test('moving a suggestion leaves the original day due and can be accepted there without duplicate ids', () => {
  const current = appendMonthTemplateRule(
    { ...data(), monthPlanning: { rules: [], createdMonths: [] } },
    {
      id: 'daily',
      text: 'Вода',
      schedule: { kind: 'daily' },
    },
  );
  const moved = acceptTemplateSuggestion(current, {
    ruleId: 'daily',
    day: '2027-02-01',
    targetDay: '2027-02-02',
    taskId: 'moved',
  });
  assert.deepEqual(
    templateSuggestions(moved, ['2027-02-01', '2027-02-02']).map(
      (item) => item.day,
    ),
    ['2027-02-01'],
  );
  const added = acceptTemplateSuggestion(moved, {
    ruleId: 'daily',
    day: '2027-02-01',
    targetDay: '2027-02-01',
    taskId: 'replacement',
  });
  assert.equal(added.schedule['2027-02-01'][0].id, 'replacement');
  assert.notEqual(
    added.schedule['2027-02-01'][0].id,
    added.schedule['2027-02-02'][0].id,
  );
});

void test('linked and legacy tasks satisfy edited rules and completion retains their provenance', () => {
  const current = appendMonthTemplateRule(
    { ...data(), monthPlanning: { rules: [], createdMonths: [] } },
    {
      id: 'daily',
      text: 'Новое название',
      schedule: { kind: 'daily' },
    },
  );
  current.schedule['2027-02-01'] = [
    {
      id: 'month-template:daily:2027-01-31',
      text: 'Старое название',
      intervals: [],
    },
  ];
  current.history = [
    {
      id: 'h',
      taskId: 'done',
      templateRuleId: 'daily',
      text: 'Другое название',
      finishedAt: 0,
      finishedDay: '2027-02-02',
      intervals: [],
    },
  ];
  assert.equal(
    templateSuggestions(current, ['2027-02-01', '2027-02-02']).length,
    0,
  );
});
