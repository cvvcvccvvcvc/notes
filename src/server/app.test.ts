import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ServerConfig } from './config.js';
import { createApp } from './app.js';
import { openDatabase, type NotesDatabase } from './database.js';
import { hashPassword } from './password.js';

const origin = 'https://notes.example';
const password = 'test password';
const passwordHash = await hashPassword(password);

void describe('sync HTTP boundary', () => {
  let database: NotesDatabase;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    database = openDatabase(':memory:');
    app = await createApp({
      config: testConfig(),
      database,
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
    database.close();
  });

  void it('requires an allowed origin to create a session', async () => {
    const missingOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password },
    });
    assert.equal(missingOrigin.statusCode, 403);

    const allowed = await login();
    assert.equal(allowed.statusCode, 200);
    const setCookie = allowed.headers['set-cookie'];
    assert.equal(typeof setCookie, 'string');
    if (typeof setCookie === 'string') {
      assert.match(setCookie, /notes_session=/);
      assert.match(setCookie, /Max-Age=7776000/);
      assert.match(setCookie, /Expires=/);
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Lax/);
    }
  });

  void it('accepts the rate-limited HTML login form without Origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `password=${encodeURIComponent(password)}`,
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/');
    assert.match(String(response.headers['set-cookie']), /notes_session=/);
  });

  void it('protects sync and accepts a valid compare-and-swap write', async () => {
    assert.equal((await app.inject({ url: '/api/sync' })).statusCode, 401);
    const cookie = cookieFrom(await login());

    const initial = await app.inject({
      url: '/api/sync',
      headers: { cookie },
    });
    assert.deepEqual(initial.json(), { revision: 0, data: null });

    const rejected = await app.inject({
      method: 'PUT',
      url: '/api/sync',
      headers: { cookie },
      payload: syncPayload(),
    });
    assert.equal(rejected.statusCode, 403);

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/sync',
      headers: { cookie, origin },
      payload: syncPayload(),
    });
    assert.deepEqual(saved.json(), { ok: true, revision: 1 });
  });

  void it('stores note images behind the owner session', async () => {
    const attachmentId = '19c60c85-27dc-4921-b45c-b81a96b41dc4';
    const url = `/api/note-attachments/${attachmentId}`;
    const image = Buffer.from([137, 80, 78, 71]);

    assert.equal((await app.inject({ url })).statusCode, 401);
    const cookie = cookieFrom(await login());
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url,
          headers: { cookie, 'content-type': 'image/png' },
          payload: image,
        })
      ).statusCode,
      403,
    );

    const created = await app.inject({
      method: 'PUT',
      url,
      headers: { cookie, origin, 'content-type': 'image/png' },
      payload: image,
    });
    assert.equal(created.statusCode, 201);

    const loaded = await app.inject({ url, headers: { cookie } });
    assert.equal(loaded.statusCode, 200);
    assert.equal(loaded.headers['content-type'], 'image/png');
    assert.deepEqual(loaded.rawPayload, image);

    const repeated = await app.inject({
      method: 'PUT',
      url,
      headers: { cookie, origin, 'content-type': 'image/png' },
      payload: image,
    });
    assert.equal(repeated.statusCode, 200);

    const collision = await app.inject({
      method: 'PUT',
      url,
      headers: { cookie, origin, 'content-type': 'image/png' },
      payload: Buffer.from([1]),
    });
    assert.equal(collision.statusCode, 409);
  });

  function login() {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { password },
    });
  }
});

function testConfig(): ServerConfig {
  return {
    passwordHash,
    sessionSecret: 'test-session-secret-that-is-at-least-32-characters',
    allowedOrigins: new Set([origin]),
    ownerId: 'owner',
    databasePath: ':memory:',
    staticDir: './dist/client',
    host: '127.0.0.1',
    port: 8788,
    bodyLimit: 2 * 1024 * 1024,
    sessionMaxAgeSeconds: 90 * 24 * 60 * 60,
    secureCookie: true,
  };
}

function cookieFrom(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const header = response.headers['set-cookie'];
  if (typeof header !== 'string') throw new Error('Session cookie is missing');
  return header.split(';', 1)[0];
}

function syncPayload() {
  return {
    requestId: '19c60c85-27dc-4921-b45c-b81a96b41dc4',
    baseRevision: 0,
    data: {
      version: 2,
      schedule: {},
      backlog: [],
      notes: [],
      history: [],
    },
  };
}
