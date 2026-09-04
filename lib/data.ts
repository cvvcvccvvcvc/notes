export type Interval = { start: number; end?: number };

export type TaskColor = 'blue' | 'yellow' | 'purple' | 'rose';

export type Task = {
  id: string;
  text: string;
  intervals: Interval[];
  color?: TaskColor;
  source?: { noteId: string; snapshot: string };
};

export type HistoryItem = {
  id: string;
  taskId: string;
  text: string;
  finishedAt: number;
  intervals: Interval[];
};

export type NoteColor = 'teal' | 'purple' | 'white' | 'red';
export type Note = {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned?: boolean;
};

export type AppData = {
  version: 1;
  appliedImports?: string[];
  schedule: Record<string, Task[]>;
  notes: Note[];
  history: HistoryItem[];
};

export function createDemoData(today: string): AppData {
  return {
    version: 1,
    schedule: {
      [today]: [
        { id: 'demo-article', text: 'Писать статью', intervals: [] },
        { id: 'demo-sql', text: 'SQL: видео и практика', intervals: [] },
        {
          id: 'demo-scroll',
          text: 'Исправить листание карточки\nПроверить Safari и Яндекс. Учесть, почему прошлый фикс не сработал.',
          intervals: [],
        },
        { id: 'demo-dance', text: 'Позвонить на танцы', intervals: [] },
      ],
    },
    history: [],
    notes: [
      {
        id: 'vocabulary',
        title: 'The Vocabulary App',
        color: 'teal',
        pinned: true,
        content:
          'Механики:\n— коллаборация с дизайнером\n— автопереводчик?\n\nпосты:\n— механика free review\n\nПридумать сообщение одногруппникам\n\nфиксы:\nИсправить листание карточки\nПроверить Safari и Яндекс. Учесть, почему прошлый фикс не сработал.',
      },
      {
        id: 'coursework',
        title: 'Курсовая работа',
        color: 'teal',
        content: 'Писать статью\n\nПосмотреть результаты',
      },
      {
        id: 'important',
        title: 'Дела / важное',
        color: 'purple',
        pinned: true,
        content:
          'Учёба\n— читать статью\n— лекция по MO\n\nРабота\n— SQL: видео и практика\n— пройти Git\n— курс по Docker\n\nПравила\n— весь написанный код смотреть и понимать\n\nЧто брать в зал\nбутылка, шорты, тапки, полотенце, пропуск',
      },
      {
        id: 'memo',
        title: 'Памятка',
        color: 'white',
        content:
          'Мне не нужно знать всё. Важнее понимать, проверять и уметь изменить созданное агентом.',
      },
    ],
  };
}
