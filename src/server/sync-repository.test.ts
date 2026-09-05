import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { SyncAppData, SyncPutRequest } from '../shared/sync-schema.js';
import { openDatabase, type NotesDatabase } from './database.js';
import { SyncRepository } from './sync-repository.js';

const firstData: SyncAppData = {
  version: 2,
  schedule: {},
  backlog: [],
  notes: [],
  history: [],
};

const requestId = 'b60c8f1a-a7ec-4a59-bcc4-903111c04d79';

void describe('SyncRepository', () => {
  let database: NotesDatabase;
  let repository: SyncRepository;

  beforeEach(() => {
    database = openDatabase(':memory:');
    repository = new SyncRepository(database);
  });

  afterEach(() => database.close());

  void it('creates and advances a state only through compare-and-swap', () => {
    assert.deepEqual(repository.get('owner'), { revision: 0, data: null });

    const first = repository.put('owner', putRequest(0, requestId, firstData));
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body, { ok: true, revision: 1 });
    assert.deepEqual(repository.get('owner'), { revision: 1, data: firstData });

    const changed = { ...firstData, notes: [note('one')] };
    const second = repository.put(
      'owner',
      putRequest(1, '5f36c12d-c38c-4f10-aaf5-b0304fc3a0df', changed),
    );
    assert.equal(second.statusCode, 200);
    assert.deepEqual(repository.get('owner'), { revision: 2, data: changed });
  });

  void it('returns the remote snapshot and does not overwrite on a stale revision', () => {
    repository.put('owner', putRequest(0, requestId, firstData));
    const staleData = { ...firstData, notes: [note('stale')] };

    const result = repository.put(
      'owner',
      putRequest(0, 'f96f7965-9445-48d1-a5d5-f171b288723c', staleData),
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.error.code, 'REVISION_CONFLICT');
      assert.deepEqual(result.body.remote, { revision: 1, data: firstData });
    }
    assert.deepEqual(repository.get('owner'), { revision: 1, data: firstData });
  });

  void it('replays an identical request without advancing the revision', () => {
    const request = putRequest(0, requestId, firstData);
    const original = repository.put('owner', request);
    const replay = repository.put('owner', structuredClone(request));

    assert.deepEqual(replay.body, original.body);
    assert.equal(replay.replayed, true);
    assert.equal(repository.get('owner').revision, 1);
  });

  void it('rejects reuse of a request id for a different payload', () => {
    repository.put('owner', putRequest(0, requestId, firstData));
    const different = { ...firstData, notes: [note('different')] };

    const result = repository.put('owner', putRequest(1, requestId, different));

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.ok, false);
    if (!result.body.ok)
      assert.equal(result.body.error.code, 'REQUEST_ID_REUSED');
    assert.deepEqual(repository.get('owner'), { revision: 1, data: firstData });
  });

  void it('keeps state isolated by the authenticated owner id', () => {
    repository.put('owner-a', putRequest(0, requestId, firstData));
    assert.deepEqual(repository.get('owner-b'), { revision: 0, data: null });
  });
});

function putRequest(
  baseRevision: number,
  id: string,
  data: SyncAppData,
): SyncPutRequest {
  return { requestId: id, baseRevision, data };
}

function note(id: string) {
  return { id, title: id, content: '', color: 'white' as const };
}
