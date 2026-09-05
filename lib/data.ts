export type Interval = { start: number; end?: number };

export type TaskColor = 'blue' | 'yellow' | 'purple' | 'rose';

export type Task = {
  id: string;
  text: string;
  intervals: Interval[];
  color?: TaskColor;
  backlogGroupId?: string;
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

export type TaskGroup = {
  id: string;
  title: string;
  color?: TaskColor;
  tasks: Task[];
};

export type MonthTemplateSchedule =
  | { kind: 'weekly'; weekday: number }
  | { kind: 'fortnightly'; anchorDay: string }
  | { kind: 'annual'; month: number; day: number };

export type MonthTemplateRule = {
  id: string;
  text: string;
  color?: TaskColor;
  schedule: MonthTemplateSchedule;
};

export type MonthPlanning = {
  rules: MonthTemplateRule[];
  /** Materialized YYYY-MM months. Monotonic so two devices can safely union it. */
  createdMonths: string[];
};

export type AppData = {
  version: number;
  /** Historical ids of one-time imports applied by older releases. */
  appliedImports?: string[];
  schedule: Record<string, Task[]>;
  backlog?: TaskGroup[];
  monthPlanning?: MonthPlanning;
  notes: Note[];
  history: HistoryItem[];
};
