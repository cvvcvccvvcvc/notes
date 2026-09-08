import path from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { z } from 'zod';
import {
  NOTE_ATTACHMENT_MAX_BYTES,
  noteAttachmentMimeTypeSchema,
} from '../shared/data-schema.js';
import { syncPutSchema } from '../shared/sync-schema.js';
import type { ServerConfig } from './config.js';
import { openDatabase, type NotesDatabase } from './database.js';
import { NoteAttachmentRepository } from './note-attachment-repository.js';
import { validatePasswordHash, verifyPassword } from './password.js';
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE_NAME,
} from './session.js';
import { SyncRepository } from './sync-repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId: string | null;
  }
}

const loginSchema = z
  .object({ password: z.string().min(1).max(1_024) })
  .strict();
const noteAttachmentParamsSchema = z.object({
  attachmentId: z.uuid(),
});

const LOGIN_CSS = `
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f5f5f1; color: #20231f; }
* { box-sizing: border-box; }
body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
main { width: min(100%, 380px); padding: 32px; border: 1px solid #dedfd8; border-radius: 24px; background: #fff; box-shadow: 0 18px 60px rgb(32 35 31 / 8%); }
h1 { margin: 0 0 8px; font-size: 28px; font-weight: 650; }
p { margin: 0 0 28px; color: #6d726b; }
label { display: block; margin-bottom: 8px; font-size: 14px; }
input, button { width: 100%; min-height: 48px; border-radius: 14px; font: inherit; }
input { padding: 0 14px; border: 1px solid #cfd2ca; background: #fff; }
button { margin-top: 12px; border: 0; background: #2d866f; color: #fff; font-weight: 650; cursor: pointer; }
.error { color: #a33b36; margin: 0 0 16px; }
`;

function loginPage(invalid = false) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f5f1"><title>Вход — Notes</title><link rel="stylesheet" href="/login.css"></head><body><main><h1>Notes</h1><p>Личное расписание и заметки</p>${invalid ? '<div class="error">Неверный пароль</div>' : ''}<form method="post" action="/login"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required><button type="submit">Войти</button></form></main></body></html>`;
}

type CreateAppOptions = {
  config: ServerConfig;
  database?: NotesDatabase;
  logger?: boolean;
};

export async function createApp({
  config,
  database: suppliedDatabase,
  logger = true,
}: CreateAppOptions): Promise<FastifyInstance> {
  validatePasswordHash(config.passwordHash);
  const app = Fastify({
    bodyLimit: config.bodyLimit,
    trustProxy: true,
    logger,
  });
  const database = suppliedDatabase ?? openDatabase(config.databasePath);
  const repository = new SyncRepository(database);
  const attachmentRepository = new NoteAttachmentRepository(database);
  app.decorateRequest('ownerId', null);

  if (!suppliedDatabase)
    app.addHook('onClose', async () => {
      database.close();
    });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      const values = new URLSearchParams(
        typeof body === 'string' ? body : body.toString('utf8'),
      );
      done(null, { password: values.get('password') ?? '' });
    },
  );
  app.addContentTypeParser(
    /^image\/(?:png|jpeg|webp|gif)$/i,
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/'))
      reply.header('Cache-Control', 'no-store');
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    // Some iOS/WebView form submissions omit Origin. Login is password-gated,
    // rate-limited, and does not modify user data, so only this form is exempt.
    if (request.method === 'POST' && request.url === '/login') return;
    const origin = request.headers.origin;
    if (!origin || !isAllowedOrigin(origin, config.allowedOrigins))
      return reply.code(403).send({
        error: {
          code: 'ORIGIN_REJECTED',
          message: 'Request origin is not allowed',
        },
      });
  });

  const requireSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = token
      ? readSessionToken(token, config.sessionSecret)
      : null;
    if (!session || session.sub !== config.ownerId)
      return reply.code(401).send({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    request.ownerId = session.sub;
  };

  const authenticate = async (password: string, reply: FastifyReply) => {
    if (!(await verifyPassword(password, config.passwordHash))) return false;
    const token = createSessionToken(
      config.ownerId,
      config.sessionSecret,
      config.sessionMaxAgeSeconds,
    );
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: 'strict',
      maxAge: config.sessionMaxAgeSeconds,
    });
    return true;
  };

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?', 1)[0];
    if (
      pathname === '/login' ||
      pathname === '/login.css' ||
      pathname === '/healthz' ||
      pathname === '/api/auth/login' ||
      pathname === '/api/auth/session' ||
      pathname.startsWith('/api/')
    )
      return;
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = token
      ? readSessionToken(token, config.sessionSecret)
      : null;
    if (!session || session.sub !== config.ownerId)
      return reply.redirect('/login');
    request.ownerId = session.sub;
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/login.css', async (_request, reply) =>
    reply.type('text/css; charset=utf-8').send(LOGIN_CSS),
  );
  app.get('/login', async (_request, reply) =>
    reply
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(loginPage()),
  );
  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success || !(await authenticate(parsed.data.password, reply)))
        return reply
          .code(401)
          .header('Cache-Control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(loginPage(true));
      return reply.redirect('/');
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'A password is required' },
        });
      if (!(await authenticate(parsed.data.password, reply)))
        return reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials',
          },
        });

      return { authenticated: true };
    },
  );

  app.get('/api/auth/session', async (request) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = token
      ? readSessionToken(token, config.sessionSecret)
      : null;
    return { authenticated: session?.sub === config.ownerId };
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: 'strict',
    });
    return { authenticated: false };
  });

  app.get('/api/sync', { preHandler: requireSession }, async (request) => {
    return repository.get(request.ownerId!);
  });

  app.put(
    '/api/sync',
    { preHandler: requireSession },
    async (request, reply) => {
      const parsed = syncPutSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Sync payload does not match the current schema',
          },
        });
      const result = repository.put(request.ownerId!, parsed.data);
      return reply.code(result.statusCode).send(result.body);
    },
  );

  app.get(
    '/api/note-attachments/:attachmentId',
    { preHandler: requireSession },
    async (request, reply) => {
      const parsed = noteAttachmentParamsSchema.safeParse(request.params);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Attachment id is invalid',
          },
        });
      const attachment = attachmentRepository.get(
        request.ownerId!,
        parsed.data.attachmentId,
      );
      if (!attachment)
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Attachment not found' },
        });
      return reply.type(attachment.mimeType).send(attachment.data);
    },
  );

  app.put(
    '/api/note-attachments/:attachmentId',
    { preHandler: requireSession, bodyLimit: NOTE_ATTACHMENT_MAX_BYTES },
    async (request, reply) => {
      const params = noteAttachmentParamsSchema.safeParse(request.params);
      const mimeType = noteAttachmentMimeTypeSchema.safeParse(
        request.headers['content-type']?.split(';', 1)[0].toLowerCase(),
      );
      if (
        !params.success ||
        !mimeType.success ||
        !Buffer.isBuffer(request.body)
      )
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Attachment must be a supported image',
          },
        });
      if (request.body.byteLength === 0)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Attachment must not be empty',
          },
        });
      const result = attachmentRepository.put(
        request.ownerId!,
        params.data.attachmentId,
        mimeType.data,
        request.body,
      );
      if (result === 'conflict')
        return reply.code(409).send({
          error: {
            code: 'ATTACHMENT_CONFLICT',
            message: 'Attachment id is already used',
          },
        });
      return reply.code(result === 'created' ? 201 : 200).send({ ok: true });
    },
  );

  await app.register(fastifyStatic, {
    root: path.resolve(config.staticDir),
    prefix: '/',
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/'))
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'API route not found' },
      });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return reply.code(404).send('Not found');
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = httpStatusCode(error);
    if (statusCode === 413)
      return reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body is too large',
        },
      });
    return reply.code(statusCode).send({
      error: {
        code: 'SERVER_ERROR',
        message:
          statusCode < 500 && error instanceof Error
            ? error.message
            : 'Internal server error',
      },
    });
  });

  return app;
}

function isAllowedOrigin(origin: string, allowedOrigins: ReadonlySet<string>) {
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function httpStatusCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error))
    return 500;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode <= 599
    ? statusCode
    : 500;
}
