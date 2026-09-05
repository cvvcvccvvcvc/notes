import { createHash } from 'node:crypto';
import {
  appDataSchema,
  type SyncConflict,
  type SyncPutRequest,
  type SyncPutResponse,
  type SyncSnapshot,
} from '../shared/sync-schema.js';
import type { NotesDatabase } from './database.js';

type StoredState = {
  revision: number;
  data_json: string;
};

type StoredReceipt = {
  request_hash: string;
  status_code: number;
  response_json: string;
};

const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type RepositoryPutResult = {
  statusCode: 200 | 409;
  body: SyncPutResponse;
  replayed: boolean;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function requestHash(request: SyncPutRequest) {
  return createHash('sha256').update(canonicalJson(request)).digest('hex');
}

export class SyncRepository {
  private readonly getStateStatement;
  private readonly insertStateStatement;
  private readonly updateStateStatement;
  private readonly getReceiptStatement;
  private readonly insertReceiptStatement;
  private readonly deleteExpiredReceiptsStatement;
  private readonly putTransaction;

  constructor(private readonly database: NotesDatabase) {
    this.getStateStatement = database.prepare(
      'SELECT revision, data_json FROM owner_state WHERE owner_id = ?',
    );
    this.insertStateStatement = database.prepare(
      `INSERT INTO owner_state (owner_id, revision, data_json, updated_at)
       VALUES (?, ?, ?, ?)`,
    );
    this.updateStateStatement = database.prepare(
      `UPDATE owner_state
       SET revision = ?, data_json = ?, updated_at = ?
       WHERE owner_id = ? AND revision = ?`,
    );
    this.getReceiptStatement = database.prepare(
      `SELECT request_hash, status_code, response_json
       FROM request_receipts
       WHERE owner_id = ? AND request_id = ?`,
    );
    this.insertReceiptStatement = database.prepare(
      `INSERT INTO request_receipts
       (owner_id, request_id, request_hash, status_code, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    this.deleteExpiredReceiptsStatement = database.prepare(
      'DELETE FROM request_receipts WHERE created_at < ?',
    );
    this.putTransaction = database.transaction(
      (ownerId: string, request: SyncPutRequest): RepositoryPutResult =>
        this.putInsideTransaction(ownerId, request),
    );
  }

  get(ownerId: string): SyncSnapshot {
    const row = this.getStateStatement.get(ownerId) as StoredState | undefined;
    if (!row) return { revision: 0, data: null };
    return {
      revision: row.revision,
      data: appDataSchema.parse(JSON.parse(row.data_json)),
    };
  }

  put(ownerId: string, request: SyncPutRequest): RepositoryPutResult {
    return this.putTransaction.immediate(ownerId, request);
  }

  private putInsideTransaction(
    ownerId: string,
    request: SyncPutRequest,
  ): RepositoryPutResult {
    this.deleteExpiredReceiptsStatement.run(Date.now() - RECEIPT_RETENTION_MS);
    const hash = requestHash(request);
    const receipt = this.getReceiptStatement.get(ownerId, request.requestId) as
      | StoredReceipt
      | undefined;

    if (receipt) {
      if (receipt.request_hash === hash)
        return {
          statusCode: receipt.status_code as 200 | 409,
          body: JSON.parse(receipt.response_json) as SyncPutResponse,
          replayed: true,
        };
      return {
        statusCode: 409,
        body: this.conflict(
          'REQUEST_ID_REUSED',
          'requestId was already used for a different payload',
          ownerId,
        ),
        replayed: false,
      };
    }

    const current = this.get(ownerId);
    if (current.revision !== request.baseRevision) {
      const body = this.conflict(
        'REVISION_CONFLICT',
        'The server contains a newer or different revision',
        ownerId,
      );
      this.storeReceipt(ownerId, request.requestId, hash, 409, body);
      return { statusCode: 409, body, replayed: false };
    }

    const nextRevision = current.revision + 1;
    const dataJson = JSON.stringify(request.data);
    const now = Date.now();
    if (current.revision === 0)
      this.insertStateStatement.run(ownerId, nextRevision, dataJson, now);
    else {
      const updated = this.updateStateStatement.run(
        nextRevision,
        dataJson,
        now,
        ownerId,
        current.revision,
      );
      if (updated.changes !== 1)
        throw new Error(
          'Concurrent state update escaped the write transaction',
        );
    }

    const body = { ok: true, revision: nextRevision } as const;
    this.storeReceipt(ownerId, request.requestId, hash, 200, body);
    return { statusCode: 200, body, replayed: false };
  }

  private conflict(
    code: SyncConflict['error']['code'],
    message: string,
    ownerId: string,
  ): SyncConflict {
    return {
      ok: false,
      error: { code, message },
      remote: this.get(ownerId),
    };
  }

  private storeReceipt(
    ownerId: string,
    requestId: string,
    hash: string,
    statusCode: 200 | 409,
    body: SyncPutResponse,
  ) {
    this.insertReceiptStatement.run(
      ownerId,
      requestId,
      hash,
      statusCode,
      JSON.stringify(body),
      Date.now(),
    );
  }
}
