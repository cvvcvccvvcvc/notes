import assert from 'node:assert/strict';
import test from 'node:test';

import { hasTaskTitle, splitTaskText } from './task-text';

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
