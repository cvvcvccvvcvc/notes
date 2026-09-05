import { useCallback, useEffect, useRef, useState } from 'react';

import { createDemoData, type AppData } from '@/lib/data';
import { migrateAppData } from '@/lib/migrations';
import { importPreviewSchedule } from '@/lib/preview-schedule';
import { rolloverPastTasks } from '@/lib/rollover';
import { loadEnvelope, saveEnvelope } from '@/lib/storage';
import {
  fetchRemoteSnapshot,
  putRemoteSnapshot,
  SyncHttpError,
} from '@/lib/sync/api';
import { mergeAppData } from '@/lib/sync/merge';
import type {
  MergeConflict,
  RemoteSnapshot,
  SyncEnvelope,
} from '@/lib/sync/types';

export type LocalSaveState = 'loading' | 'saving' | 'saved' | 'error';
export type SyncState =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'auth'
  | 'conflict'
  | 'error';

function normalize(data: AppData, today: string) {
  return rolloverPastTasks(
    migrateAppData(importPreviewSchedule(data, today)),
    today,
  );
}

function sameData(left: AppData, right: AppData) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function connectionFailure(error: unknown): SyncState {
  if (error instanceof SyncHttpError && error.status === 401) return 'auth';
  if (!navigator.onLine || error instanceof TypeError) return 'offline';
  return 'error';
}

export function useSyncedAppData(today: string) {
  const [data, setData] = useState<AppData | null>(null);
  const [saveState, setSaveState] = useState<LocalSaveState>('loading');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const dataRef = useRef<AppData | null>(null);
  const envelopeRef = useRef<SyncEnvelope | null>(null);
  const todayRef = useRef(today);
  const mountedRef = useRef(true);
  const syncingRef = useRef(false);
  const syncRequestedRef = useRef(false);
  const latestSaveRef = useRef<Promise<void>>(Promise.resolve());
  const syncTimerRef = useRef<number | null>(null);

  const persist = useCallback(async (envelope: SyncEnvelope) => {
    envelopeRef.current = envelope;
    dataRef.current = envelope.data;
    if (mountedRef.current) {
      setData(envelope.data);
      setSaveState('saving');
    }
    try {
      const save = saveEnvelope(envelope);
      latestSaveRef.current = save;
      await save;
      if (mountedRef.current && envelopeRef.current === envelope)
        setSaveState('saved');
    } catch {
      if (mountedRef.current) setSaveState('error');
      throw new Error('Local save failed');
    }
  }, []);

  const waitForLocalSave = useCallback(async () => {
    let save = latestSaveRef.current;
    await save;
    while (save !== latestSaveRef.current) {
      save = latestSaveRef.current;
      await save;
    }
  }, []);

  const setConflict = useCallback(
    async (
      envelope: SyncEnvelope,
      remote: RemoteSnapshot,
      conflicts: MergeConflict[],
    ) => {
      await persist({
        ...envelope,
        sync: {
          ...envelope.sync,
          pending: undefined,
          conflict: { remote, conflicts },
        },
      });
      if (mountedRef.current) setSyncState('conflict');
    },
    [persist],
  );

  const upload = useCallback(
    async (startingEnvelope: SyncEnvelope, baseRevision: number) => {
      let request = startingEnvelope.sync.pending;
      if (!request) {
        request = {
          requestId: crypto.randomUUID(),
          baseRevision,
          data: structuredClone(startingEnvelope.data),
        };
        await persist({
          ...startingEnvelope,
          sync: { ...startingEnvelope.sync, pending: request },
        });
      }

      const response = await putRemoteSnapshot(request);
      const current = envelopeRef.current;
      if (!current) return;
      if (!response.ok) {
        if (response.error.code === 'REVISION_CONFLICT') {
          const base = current.sync.base;
          if (base && response.remote.data) {
            const merged = mergeAppData({
              base,
              local: current.data,
              remote: response.remote.data,
            });
            if (merged.ok) {
              const nextData = normalize(merged.data, todayRef.current);
              await persist({
                data: nextData,
                sync: {
                  schemaVersion: 1,
                  baseRevision: response.remote.revision,
                  base: response.remote.data,
                  dirty: !sameData(nextData, response.remote.data),
                },
              });
              syncRequestedRef.current = true;
              return;
            }
            await setConflict(current, response.remote, merged.conflicts);
            return;
          }
          await setConflict(current, response.remote, []);
          return;
        }
        await setConflict(current, response.remote, []);
        return;
      }

      const dirty = !sameData(current.data, request.data);
      await persist({
        data: current.data,
        sync: {
          schemaVersion: 1,
          baseRevision: response.revision,
          base: request.data,
          dirty,
        },
      });
      if (dirty) syncRequestedRef.current = true;
      else if (mountedRef.current) setSyncState('synced');
    },
    [persist, setConflict],
  );

  const syncOnce = useCallback(async () => {
    // A previous local write may have completed while a newer one is still
    // queued. Never upload the newer in-memory snapshot before it is durable.
    await waitForLocalSave();
    const initial = envelopeRef.current;
    if (!initial || initial.sync.conflict) {
      if (initial?.sync.conflict && mountedRef.current)
        setSyncState('conflict');
      return;
    }
    if (mountedRef.current) setSyncState('syncing');

    if (initial.sync.pending) {
      await upload(initial, initial.sync.pending.baseRevision);
      return;
    }

    const remote = await fetchRemoteSnapshot();
    const current = envelopeRef.current;
    if (!current) return;

    if (current.sync.baseRevision === null) {
      if (remote.data === null) {
        await upload(current, remote.revision);
        return;
      }
      if (sameData(current.data, remote.data)) {
        await persist({
          data: current.data,
          sync: {
            schemaVersion: 1,
            baseRevision: remote.revision,
            base: remote.data,
            dirty: false,
          },
        });
        if (mountedRef.current) setSyncState('synced');
        return;
      }
      if (!current.sync.dirty) {
        const nextData = normalize(remote.data, todayRef.current);
        const dirty = !sameData(nextData, remote.data);
        await persist({
          data: nextData,
          sync: {
            schemaVersion: 1,
            baseRevision: remote.revision,
            base: remote.data,
            dirty,
          },
        });
        if (dirty) syncRequestedRef.current = true;
        else if (mountedRef.current) setSyncState('synced');
        return;
      }
      await setConflict(current, remote, []);
      return;
    }

    if (current.sync.baseRevision === remote.revision) {
      if (current.sync.dirty) await upload(current, remote.revision);
      else if (mountedRef.current) setSyncState('synced');
      return;
    }

    if (!current.sync.dirty && remote.data) {
      const nextData = normalize(remote.data, todayRef.current);
      const dirty = !sameData(nextData, remote.data);
      await persist({
        data: nextData,
        sync: {
          schemaVersion: 1,
          baseRevision: remote.revision,
          base: remote.data,
          dirty,
        },
      });
      if (dirty) syncRequestedRef.current = true;
      else if (mountedRef.current) setSyncState('synced');
      return;
    }

    if (!current.sync.base || !remote.data) {
      await setConflict(current, remote, []);
      return;
    }
    const merged = mergeAppData({
      base: current.sync.base,
      local: current.data,
      remote: remote.data,
    });
    if (!merged.ok) {
      await setConflict(current, remote, merged.conflicts);
      return;
    }
    const nextData = normalize(merged.data, todayRef.current);
    await persist({
      data: nextData,
      sync: {
        schemaVersion: 1,
        baseRevision: remote.revision,
        base: remote.data,
        dirty: !sameData(nextData, remote.data),
      },
    });
    syncRequestedRef.current = true;
  }, [persist, setConflict, upload, waitForLocalSave]);

  /* oxlint-disable react/react-compiler -- serialized callback intentionally depends on syncOnce */
  const synchronize = useCallback(async () => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    syncRequestedRef.current = true;
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      while (syncRequestedRef.current) {
        syncRequestedRef.current = false;
        try {
          await syncOnce();
        } catch (error) {
          if (mountedRef.current) setSyncState(connectionFailure(error));
          break;
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [syncOnce]);
  /* oxlint-enable react/react-compiler */

  const scheduleSynchronize = useCallback(() => {
    if (syncTimerRef.current !== null)
      window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void synchronize();
    }, 500);
  }, [synchronize]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void loadEnvelope()
      .then(async (stored) => {
        if (!active) return;
        const initialData = normalize(
          stored?.data ?? createDemoData(todayRef.current),
          todayRef.current,
        );
        const envelope: SyncEnvelope = stored
          ? {
              data: initialData,
              sync: {
                ...stored.sync,
                dirty: stored.sync.dirty || !sameData(initialData, stored.data),
              },
            }
          : {
              data: initialData,
              sync: {
                schemaVersion: 1,
                baseRevision: null,
                base: null,
                dirty: false,
              },
            };
        await persist(envelope);
        if (active) void synchronize();
      })
      .catch(() => active && setSaveState('error'));
    return () => {
      active = false;
      mountedRef.current = false;
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [persist, synchronize]);

  useEffect(() => {
    todayRef.current = today;
    const current = envelopeRef.current;
    if (!current) return;
    const nextData = normalize(current.data, today);
    if (nextData === current.data) return;
    void persist({
      data: nextData,
      sync: { ...current.sync, dirty: true },
    }).then(synchronize);
  }, [persist, synchronize, today]);

  useEffect(() => {
    const resume = () => void synchronize();
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    return () => {
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
    };
  }, [synchronize]);

  const commit = useCallback(
    (change: (current: AppData) => AppData) => {
      const current = envelopeRef.current;
      if (!current) return;
      const nextData = change(current.data);
      if (nextData === current.data) return;
      const next: SyncEnvelope = {
        data: nextData,
        sync: { ...current.sync, dirty: true },
      };
      void persist(next)
        .then(scheduleSynchronize)
        .catch(() => undefined);
    },
    [persist, scheduleSynchronize],
  );

  const resolveConflict = useCallback(
    (choice: 'local' | 'remote') => {
      const current = envelopeRef.current;
      const conflict = current?.sync.conflict;
      if (!current || !conflict) return;
      const remoteData = conflict.remote.data;
      const nextData =
        choice === 'remote' && remoteData
          ? normalize(remoteData, todayRef.current)
          : current.data;
      const next: SyncEnvelope = {
        data: nextData,
        sync: {
          schemaVersion: 1,
          baseRevision: conflict.remote.revision,
          base: remoteData,
          dirty:
            choice === 'local' ||
            !remoteData ||
            !sameData(nextData, remoteData),
        },
      };
      void persist(next)
        .then(synchronize)
        .catch(() => undefined);
    },
    [persist, synchronize],
  );

  return {
    data,
    dataRef,
    saveState,
    syncState,
    commit,
    synchronize,
    resolveConflict,
  };
}
