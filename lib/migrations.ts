import type { AppData, Note, Task, TaskGroup } from './data';
import { UNSORTED_GROUP_ID } from './backlog';
import { createInitialRules } from './rule-operations';

const seedGroups: TaskGroup[] = [
  { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
  {
    id: 'backlog-study',
    title: 'Учёба',
    tasks: [
      backlogTask('backlog-study-article', 'читать статью', 'backlog-study'),
      backlogTask('backlog-study-mo', 'лекция по MO', 'backlog-study'),
    ],
  },
  {
    id: 'backlog-job',
    title: 'Поиск работы',
    tasks: [
      backlogTask(
        'backlog-job-sql',
        'sql (видосы, практика, создание опыта)',
        'backlog-job',
      ),
      backlogTask(
        'backlog-job-git',
        'пройти гит быстренько опять курс',
        'backlog-job',
      ),
      backlogTask('backlog-job-docker', 'докер курс', 'backlog-job'),
    ],
  },
  {
    id: 'backlog-ai',
    title: 'AI-агенты',
    tasks: [
      backlogTask('backlog-ai-clawbot', 'clawbot на локалке', 'backlog-ai'),
      backlogTask('backlog-ai-tests', 'pi и opencode тесты', 'backlog-ai'),
    ],
  },
  {
    id: 'backlog-later',
    title: 'Не сейчас',
    tasks: [
      backlogTask(
        'backlog-later-house',
        'домик снять и сдавать',
        'backlog-later',
      ),
      backlogTask('backlog-later-delta', 'реклама дельты', 'backlog-later'),
    ],
  },
];

function backlogTask(id: string, text: string, backlogGroupId: string): Task {
  return { id, text, intervals: [], backlogGroupId };
}

function migratedNotes(notes: Note[]) {
  const important = notes.find((note) => note.id === 'important');
  const withoutImportant = notes.filter((note) => note.id !== 'important');
  const additions: Note[] = [];
  const originalDemoContent =
    'Учёба\n— читать статью\n— лекция по MO\n\nРабота\n— SQL: видео и практика\n— пройти Git\n— курс по Docker\n\nПравила\n— весь написанный код смотреть и понимать\n\nЧто брать в зал\nбутылка, шорты, тапки, полотенце, пропуск';
  if (important && important.content.trim() !== originalDemoContent)
    additions.push({
      ...important,
      id: `${important.id}-migration-copy`,
      title: 'Разобрать из «Дела / важное»',
      pinned: false,
    });
  if (!withoutImportant.some((note) => note.title === 'Что брать в зал'))
    additions.push({
      id: 'gym-list',
      title: 'Что брать в зал',
      color: 'purple',
      content:
        'бутыль, шампунь, гель\n\nшорты + верх + носки + трусы\nтапки + кроссы + пакет\nполотенце\nпропуск',
    });
  if (!withoutImportant.some((note) => note.title === 'Правила работы'))
    additions.push({
      id: 'work-rules',
      title: 'Правила работы',
      color: 'purple',
      content:
        'макс 2 игры в Deadlock в день / 1.5 часа\n\nвесь написанный код смотреть и понимать',
    });
  return [...additions, ...withoutImportant];
}

/** Upgrade persisted data without applying date-dependent product behavior. */
export function migrateAppData(data: AppData): AppData {
  const needsBacklog = !data.backlog;
  const needsMonthPlanning = !data.monthPlanning;
  const needsRules = !data.rules;
  const sourceGroups = data.backlog ?? seedGroups;
  const missingUnsorted = !sourceGroups.some(
    (group) => group.id === UNSORTED_GROUP_ID,
  );
  const staleTaskLocations = sourceGroups.some((group) =>
    group.tasks.some((task) => task.backlogGroupId !== group.id),
  );
  let groups: TaskGroup[] = sourceGroups;
  if (needsBacklog || missingUnsorted || staleTaskLocations)
    groups = sourceGroups.map((group) => ({
      ...group,
      tasks: group.tasks.map((task) => ({
        ...task,
        backlogGroupId: group.id,
      })),
    }));
  if (missingUnsorted)
    groups = [
      { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
      ...groups,
    ];

  if (
    !needsBacklog &&
    !needsMonthPlanning &&
    !needsRules &&
    !missingUnsorted &&
    !staleTaskLocations &&
    data.version >= 4
  )
    return data;
  return {
    ...data,
    version: Math.max(data.version, 4),
    backlog: groups,
    monthPlanning:
      data.monthPlanning ??
      ({
        rules: [],
        createdMonths: [
          ...new Set(
            Object.keys(data.schedule)
              .map((day) => day.slice(0, 7))
              .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)),
          ),
        ].sort(),
      } satisfies AppData['monthPlanning']),
    rules: data.rules ?? createInitialRules(),
    notes: removeLegacyRulesNote(
      needsBacklog ? migratedNotes(data.notes) : data.notes,
      needsRules,
    ),
  };
}

function removeLegacyRulesNote(notes: Note[], rulesWereAdded: boolean) {
  if (!rulesWereAdded) return notes;
  const legacyContent =
    'макс 2 игры в Deadlock в день / 1.5 часа\n\nвесь написанный код смотреть и понимать';
  return notes.filter(
    (note) =>
      !(
        note.id === 'work-rules' &&
        note.title === 'Правила работы' &&
        note.content.trim() === legacyContent
      ),
  );
}
