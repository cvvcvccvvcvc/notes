import assert from 'node:assert/strict';
import test from 'node:test';

import { hasTaskTitle, leadingTaskTime, splitTaskText } from './task-text';

void test('the first line is the task title', () => {
  assert.deepEqual(splitTaskText('Название\nОписание\nЕщё строка'), {
    title: 'Название',
    description: 'Описание\nЕщё строка',
  });
});

void test('description text cannot replace a missing task title', () => {
  assert.equal(hasTaskTitle('Название\nОписание'), true);
  assert.equal(hasTaskTitle('  Название  \nОписание'), true);
  assert.equal(hasTaskTitle(''), false);
  assert.equal(hasTaskTitle('   '), false);
  assert.equal(hasTaskTitle('\nОписание'), false);
  assert.equal(hasTaskTitle('   \nОписание'), false);
});

void test('a leading time becomes the planned start after the title begins', () => {
  assert.deepEqual(leadingTaskTime('17:00 - Встреча'), {
    plannedStart: '17:00',
    text: 'Встреча',
  });
  assert.deepEqual(leadingTaskTime('09:30 работа'), {
    plannedStart: '09:30',
    text: 'работа',
  });
  assert.equal(leadingTaskTime('17:00 '), null);
  assert.equal(leadingTaskTime('25:00 - ошибка'), null);
});
