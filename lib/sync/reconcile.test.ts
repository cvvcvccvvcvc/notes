/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData } from '../data.ts';
import {
  reconcileRemoteSnapshot,
  reconcileRevisionConflict,
  sameAppData,
} from './reconcile.ts';
import type { SyncEnvelope } from './types.ts';

function data(text: string): AppData {
  return {
    version: 3,
    schedule: {
      '2026-09-05': [{ id: 'task', text, intervals: [] }],
    },
    backlog: [],
    monthPlanning: { rules: [], createdMonths: ['2026-09'] },
    notes: [],
    history: [],
  };
}

function envelope(input: {
  current: AppData;
  base?: AppData | null;
  revision?: number | null;
  dirty?: boolean;
}): SyncEnvelope {
  return {
    data: input.current,
    sync: {
      schemaVersion: 1,
      baseRevision: input.revision ?? null,
      base: input.base ?? null,
      dirty: input.dirty ?? false,
    },
  };
}

const unchanged = (value: AppData) => value;

void test('uploads a fresh local state only when the server is empty', () => {
  assert.deepEqual(
    reconcileRemoteSnapshot(
      envelope({ current: data('local') }),
      { revision: 0, data: null },
      unchanged,
    ),
    { kind: 'upload', baseRevision: 0 },
  );
});

void test('a fresh clean device adopts the existing server state', () => {
  const remote = data('remote');
  const result = reconcileRemoteSnapshot(
    envelope({ current: data('local') }),
    { revision: 4, data: remote },
    unchanged,
  );
  assert.equal(result.kind, 'persist');
  if (result.kind === 'persist') {
    assert.equal(result.envelope.data, remote);
    assert.equal(result.envelope.sync.baseRevision, 4);
    assert.equal(result.needsSync, false);
  }
});

void test('a fresh dirty device does not overwrite an existing server', () => {
  const result = reconcileRemoteSnapshot(
    envelope({ current: data('local'), dirty: true }),
    { revision: 4, data: data('remote') },
    unchanged,
  );
  assert.equal(result.kind, 'conflict');
});

void test('JSON key order does not turn equal states into a conflict', () => {
  const local = {
    ...data('same'),
    schedule: {
      '2026-09-05': [{ id: 'task', text: 'same', intervals: [] }],
      '2026-09-06': [],
    },
  };
  const remote = {
    ...local,
    schedule: {
      '2026-09-06': [],
      '2026-09-05': [{ intervals: [], text: 'same', id: 'task' }],
    },
  };

  assert.equal(sameAppData(local, remote), true);
  const result = reconcileRemoteSnapshot(
    envelope({ current: local, dirty: true }),
    { revision: 4, data: remote },
    unchanged,
  );
  assert.equal(result.kind, 'persist');
  if (result.kind === 'persist') assert.equal(result.needsSync, false);
});

void test('an unchanged revision uploads only dirty local data', () => {
  const base = data('base');
  assert.deepEqual(
    reconcileRemoteSnapshot(
      envelope({ current: data('local'), base, revision: 4, dirty: true }),
      { revision: 4, data: base },
      unchanged,
    ),
    { kind: 'upload', baseRevision: 4 },
  );
  assert.deepEqual(
    reconcileRemoteSnapshot(
      envelope({ current: base, base, revision: 4 }),
      { revision: 4, data: base },
      unchanged,
    ),
    { kind: 'synced' },
  );
});

void test('a stale write merges independent edits and reports real conflicts', () => {
  const base = data('base');
  const local = {
    ...base,
    notes: [{ id: 'local', title: '', content: '', color: 'white' as const }],
  };
  const remote = {
    ...base,
    history: [
      {
        id: 'remote',
        taskId: 'task',
        text: 'base',
        finishedAt: 1,
        intervals: [],
      },
    ],
  };
  const merged = reconcileRevisionConflict(
    envelope({ current: local, base, revision: 1, dirty: true }),
    { revision: 2, data: remote },
    unchanged,
  );
  assert.equal(merged.kind, 'persist');
  if (merged.kind === 'persist') {
    assert.equal(merged.envelope.data.notes.length, 1);
    assert.equal(merged.envelope.data.history.length, 1);
    assert.equal(merged.needsSync, true);
  }

  const conflict = reconcileRevisionConflict(
    envelope({ current: data('local'), base, revision: 1, dirty: true }),
    { revision: 2, data: data('remote') },
    unchanged,
  );
  assert.equal(conflict.kind, 'conflict');
});
