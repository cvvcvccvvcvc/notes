import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from './password.js';
import { createSessionToken, readSessionToken } from './session.js';

void describe('password hashing', () => {
  void it('accepts only the original password', async () => {
    const encoded = await hashPassword('correct horse');
    assert.equal(await verifyPassword('correct horse', encoded), true);
    assert.equal(await verifyPassword('wrong horse', encoded), false);
  });
});

void describe('session tokens', () => {
  const secret = 'a-secure-test-secret-that-is-long-enough';
  const now = 1_700_000_000_000;

  void it('round-trips an unexpired signed owner session', () => {
    const token = createSessionToken('owner', secret, 60, now);
    assert.equal(readSessionToken(token, secret, now)?.sub, 'owner');
  });

  void it('rejects tampered and expired sessions', () => {
    const token = createSessionToken('owner', secret, 60, now);
    assert.equal(readSessionToken(`${token}x`, secret, now), null);
    assert.equal(readSessionToken(token, secret, now + 61_000), null);
  });
});
