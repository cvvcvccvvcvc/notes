/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyAppData } from './initial-data';
import {
  appendRule,
  moveRule,
  moveRuleTo,
  removeRule,
  restoreRule,
  updateRule,
} from './rule-operations';

void test('rule operations preserve ids and explicit order', () => {
  let data = { ...createEmptyAppData('2026-09-06'), rules: [] };
  data = appendRule(data, { id: 'one', text: 'One' });
  data = appendRule(data, { id: 'two', text: 'Two' });
  data = appendRule(data, { id: 'three', text: 'Three' });
  data = updateRule(data, 'two', (rule) => ({ ...rule, text: 'Updated' }));
  data = moveRule(data, 'two', -1);
  data = moveRuleTo(data, 'three', 'one');

  assert.deepEqual(data.rules, [
    { id: 'two', text: 'Updated' },
    { id: 'three', text: 'Three' },
    { id: 'one', text: 'One' },
  ]);

  data = removeRule(data, 'three');
  data = restoreRule(data, { id: 'three', text: 'Three' }, 1);
  assert.deepEqual(
    data.rules?.map((rule) => rule.id),
    ['two', 'three', 'one'],
  );
});
