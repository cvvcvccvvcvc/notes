import type {
  RemoteSnapshot,
  SyncPutConflict,
  SyncPutRequest,
  SyncPutSuccess,
} from './types';

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok)
    throw new SyncHttpError(
      response.status,
      `Sync request failed: ${response.status}`,
    );
  return response.json() as Promise<T>;
}

export async function fetchRemoteSnapshot() {
  const response = await fetch('/api/sync', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  return responseJson<RemoteSnapshot>(response);
}

export async function putRemoteSnapshot(request: SyncPutRequest) {
  const response = await fetch('/api/sync', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (response.status === 409)
    return response.json() as Promise<SyncPutConflict>;
  return responseJson<SyncPutSuccess>(response);
}
