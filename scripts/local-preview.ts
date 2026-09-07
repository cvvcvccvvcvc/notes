import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  appDataSchema,
  type AppData,
  type Task,
} from '../src/shared/data-schema.js';
import { openDatabase } from '../src/server/database.js';
import { hashPassword } from '../src/server/password.js';
import { SyncRepository } from '../src/server/sync-repository.js';

const previewDirectory = path.resolve('.local-preview');
const databasePath = path.join(previewDirectory, 'notes.sqlite3');
const seedDatePath = path.join(previewDirectory, 'seed-date');
const ownerId = 'local-preview';
const password = 'preview';
const unsortedGroupId = 'backlog-unsorted';

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const previewOrigin = `http://${dateKey()}.preview.localhost:8788`;

function addDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return dateKey(shifted);
}

function timestamp(day: string, hours: number, minutes: number) {
  return new Date(
    `${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
  ).getTime();
}

function task(id: string, text: string, options: Partial<Task> = {}): Task {
  return { id, text, intervals: [], ...options };
}

function createPreviewData(now = new Date()): AppData {
  const today = dateKey(now);
  const tomorrow = addDays(now, 1);
  const inTwoDays = addDays(now, 2);
  const nextWeek = addDays(now, 7);
  const yesterday = addDays(now, -1);

  return appDataSchema.parse({
    version: 4,
    schedule: {
      [today]: [
        task(
          'preview-today-review',
          'Разобрать комментарии к макету\nПроверить время и состояния наведения',
          { color: 'blue' },
        ),
        task(
          'preview-today-sql',
          'SQL: видео и практика\nПродолжить с оконных функций',
          {
            plannedStart: '11:30',
            intervals: [
              {
                start: timestamp(today, 10, 45),
                end: timestamp(today, 11, 12),
              },
            ],
          },
        ),
        task('preview-today-call', 'Позвонить в танцевальную студию', {
          plannedStart: '15:00',
          color: 'yellow',
        }),
        task('preview-today-shopping', 'Прогулка и продукты'),
      ],
      [tomorrow]: [
        task(
          'preview-tomorrow-questions',
          'Подготовить вопросы к созвону\nСобрать спорные места в один список',
          { plannedStart: '10:00', color: 'purple' },
        ),
        task('preview-tomorrow-training', 'Тренировка', {
          plannedStart: '19:30',
        }),
      ],
      [inTwoDays]: [
        task('preview-later-internet', 'Оплатить интернет'),
        task('preview-later-order', 'Забрать заказ', {
          plannedStart: '18:15',
          color: 'rose',
        }),
      ],
      [nextWeek]: [
        task('preview-next-week-plan', 'Спланировать следующую неделю'),
      ],
    },
    backlog: [
      {
        id: unsortedGroupId,
        title: 'Не разобрано',
        tasks: [
          task('preview-backlog-book', 'Выбрать книгу на сентябрь', {
            backlogGroupId: unsortedGroupId,
          }),
          task('preview-backlog-documents', 'Разобрать папку с документами', {
            backlogGroupId: unsortedGroupId,
          }),
        ],
      },
      {
        id: 'preview-backlog-work',
        title: 'Работа',
        color: 'blue',
        tasks: [
          task(
            'preview-backlog-release',
            'Составить чек-лист релиза\nДобавить только воспроизводимые проверки',
            { backlogGroupId: 'preview-backlog-work' },
          ),
          task('preview-backlog-metrics', 'Проверить недельные метрики', {
            backlogGroupId: 'preview-backlog-work',
          }),
        ],
      },
      {
        id: 'preview-backlog-personal',
        title: 'Личное',
        color: 'yellow',
        tasks: [
          task('preview-backlog-bike', 'Записать велосипед на обслуживание', {
            backlogGroupId: 'preview-backlog-personal',
          }),
        ],
      },
    ],
    monthPlanning: {
      rules: [
        {
          id: 'preview-template-review',
          text: 'Недельный обзор',
          color: 'blue',
          schedule: { kind: 'weekly', weekday: 0 },
        },
        {
          id: 'preview-template-parents',
          text: 'Позвонить родителям',
          schedule: { kind: 'weekly', weekday: 6 },
        },
      ],
      createdMonths: [],
    },
    dayWindows: { [today]: { start: '09:30', end: '20:00' } },
    rules: [
      { id: 'rule-priority', text: 'Приоритет — работа и учёба.' },
      {
        id: 'rule-deadlock',
        text: 'Deadlock — максимум 2 игры или 1,5 часа в день.',
      },
      {
        id: 'rule-code-review',
        text: 'Весь написанный агентом код просматривать и понимать.',
      },
    ],
    notes: [
      {
        id: 'preview-note-week',
        title: 'Идеи на неделю',
        content:
          '• проверить новый сценарий расписания\n• оставить один вечер без планов\n• закончить модуль по SQL',
        color: 'teal',
        pinned: true,
      },
      {
        id: 'preview-note-shopping',
        title: 'Покупки',
        content: 'Кофе\nФрукты\nБатарейки AAA',
        color: 'white',
      },
      {
        id: 'preview-note-reading',
        title: 'Что почитать',
        content: 'Designing Data-Intensive Applications\nRefactoring UI',
        color: 'purple',
      },
      {
        id: 'preview-note-thought',
        title: 'Мысль',
        content:
          'Время у дела — ориентир начала, а порядок списка остаётся главным.',
        color: 'red',
      },
    ],
    history: [
      {
        id: 'preview-history-review',
        taskId: 'preview-completed-review',
        text: 'Проверить план на неделю',
        finishedAt: timestamp(yesterday, 18, 5),
        intervals: [
          {
            start: timestamp(yesterday, 17, 35),
            end: timestamp(yesterday, 18, 5),
          },
        ],
      },
      {
        id: 'preview-history-backup',
        taskId: 'preview-completed-backup',
        text: 'Разобрать входящие заметки',
        finishedAt: timestamp(yesterday, 12, 20),
        intervals: [
          {
            start: timestamp(yesterday, 11, 55),
            end: timestamp(yesterday, 12, 20),
          },
        ],
      },
    ],
  });
}

function ensurePreviewData() {
  const database = openDatabase(databasePath);
  try {
    const repository = new SyncRepository(database);
    const current = repository.get(ownerId);
    const today = dateKey();
    if (
      current.revision > 0 &&
      fs.existsSync(seedDatePath) &&
      fs.readFileSync(seedDatePath, 'utf8').trim() === today
    )
      return false;
    const result = repository.put(ownerId, {
      requestId: randomUUID(),
      baseRevision: current.revision,
      data: createPreviewData(),
    });
    if (result.statusCode !== 200)
      throw new Error('Could not initialize local preview data');
    fs.writeFileSync(seedDatePath, `${today}\n`, { mode: 0o600 });
    return true;
  } finally {
    database.close();
  }
}

const seeded = ensurePreviewData();
const passwordHash = await hashPassword(password);
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'src/server/index.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NOTES_PASSWORD_HASH: passwordHash,
      NOTES_SESSION_SECRET: 'local-preview-only-session-secret-2026',
      NOTES_ALLOWED_ORIGINS: previewOrigin,
      NOTES_OWNER_ID: ownerId,
      NOTES_DATABASE_PATH: databasePath,
      NOTES_STATIC_DIR: path.resolve('dist/client'),
      NOTES_HOST: '127.0.0.1',
      NOTES_PORT: '8788',
      NOTES_SECURE_COOKIE: 'false',
    },
  },
);

console.log(
  `${seeded ? 'Created' : 'Reused'} local preview data at ${databasePath}`,
);
console.log(`Open ${previewOrigin} and sign in with “${password}”.`);

const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal);
process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));
child.once('exit', (code, signal) => {
  process.exitCode = signal ? 0 : (code ?? 1);
});
