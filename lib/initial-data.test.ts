/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyAppData } from './initial-data.ts';
import { validateAppData } from './sync/merge.ts';

void test('fresh local data is empty and satisfies sync invariants', () => {
  const data = createEmptyAppData('2026-09-05');

  assert.deepEqual(data.schedule, { '2026-09-05': [] });
  assert.deepEqual(data.notes, []);
  assert.deepEqual(data.history, []);
  assert.equal(data.rules?.length, 3);
  assert.deepEqual(data.backlog, []);
  assert.equal(data.version, 8);
  assert.deepEqual(validateAppData(data, 'local'), []);
});
