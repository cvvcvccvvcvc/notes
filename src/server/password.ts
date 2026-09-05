import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
const KEY_LENGTH = 32;
const DEFAULT_N = 16_384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;

type ScryptParameters = {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  expected: Buffer;
};

function assertScryptParameters(n: number, r: number, p: number) {
  if (n < 2 || n > 1_048_576 || (n & (n - 1)) !== 0)
    throw new Error('Invalid scrypt N parameter');
  if (r < 1 || r > 32 || p < 1 || p > 16)
    throw new Error('Invalid scrypt work parameters');
}

function parsePasswordHash(encoded: string): ScryptParameters {
  const [algorithm, nText, rText, pText, saltText, hashText, extra] =
    encoded.split('$');
  if (algorithm !== 'scrypt' || extra !== undefined)
    throw new Error('Invalid password hash format');
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  assertScryptParameters(n, r, p);
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  if (salt.length < 16 || expected.length !== KEY_LENGTH)
    throw new Error('Invalid password hash payload');
  return { n, r, p, salt, expected };
}

async function derive(
  password: string,
  parameters: Pick<ScryptParameters, 'n' | 'r' | 'p' | 'salt'>,
) {
  const requiredMemory = 128 * parameters.n * parameters.r;
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      parameters.salt,
      KEY_LENGTH,
      {
        N: parameters.n,
        r: parameters.r,
        p: parameters.p,
        maxmem: Math.max(32 * 1024 * 1024, requiredMemory * 2),
      },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derive(password, {
    n: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    salt,
  });
  return [
    'scrypt',
    DEFAULT_N,
    DEFAULT_R,
    DEFAULT_P,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string) {
  const parameters = parsePasswordHash(encoded);
  const actual = await derive(password, parameters);
  return timingSafeEqual(actual, parameters.expected);
}

export function validatePasswordHash(encoded: string) {
  parsePasswordHash(encoded);
}
