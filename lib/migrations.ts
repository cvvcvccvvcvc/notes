import type { AppData, Note, Task, TaskGroup } from './data';

export const UNSORTED_GROUP_ID = 'backlog-unsorted';

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

function endOfDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function pauseAtDayEnd(task: Task, day: string): Task {
  const cutoff = endOfDay(day);
  return {
    ...task,
    intervals: task.intervals.map((interval, index) =>
      index === task.intervals.length - 1 && interval.end == null
        ? { ...interval, end: Math.max(interval.start, cutoff) }
        : interval,
    ),
  };
}

function appendUnique(group: TaskGroup, tasks: Task[]) {
  const existing = new Set(group.tasks.map((task) => task.id));
  return {
    ...group,
    tasks: [...group.tasks, ...tasks.filter((task) => !existing.has(task.id))],
  };
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

/** Upgrade local data and move every unfinished past-day task into the backlog. */
export function prepareAppData(data: AppData, today: string): AppData {
  const needsBacklog = !data.backlog;
  let groups: TaskGroup[] = (data.backlog ?? seedGroups).map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => ({
      ...task,
      backlogGroupId: group.id,
    })),
  }));
  if (!groups.some((group) => group.id === UNSORTED_GROUP_ID))
    groups = [
      { id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] },
      ...groups,
    ];

  const schedule = { ...data.schedule };
  let rolledOver = false;
  for (const day of Object.keys(schedule).sort()) {
    if (day >= today || !schedule[day]?.length) continue;
    rolledOver = true;
    for (const sourceTask of schedule[day]) {
      const task = pauseAtDayEnd(sourceTask, day);
      const groupId = groups.some((group) => group.id === task.backlogGroupId)
        ? task.backlogGroupId!
        : UNSORTED_GROUP_ID;
      groups = groups.map((group) =>
        group.id === groupId
          ? appendUnique(group, [{ ...task, backlogGroupId: groupId }])
          : group,
      );
    }
    schedule[day] = [];
  }

  if (!needsBacklog && !rolledOver && data.version >= 2) return data;
  return {
    ...data,
    version: 2,
    schedule,
    backlog: groups,
    notes: needsBacklog ? migratedNotes(data.notes) : data.notes,
  };
}
