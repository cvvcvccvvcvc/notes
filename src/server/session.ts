import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'notes_session';

type SessionPayload = {
  v: 1;
  sub: string;
  iat: number;
  exp: number;
};

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createSessionToken(
  ownerId: string,
  secret: string,
  maxAgeSeconds: number,
  nowMs = Date.now(),
) {
  const now = Math.floor(nowMs / 1000);
  const payload: SessionPayload = {
    v: 1,
    sub: ownerId,
    iat: now,
    exp: now + maxAgeSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`;
}

export function readSessionToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
) {
  const [encoded, signatureText, extra] = token.split('.');
  if (!encoded || !signatureText || extra !== undefined) return null;

  const expected = signature(encoded, secret);
  const actual = Buffer.from(signatureText, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;

  try {
    const value: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    if (!isSessionPayload(value)) return null;
    const now = Math.floor(nowMs / 1000);
    if (value.exp <= now || value.iat > now + 300) return null;
    return value;
  } catch {
    return null;
  }
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SessionPayload>;
  return (
    payload.v === 1 &&
    typeof payload.sub === 'string' &&
    payload.sub.length > 0 &&
    typeof payload.iat === 'number' &&
    Number.isInteger(payload.iat) &&
    typeof payload.exp === 'number' &&
    Number.isInteger(payload.exp)
  );
}
