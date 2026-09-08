import type { AppData } from '../data';
import { canonicalJson } from '../../src/shared/canonical-json';
import { mergeAppData } from './merge';
import type { MergeConflict, RemoteSnapshot, SyncEnvelope } from './types';

export type RemoteReconciliation =
  | { kind: 'upload'; baseRevision: number }
  | { kind: 'persist'; envelope: SyncEnvelope; needsSync: boolean }
  | { kind: 'synced' }
  | { kind: 'conflict'; remote: RemoteSnapshot; conflicts: MergeConflict[] };

export function sameAppData(left: AppData, right: AppData) {
  return canonicalJson(left) === canonicalJson(right);
}

function remoteEnvelope(
  data: AppData,
  remote: RemoteSnapshot,
  needsSync: boolean,
): RemoteReconciliation {
  return {
    kind: 'persist',
    envelope: {
      data,
      sync: {
        schemaVersion: 1,
        baseRevision: remote.revision,
        base: remote.data,
        dirty: needsSync,
      },
    },
    needsSync,
  };
}

function adoptRemote(
  remote: RemoteSnapshot & { data: AppData },
  normalize: (data: AppData) => AppData,
) {
  const data = normalize(remote.data);
  return remoteEnvelope(data, remote, !sameAppData(data, remote.data));
}

function mergeChangedRemote(
  current: SyncEnvelope,
  remote: RemoteSnapshot,
  normalize: (data: AppData) => AppData,
): RemoteReconciliation {
  if (!current.sync.base || !remote.data)
    return { kind: 'conflict', remote, conflicts: [] };
  const merged = mergeAppData({
    base: current.sync.base,
    local: current.data,
    remote: remote.data,
  });
  if (!merged.ok)
    return { kind: 'conflict', remote, conflicts: merged.conflicts };
  const data = normalize(merged.data);
  return remoteEnvelope(data, remote, !sameAppData(data, remote.data));
}

/** Decide how a durable local envelope should react to a fetched snapshot. */
export function reconcileRemoteSnapshot(
  current: SyncEnvelope,
  remote: RemoteSnapshot,
  normalize: (data: AppData) => AppData,
): RemoteReconciliation {
  if (current.sync.baseRevision === null) {
    if (remote.data === null)
      return { kind: 'upload', baseRevision: remote.revision };
    if (sameAppData(current.data, remote.data))
      return remoteEnvelope(current.data, remote, false);
    if (!current.sync.dirty)
      return adoptRemote({ ...remote, data: remote.data }, normalize);
    return { kind: 'conflict', remote, conflicts: [] };
  }

  if (current.sync.baseRevision === remote.revision)
    return current.sync.dirty
      ? { kind: 'upload', baseRevision: remote.revision }
      : { kind: 'synced' };

  if (!current.sync.dirty && remote.data)
    return adoptRemote({ ...remote, data: remote.data }, normalize);
  return mergeChangedRemote(current, remote, normalize);
}

/** Reconcile the current envelope after the server rejects a stale write. */
export function reconcileRevisionConflict(
  current: SyncEnvelope,
  remote: RemoteSnapshot,
  normalize: (data: AppData) => AppData,
) {
  return mergeChangedRemote(current, remote, normalize);
}
