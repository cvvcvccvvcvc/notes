'use client';

import {
  Check,
  ArrowUpToLine,
  CirclePause,
  CirclePlay,
  Clock3,
  FileText,
  GripVertical,
  History,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  createDemoData,
  type AppData,
  type Note,
  type Task,
  type TaskColor,
} from '@/lib/data';
import { loadData, saveData } from '@/lib/storage';
import {
  SortableDropZone,
  SortableItems,
  SortableList,
  SortableRoot,
} from '@/lib/sorting';
import { importPreviewSchedule } from '@/lib/preview-schedule';
import { paragraphRange, type TextRange } from '@/lib/paragraph';
import { NoteEditor } from '@/lib/note-editor';

type View = 'today' | 'notes' | 'history';
type SaveState = 'loading' | 'saving' | 'saved' | 'error';
type UndoState = {
  message: string;
  restore: (current: AppData) => AppData;
} | null;

const ruDate = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const ruShortDate = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});
const ruMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
const ruTime = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftedDay(day: string, distance: -1 | 1) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + distance);
  return dateKey(date);
}

function taskState(task: Task) {
  if (!task.intervals.length) return 'idle' as const;
  return task.intervals.at(-1)?.end == null
    ? ('running' as const)
    : ('paused' as const);
}

function taskDuration(task: Task, now: number) {
  return task.intervals.reduce(
    (sum, interval) => sum + ((interval.end ?? now) - interval.start),
    0,
  );
}

function minutesLabel(milliseconds: number) {
  return `${Math.max(0, Math.floor(milliseconds / 60_000))} мин`;
}

function resizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = '0px';
  element.style.height = `${Math.max(44, element.scrollHeight)}px`;
}

function focusTask(day: string, id?: string, selection?: TextRange) {
  requestAnimationFrame(() => {
    const element = document.getElementById(id ? `task-${id}` : `add-${day}`);
    element?.focus({ preventScroll: true });
    if (selection && element instanceof HTMLTextAreaElement)
      element.setSelectionRange(selection.start, selection.end);
    element?.scrollIntoView({ block: 'nearest' });
  });
}

function selectedTaskShortcut(
  event: React.KeyboardEvent<HTMLElement>,
  actions: {
    edit: () => void;
    navigate: (direction: -1 | 1) => void;
    activate: () => void;
    discard: () => void;
    move: (direction: -1 | 1) => void;
    moveDay: (direction: -1 | 1) => void;
    toggleTimer?: () => void;
  },
) {
  if (event.nativeEvent.isComposing || event.shiftKey) return false;
  if (!event.metaKey && event.altKey && event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) actions.toggleTimer?.();
    return true;
  }
  if (event.altKey) return false;
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  if (!event.metaKey && !vertical && event.key !== 'Enter') return false;
  if (
    event.metaKey &&
    !vertical &&
    !horizontal &&
    !['Enter', 'Backspace', 'Delete'].includes(event.key)
  )
    return false;
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return true;
  const direction = event.key === 'ArrowUp' ? -1 : 1;
  if (!event.metaKey && vertical) actions.navigate(direction);
  else if (!event.metaKey && event.key === 'Enter') actions.edit();
  else if (event.key === 'Enter') actions.activate();
  else if (vertical) actions.move(direction);
  else if (horizontal) actions.moveDay(event.key === 'ArrowLeft' ? -1 : 1);
  else actions.discard();
  return true;
}

export default function Home() {
  const [view, setView] = useState<View>('today');
  const [data, setData] = useState<AppData | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [now, setNow] = useState(() => Date.now());
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [undo, setUndo] = useState<UndoState>(null);
  const dataRef = useRef<AppData | null>(null);
  const todayKey = dateKey(new Date(now));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

  useEffect(() => {
    let live = true;
    loadData()
      .then((stored) => {
        if (!live) return;
        const initial = importPreviewSchedule(
          stored ?? createDemoData(todayKey),
          todayKey,
        );
        dataRef.current = initial;
        setData(initial);
        setSaveState(initial === stored ? 'saved' : 'saving');
        if (initial !== stored) {
          saveData(initial)
            .then(() => live && setSaveState('saved'))
            .catch(() => live && setSaveState('error'));
        }
      })
      .catch(() => live && setSaveState('error'));
    return () => {
      live = false;
    };
  }, [todayKey]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    )
      return;
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (
          !navigator.serviceWorker.controller &&
          !sessionStorage.getItem('notes-sw-reload')
        ) {
          sessionStorage.setItem('notes-sw-reload', '1');
          window.location.reload();
        }
      })
      .catch(() => undefined);
  }, []);

  function commit(change: (current: AppData) => AppData) {
    const current = dataRef.current;
    if (!current) return;
    const next = change(current);
    dataRef.current = next;
    setData(next);
    setSaveState('saving');
    saveData(next)
      .then(() => {
        if (dataRef.current === next) setSaveState('saved');
      })
      .catch(() => setSaveState('error'));
  }

  function commitWithUndo(
    message: string,
    change: (current: AppData) => AppData,
    restore: (current: AppData) => AppData,
  ) {
    if (!dataRef.current) return;
    setUndo({ message, restore });
    commit(change);
  }

  function restoreUndo() {
    if (!undo) return;
    setUndo(null);
    commit(undo.restore);
  }

  useEffect(() => {
    if (!undo) return;
    const timeout = window.setTimeout(() => setUndo(null), 15_000);
    return () => window.clearTimeout(timeout);
  }, [undo]);

  function restoreTask(
    current: AppData,
    day: string,
    task: Task,
    index: number,
  ) {
    const tasks = [...(current.schedule[day] ?? [])];
    if (!tasks.some((item) => item.id === task.id))
      tasks.splice(Math.min(index, tasks.length), 0, task);
    return { ...current, schedule: { ...current.schedule, [day]: tasks } };
  }

  function updateTasks(day: string, change: (tasks: Task[]) => Task[]) {
    commit((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [day]: change(current.schedule[day] ?? []),
      },
    }));
  }

  function addTask(day: string) {
    const id = uid();
    updateTasks(day, (tasks) => [...tasks, { id, text: '', intervals: [] }]);
    window.setTimeout(() => document.getElementById(`task-${id}`)?.focus(), 0);
    return id;
  }

  function updateTask(day: string, id: string, change: (task: Task) => Task) {
    updateTasks(day, (tasks) =>
      tasks.map((task) => (task.id === id ? change(task) : task)),
    );
  }

  function runTimer(day: string, id: string) {
    if (day !== todayKey) return;
    const stamp = Date.now();
    updateTask(day, id, (task) => {
      if (taskState(task) === 'running') {
        return {
          ...task,
          intervals: task.intervals.map((interval, index) =>
            index === task.intervals.length - 1
              ? { ...interval, end: stamp }
              : interval,
          ),
        };
      }
      return { ...task, intervals: [...task.intervals, { start: stamp }] };
    });
  }

  function finishTask(day: string, id: string) {
    if (day !== todayKey) return;
    const task = dataRef.current?.schedule[day]?.find(
      (candidate) => candidate.id === id,
    );
    if (!task) return;
    const index = dataRef.current!.schedule[day].findIndex(
      (item) => item.id === id,
    );
    const historyId = uid();
    const stamp = Date.now();
    const intervals = task.intervals.map((interval, index) =>
      index === task.intervals.length - 1 && interval.end == null
        ? { ...interval, end: stamp }
        : interval,
    );
    commitWithUndo(
      'Дело завершено',
      (current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          [day]: (current.schedule[day] ?? []).filter(
            (candidate) => candidate.id !== id,
          ),
        },
        history: [
          {
            id: historyId,
            taskId: task.id,
            text: task.text,
            finishedAt: stamp,
            intervals,
          },
          ...current.history,
        ],
      }),
      (current) => ({
        ...restoreTask(current, day, task, index),
        history: current.history.filter((item) => item.id !== historyId),
      }),
    );
  }

  function discardTask(day: string, id: string) {
    const tasks = dataRef.current?.schedule[day] ?? [];
    const index = tasks.findIndex((item) => item.id === id);
    const task = tasks[index];
    if (!task) return;
    commitWithUndo(
      'Дело убрано без истории',
      (current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          [day]: (current.schedule[day] ?? []).filter((task) => task.id !== id),
        },
      }),
      (current) => restoreTask(current, day, task, index),
    );
  }

  function moveTask(day: string, id: string, direction: -1 | 1) {
    const element = document.getElementById(`task-${id}`);
    const selection =
      element instanceof HTMLTextAreaElement
        ? { start: element.selectionStart, end: element.selectionEnd }
        : undefined;
    updateTasks(day, (tasks) => {
      const from = tasks.findIndex((task) => task.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= tasks.length) return tasks;
      const next = [...tasks];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    focusTask(day, id, selection);
  }

  function moveTaskToDay(
    sourceDay: string,
    id: string,
    targetDay: string,
    targetId?: string,
  ) {
    if (targetDay < todayKey) return;
    commit((current) => {
      const source = current.schedule[sourceDay] ?? [];
      const index = source.findIndex((task) => task.id === id);
      if (index < 0) return current;
      const sourceTask = source[index];
      const stamp = Date.now();
      const task =
        sourceDay === todayKey && targetDay > todayKey
          ? {
              ...sourceTask,
              intervals: sourceTask.intervals.map((interval, position) =>
                position === sourceTask.intervals.length - 1 &&
                interval.end == null
                  ? { ...interval, end: stamp }
                  : interval,
              ),
            }
          : sourceTask;
      const withoutTask = source.filter((candidate) => candidate.id !== id);

      if (sourceDay === targetDay) {
        const targetIndex = source.findIndex(
          (candidate) => candidate.id === targetId,
        );
        if (targetIndex < 0) return current;
        const tasks = [...withoutTask];
        tasks.splice(Math.min(targetIndex, tasks.length), 0, task);
        return {
          ...current,
          schedule: { ...current.schedule, [sourceDay]: tasks },
        };
      }

      const target = [...(current.schedule[targetDay] ?? [])];
      const targetIndex = target.findIndex(
        (candidate) => candidate.id === targetId,
      );
      target.splice(targetIndex < 0 ? target.length : targetIndex, 0, task);
      return {
        ...current,
        schedule: {
          ...current.schedule,
          [sourceDay]: withoutTask,
          [targetDay]: target,
        },
      };
    });
  }

  function setTaskColor(day: string, id: string, color?: TaskColor) {
    updateTask(day, id, (task) => ({ ...task, color }));
  }

  function takeFutureTask(day: string, id: string) {
    if (day <= todayKey) return;
    const tasks = dataRef.current?.schedule[day] ?? [];
    const index = tasks.findIndex((task) => task.id === id);
    const task = tasks[index];
    if (!task) return;
    commitWithUndo(
      'Перенесено в Сегодня',
      (current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          [day]: (current.schedule[day] ?? []).filter((item) => item.id !== id),
          [todayKey]: [...(current.schedule[todayKey] ?? []), task],
        },
      }),
      (current) => {
        const liveTask = current.schedule[todayKey]?.find(
          (item) => item.id === id,
        );
        if (!liveTask) return current;
        return restoreTask(
          {
            ...current,
            schedule: {
              ...current.schedule,
              [todayKey]: current.schedule[todayKey].filter(
                (item) => item.id !== id,
              ),
            },
          },
          day,
          liveTask,
          index,
        );
      },
    );
    focusTask(day, tasks[index + 1]?.id ?? tasks[index - 1]?.id);
  }

  function dropTask(day: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    updateTasks(day, (tasks) => {
      const from = tasks.findIndex((task) => task.id === sourceId);
      const to = tasks.findIndex((task) => task.id === targetId);
      if (from < 0 || to < 0) return tasks;
      const next = [...tasks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addTaskAfter(day: string, id: string) {
    const newId = uid();
    updateTasks(day, (tasks) => {
      const index = tasks.findIndex((task) => task.id === id);
      const next = [...tasks];
      next.splice(index + 1, 0, { id: newId, text: '', intervals: [] });
      return next;
    });
    window.setTimeout(
      () => document.getElementById(`task-${newId}`)?.focus(),
      0,
    );
  }

  function updateNote(id: string, change: (note: Note) => Note) {
    commit((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === id ? change(note) : note,
      ),
    }));
  }

  function createNote() {
    const id = uid();
    commit((current) => ({
      ...current,
      notes: [{ id, title: '', content: '', color: 'white' }, ...current.notes],
    }));
    setSelection({ start: 0, end: 0 });
    setOpenNoteId(id);
  }

  function moveNote(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    commit((current) => {
      const from = current.notes.findIndex((note) => note.id === sourceId);
      const to = current.notes.findIndex((note) => note.id === targetId);
      if (from < 0 || to < 0) return current;
      const notes = [...current.notes];
      const [moved] = notes.splice(from, 1);
      notes.splice(to, 0, moved);
      return { ...current, notes };
    });
  }

  function takeSelection(note: Note, cursor = selection) {
    const range = paragraphRange(note.content, cursor);
    const text = note.content.slice(range.start, range.end).trim();
    if (!text) return;
    const task: Task = {
      id: uid(),
      text,
      intervals: [],
      source: { noteId: note.id, snapshot: text },
    };
    commitWithUndo(
      'Добавлено в Сегодня',
      (current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          [todayKey]: [...(current.schedule[todayKey] ?? []), task],
        },
      }),
      (current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          [todayKey]: (current.schedule[todayKey] ?? []).filter(
            (item) => item.id !== task.id,
          ),
        },
      }),
    );
  }

  if (!data)
    return <main className="loading-screen">Открываю локальные записи…</main>;

  const openNote = data.notes.find((note) => note.id === openNoteId) ?? null;
  const noteRange = paragraphRange(openNote?.content ?? '', selection);
  const selectedText =
    openNote?.content.slice(noteRange.start, noteRange.end).trim() ?? '';

  const navigation = (
    <>
      <NavButton
        active={view === 'today'}
        icon={<NotebookPen />}
        onClick={() => setView('today')}
      >
        Расписание
      </NavButton>
      <NavButton
        active={view === 'notes'}
        icon={<FileText />}
        onClick={() => setView('notes')}
      >
        Заметки
      </NavButton>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('today')}>
          notes
        </button>
        <nav aria-label="Основная навигация">{navigation}</nav>
        <div className="sidebar-spacer" />
        <button
          className={`utility-button ${view === 'history' ? 'active' : ''}`}
          onClick={() => setView('history')}
        >
          <History />
          <span>История</span>
        </button>
        <div className="storage-status">
          <span
            className={`status-dot ${saveState === 'error' ? 'error' : ''}`}
          />
          <span>
            {saveState === 'loading' && 'Открываю…'}
            {saveState === 'saving' && 'Сохраняю…'}
            {saveState === 'saved' && 'Сохранено'}
            {saveState === 'error' && 'Ошибка сохранения'}
          </span>
        </div>
      </aside>

      <header className="mobile-header">
        <button className="brand" onClick={() => setView('today')}>
          notes
        </button>
        <div className="mobile-tools">
          <span
            className={`mobile-save ${saveState === 'error' ? 'error' : ''}`}
          >
            {saveState === 'saving'
              ? 'Сохраняю…'
              : saveState === 'error'
                ? 'Ошибка'
                : 'Сохранено'}
          </span>
          <button
            className={view === 'history' ? 'active' : ''}
            onClick={() => setView('history')}
            aria-label="История"
          >
            <History />
          </button>
        </div>
      </header>

      <main className="main-content">
        {view === 'today' && (
          <ScheduleView
            data={data}
            now={now}
            todayKey={todayKey}
            addTask={addTask}
            updateTask={updateTask}
            runTimer={runTimer}
            finishTask={finishTask}
            discardTask={discardTask}
            moveTask={moveTask}
            dropTask={dropTask}
            moveTaskToDay={moveTaskToDay}
            setTaskColor={setTaskColor}
            addTaskAfter={addTaskAfter}
            takeFutureTask={takeFutureTask}
          />
        )}
        {view === 'notes' && (
          <NotesView
            notes={data.notes}
            openNote={openNote}
            selectedText={selectedText}
            selection={selection}
            setOpenNoteId={setOpenNoteId}
            setSelection={setSelection}
            updateNote={updateNote}
            takeSelection={takeSelection}
            createNote={createNote}
            moveNote={moveNote}
            undo={undo}
            restoreUndo={restoreUndo}
          />
        )}
        {view === 'history' && <HistoryView data={data} now={now} />}
      </main>

      <nav className="mobile-nav" aria-label="Основная навигация">
        {navigation}
      </nav>

      {undo && !(view === 'notes' && openNote) && (
        <output className="undo-bar">
          <span>{undo.message}</span>
          <Button variant="ghost" onClick={restoreUndo}>
            <RotateCcw /> Отменить
          </Button>
        </output>
      )}
    </div>
  );
}

function NavButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-button ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

type ScheduleProps = {
  data: AppData;
  now: number;
  todayKey: string;
  addTask: (day: string) => string;
  updateTask: (day: string, id: string, change: (task: Task) => Task) => void;
  runTimer: (day: string, id: string) => void;
  finishTask: (day: string, id: string) => void;
  discardTask: (day: string, id: string) => void;
  moveTask: (day: string, id: string, direction: -1 | 1) => void;
  dropTask: (day: string, sourceId: string, targetId: string) => void;
  moveTaskToDay: (
    sourceDay: string,
    id: string,
    targetDay: string,
    targetId?: string,
  ) => void;
  setTaskColor: (day: string, id: string, color?: TaskColor) => void;
  addTaskAfter: (day: string, id: string) => void;
  takeFutureTask: (day: string, id: string) => void;
};

type TaskInteractions = {
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onBlur: () => void;
  onStopEditing: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onMove: (direction: -1 | 1) => void;
  onMoveDay: (direction: -1 | 1) => void;
  onToggleTimer?: () => void;
  onSetColor: (color?: TaskColor) => void;
  onActivate: () => void;
  onDiscard: () => void;
};

function ScheduleView(props: ScheduleProps) {
  const { data, now, todayKey, addTask } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const today = new Date(now);
  const todayTasks = data.schedule[todayKey] ?? [];
  const futureMonths = (() => {
    const months: Record<string, Date[]> = {};
    const monthEnd = dateKey(
      new Date(today.getFullYear(), today.getMonth() + 1, 0),
    );
    const end = Object.keys(data.schedule).reduce(
      (last, day) => (day > last ? day : last),
      monthEnd,
    );
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    );
    while (dateKey(date) <= end) {
      const month = dateKey(date).slice(0, 7);
      (months[month] ??= []).push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return months;
  })();

  function selectTask(day: string, id: string) {
    setSelectedId(id);
    setEditingId(null);
    focusTask(day, id);
  }

  function markSelected(id: string) {
    setSelectedId(id);
    setEditingId(null);
  }

  function editTask(day: string, id: string) {
    setSelectedId(id);
    setEditingId(id);
  }

  function tasksInNavigationOrder(day: string) {
    const month = day.slice(0, 7);
    const days = Object.keys(data.schedule).sort();
    const entries = days
      .filter((candidate) => candidate.startsWith(month))
      .flatMap((candidate) =>
        (data.schedule[candidate] ?? []).map((task) => ({
          day: candidate,
          id: task.id,
        })),
      );
    if (month === todayKey.slice(0, 7))
      return entries.filter((entry) => entry.day >= todayKey);
    return entries;
  }

  function selectRelative(day: string, id: string, direction: -1 | 1) {
    const entries = tasksInNavigationOrder(day);
    const index = entries.findIndex((entry) => entry.id === id);
    const target = entries[index + direction];
    if (target) selectTask(target.day, target.id);
  }

  function selectAfterRemoval(day: string, id: string) {
    const entries = tasksInNavigationOrder(day);
    const index = entries.findIndex((entry) => entry.id === id);
    const target = entries[index + 1] ?? entries[index - 1];
    setEditingId(null);
    setSelectedId(target?.id ?? null);
    focusTask(target?.day ?? day, target?.id);
  }

  function addAndEdit(day: string) {
    const id = addTask(day);
    setSelectedId(id);
    setEditingId(id);
  }

  function moveSelectedToDay(day: string, id: string, direction: -1 | 1) {
    const targetDay = shiftedDay(day, direction);
    if (targetDay < todayKey) return;
    props.moveTaskToDay(day, id, targetDay);
    setSelectedId(id);
    setEditingId(null);
    focusTask(targetDay, id);
  }

  function taskDay(id: string) {
    return Object.entries(data.schedule).find(([, tasks]) =>
      tasks.some((task) => task.id === id),
    )?.[0];
  }

  function dropAcrossSchedule(sourceId: string, targetId: string) {
    const sourceDay = taskDay(sourceId);
    const targetDay = targetId.startsWith('schedule-day:')
      ? targetId.slice('schedule-day:'.length)
      : taskDay(targetId);
    if (!sourceDay || !targetDay || targetDay < todayKey) return;
    if (sourceDay === targetDay) {
      if (!targetId.startsWith('schedule-day:'))
        props.dropTask(sourceDay, sourceId, targetId);
      return;
    }
    props.moveTaskToDay(
      sourceDay,
      sourceId,
      targetDay,
      targetId.startsWith('schedule-day:') ? undefined : targetId,
    );
    setSelectedId(sourceId);
    setEditingId(null);
  }

  const interactionsFor = (day: string, id: string) => ({
    selected: selectedId === id,
    editing: editingId === id,
    onSelect: () => markSelected(id),
    onEdit: () => editTask(day, id),
    onBlur: () => setEditingId(null),
    onStopEditing: () => {
      setEditingId(null);
      focusTask(day, id);
    },
    onNavigate: (direction: -1 | 1) => selectRelative(day, id, direction),
    onMove: (direction: -1 | 1) => props.moveTask(day, id, direction),
    onMoveDay: (direction: -1 | 1) => moveSelectedToDay(day, id, direction),
    onToggleTimer: day === todayKey ? () => props.runTimer(day, id) : undefined,
    onSetColor: (color?: TaskColor) => props.setTaskColor(day, id, color),
    onDiscard: () => {
      selectAfterRemoval(day, id);
      props.discardTask(day, id);
    },
  });

  return (
    <SortableRoot onDrop={dropAcrossSchedule}>
      <div className="schedule-page">
        <section className="today-section">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Сегодня</p>
              <h1>{ruDate.format(today)}</h1>
            </div>
            <Button
              id={`add-${todayKey}`}
              className="add-primary"
              onClick={() => addAndEdit(todayKey)}
            >
              <Plus /> Добавить дело
            </Button>
          </div>
          <SortableDropZone
            id={`schedule-day:${todayKey}`}
            className="task-list"
          >
            <SortableItems items={todayTasks.map((task) => task.id)}>
              {todayTasks.length ? (
                todayTasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    day={todayKey}
                    index={index}
                    count={todayTasks.length}
                    {...interactionsFor(todayKey, task.id)}
                    onActivate={() => {
                      selectAfterRemoval(todayKey, task.id);
                      props.finishTask(todayKey, task.id);
                    }}
                    {...props}
                  />
                ))
              ) : (
                <button
                  className="empty-today"
                  onClick={() => addTask(todayKey)}
                >
                  <Plus /> Написать первое дело
                </button>
              )}
            </SortableItems>
          </SortableDropZone>
        </section>

        <section className="future-section">
          {Object.entries(futureMonths).map(([month, dates]) => (
            <details
              className="schedule-month"
              key={month}
              open={month === todayKey.slice(0, 7)}
            >
              <summary className="month-heading">
                <span>{ruMonth.format(dates[0])}</span>
                <span>{dates[0].getFullYear()}</span>
              </summary>
              {dates.map((date) => {
                const day = dateKey(date);
                const tasks = data.schedule[day] ?? [];
                return (
                  <div
                    className={`future-day ${tasks.length ? 'has-tasks' : ''}`}
                    key={day}
                  >
                    <div className="future-date">
                      {ruShortDate.format(date)}
                    </div>
                    <SortableDropZone
                      id={`schedule-day:${day}`}
                      className="future-tasks"
                    >
                      <SortableItems items={tasks.map((task) => task.id)}>
                        {tasks.map((task, index) => (
                          <FutureTaskRow
                            key={task.id}
                            {...props}
                            task={task}
                            day={day}
                            index={index}
                            count={tasks.length}
                            {...interactionsFor(day, task.id)}
                            onActivate={() => {
                              selectAfterRemoval(day, task.id);
                              props.takeFutureTask(day, task.id);
                            }}
                          />
                        ))}
                      </SortableItems>
                      <button
                        id={`add-${day}`}
                        className="future-add"
                        onClick={() => addAndEdit(day)}
                      >
                        <Plus /> Добавить
                      </button>
                    </SortableDropZone>
                  </div>
                );
              })}
            </details>
          ))}
          <div className="month-end">Конец расписания</div>
        </section>
      </div>
    </SortableRoot>
  );
}

const taskColors: Array<{
  value?: TaskColor;
  label: string;
  className: string;
}> = [
  { label: 'Без цвета', className: 'none' },
  { value: 'blue', label: 'Голубой', className: 'blue' },
  { value: 'yellow', label: 'Жёлтый', className: 'yellow' },
  { value: 'purple', label: 'Фиолетовый', className: 'purple' },
  { value: 'rose', label: 'Розовый', className: 'rose' },
];

function TaskColorMenu({
  color,
  onChange,
}: {
  color?: TaskColor;
  onChange: (color?: TaskColor) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className={`task-color-dot ${color ?? 'none'}`} />
        Цвет
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="task-color-menu">
        {taskColors.map((option) => (
          <DropdownMenuItem
            key={option.className}
            onClick={() => onChange(option.value)}
          >
            <span className={`task-color-dot ${option.className}`} />
            {option.label}
            {color === option.value && <Check className="task-color-check" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function FutureTaskRow({
  task,
  day,
  todayKey,
  index,
  count,
  selected,
  editing,
  onSelect,
  onEdit,
  onBlur,
  onStopEditing,
  onNavigate,
  onMove,
  onMoveDay,
  onSetColor,
  onActivate,
  onDiscard,
  updateTask,
}: ScheduleProps & {
  task: Task;
  day: string;
  index: number;
  count: number;
} & TaskInteractions) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  useEffect(() => {
    if (editing) {
      editor.current?.focus();
      resizeTextarea(editor.current);
    }
  }, [editing]);
  function handleShortcut(event: React.KeyboardEvent<HTMLElement>) {
    return selectedTaskShortcut(event, {
      edit: onEdit,
      navigate: onNavigate,
      activate: onActivate,
      discard: onDiscard,
      move: onMove,
      moveDay: onMoveDay,
    });
  }
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`future-task ${task.color ? `task-color-${task.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        onKeyDown={(event) => {
          if (!handleShortcut(event)) listeners?.onKeyDown?.(event);
        }}
        onFocus={onSelect}
        aria-label="Перетащить дело"
      >
        <GripVertical />
      </button>
      {editing ? (
        <Textarea
          ref={editor}
          id={`task-${task.id}`}
          className="future-task-editor"
          value={task.text}
          rows={1}
          aria-label={`Дело на ${ruShortDate.format(new Date(`${day}T12:00:00`))}`}
          onInput={(event) => resizeTextarea(event.currentTarget)}
          onBlur={onBlur}
          onChange={(event) =>
            updateTask(day, task.id, (current) => ({
              ...current,
              text: event.target.value,
            }))
          }
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              onStopEditing();
            }
          }}
        />
      ) : (
        <button
          id={`task-${task.id}`}
          className="future-task-text"
          onKeyDown={handleShortcut}
          onClick={onSelect}
          onDoubleClick={onEdit}
          onFocus={onSelect}
        >
          {task.text || 'Без названия'}
        </button>
      )}
      <Button
        className="future-take"
        variant="outline"
        title="Перенести в Сегодня · ⌘↵"
        aria-label="В работу сегодня"
        onKeyDown={handleShortcut}
        onFocus={onSelect}
        onClick={onActivate}
      >
        <ArrowUpToLine />
        <span>В работу</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="more-button"
          aria-label="Действия с делом"
          onKeyDown={handleShortcut}
          onFocus={onSelect}
          render={<button type="button" aria-label="Действия с делом" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="task-menu" align="end" sideOffset={8}>
          <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
            Поднять выше
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            Опустить ниже
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={shiftedDay(day, -1) < todayKey}
            onClick={() => onMoveDay(-1)}
          >
            На день раньше<DropdownMenuShortcut>⌘←</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMoveDay(1)}>
            На день позже<DropdownMenuShortcut>⌘→</DropdownMenuShortcut>
          </DropdownMenuItem>
          <TaskColorMenu color={task.color} onChange={onSetColor} />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDiscard}>
            Убрать без истории<DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function TaskRow({
  task,
  day,
  index,
  count,
  now,
  updateTask,
  runTimer,
  selected,
  editing,
  onSelect,
  onEdit,
  onBlur,
  onStopEditing,
  onNavigate,
  onMove,
  onMoveDay,
  onToggleTimer,
  onSetColor,
  onActivate,
  onDiscard,
}: ScheduleProps & {
  task: Task;
  day: string;
  index: number;
  count: number;
} & TaskInteractions) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const state = taskState(task);
  const timerLabel =
    state === 'idle' ? 'Начать' : state === 'running' ? 'Пауза' : 'Продолжить';
  const TimerIcon = state === 'running' ? CirclePause : CirclePlay;
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  useEffect(() => {
    if (editing) {
      editor.current?.focus();
      resizeTextarea(editor.current);
    }
  }, [editing]);

  function handleShortcut(event: React.KeyboardEvent<HTMLElement>) {
    return selectedTaskShortcut(event, {
      edit: onEdit,
      navigate: onNavigate,
      activate: onActivate,
      discard: onDiscard,
      move: onMove,
      moveDay: onMoveDay,
      toggleTimer: onToggleTimer,
    });
  }

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`task-row ${task.color ? `task-color-${task.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${state === 'running' ? 'running' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        onKeyDown={(event) => {
          if (!handleShortcut(event)) listeners?.onKeyDown?.(event);
        }}
        onFocus={onSelect}
        aria-label="Перетащить дело"
      >
        <GripVertical />
      </button>
      <div className="task-body">
        {editing ? (
          <Textarea
            ref={editor}
            id={`task-${task.id}`}
            className="task-text"
            value={task.text}
            rows={1}
            placeholder="Что сделать?"
            onFocus={(event) => resizeTextarea(event.currentTarget)}
            onInput={(event) => resizeTextarea(event.currentTarget)}
            onBlur={onBlur}
            onChange={(event) =>
              updateTask(day, task.id, (current) => ({
                ...current,
                text: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                onStopEditing();
              }
            }}
          />
        ) : (
          <button
            id={`task-${task.id}`}
            className="task-text task-text-display"
            onClick={onSelect}
            onDoubleClick={onEdit}
            onFocus={onSelect}
            onKeyDown={handleShortcut}
          >
            {task.text || 'Без названия'}
          </button>
        )}
        {state !== 'idle' && (
          <p className="timer-meta">
            <Clock3 />
            {state === 'running' ? 'Идёт' : 'На паузе'} ·{' '}
            {minutesLabel(taskDuration(task, now))} · с{' '}
            {ruTime.format(task.intervals[0].start)}
          </p>
        )}
      </div>
      <div className="task-actions">
        <Button
          variant={state === 'running' ? 'secondary' : 'outline'}
          title={`${timerLabel} · ⌥↵`}
          onKeyDown={handleShortcut}
          onFocus={onSelect}
          onClick={() => {
            onSelect();
            runTimer(day, task.id);
          }}
        >
          <TimerIcon /> {timerLabel}
        </Button>
        <Button
          className="finish-button"
          onKeyDown={handleShortcut}
          size="icon"
          onFocus={onSelect}
          onClick={onActivate}
          aria-label="Завершить дело"
          title="Завершить · ⌘↵"
        >
          <Check />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="more-button"
            aria-label="Другие действия"
            onKeyDown={handleShortcut}
            onFocus={onSelect}
            render={<button type="button" aria-label="Другие действия" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="task-menu" align="end" sideOffset={8}>
            <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
              Поднять выше
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === count - 1}
              onClick={() => onMove(1)}
            >
              Опустить ниже
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled onClick={() => onMoveDay(-1)}>
              На день раньше<DropdownMenuShortcut>⌘←</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMoveDay(1)}>
              На завтра<DropdownMenuShortcut>⌘→</DropdownMenuShortcut>
            </DropdownMenuItem>
            <TaskColorMenu color={task.color} onChange={onSetColor} />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDiscard}>
              Убрать без истории
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

function NotesView({
  notes,
  openNote,
  selectedText,
  selection,
  setOpenNoteId,
  setSelection,
  updateNote,
  takeSelection,
  createNote,
  moveNote,
  undo,
  restoreUndo,
}: {
  notes: Note[];
  openNote: Note | null;
  selectedText: string;
  selection: TextRange;
  setOpenNoteId: (id: string | null) => void;
  setSelection: (selection: { start: number; end: number }) => void;
  updateNote: (id: string, change: (note: Note) => Note) => void;
  takeSelection: (note: Note, cursor?: TextRange) => void;
  createNote: () => void;
  moveNote: (sourceId: string, targetId: string) => void;
  undo: UndoState;
  restoreUndo: () => void;
}) {
  const noteContentRef = useRef<HTMLTextAreaElement>(null);
  const noteTitleRef = useRef<HTMLInputElement>(null);

  return (
    <section className="notes-page">
      <div className="page-heading">
        <h1>Заметки</h1>
        <Button className="add-primary" onClick={createNote}>
          <Plus /> Новая заметка
        </Button>
      </div>
      <SortableList items={notes.map((note) => note.id)} grid onMove={moveNote}>
        <div className="notes-grid">
          {notes.map((note) => (
            <SortableNote
              key={note.id}
              note={note}
              onOpen={() => {
                setSelection({ start: 0, end: 0 });
                setOpenNoteId(note.id);
              }}
            />
          ))}
        </div>
      </SortableList>

      <Dialog
        open={Boolean(openNote)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenNoteId(null);
            setSelection({ start: 0, end: 0 });
          }
        }}
      >
        {openNote && (
          <DialogContent
            className={`note-dialog ${openNote.color}`}
            showCloseButton={false}
            initialFocus={() =>
              !openNote.title && !openNote.content
                ? noteTitleRef.current
                : noteContentRef.current
            }
            finalFocus={() =>
              document.querySelector<HTMLButtonElement>(
                `[data-note-id="${openNote.id}"]`,
              )
            }
          >
            <DialogTitle className="sr-only">
              {openNote.title || 'Заметка без названия'}
            </DialogTitle>
            <div className="note-dialog-toolbar">
              <div className="color-picker" aria-label="Цвет заметки">
                {(['teal', 'purple', 'white', 'red'] as const).map((color) => (
                  <button
                    key={color}
                    className={`color-dot ${color} ${openNote.color === color ? 'selected' : ''}`}
                    onClick={() =>
                      updateNote(openNote.id, (note) => ({ ...note, color }))
                    }
                    aria-label={`Выбрать цвет ${color}`}
                  />
                ))}
              </div>
              <button
                className="note-close"
                aria-label="Закрыть заметку"
                onClick={() => setOpenNoteId(null)}
              >
                <X />
              </button>
            </div>
            <input
              ref={noteTitleRef}
              className="note-title-input"
              value={openNote.title}
              placeholder="Название"
              aria-label="Название заметки"
              onChange={(event) =>
                updateNote(openNote.id, (note) => ({
                  ...note,
                  title: event.target.value,
                }))
              }
            />
            <NoteEditor
              editorRef={noteContentRef}
              value={openNote.content}
              selection={selection}
              onChange={(content) =>
                updateNote(openNote.id, (note) => ({
                  ...note,
                  content,
                }))
              }
              onSelection={setSelection}
              onTake={(cursor) => takeSelection(openNote, cursor)}
            />
            <div className="note-dialog-action">
              {undo && (
                <output className="note-undo">
                  <span>{undo.message}</span>
                  <Button variant="ghost" onClick={restoreUndo}>
                    Отменить
                  </Button>
                </output>
              )}
              <Button
                className="take-to-work-button"
                disabled={!selectedText}
                title={
                  selectedText
                    ? 'Взять абзац в работу · ⌘↵'
                    : 'Поставь курсор в нужный абзац'
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => takeSelection(openNote)}
              >
                <Plus /> Взять в работу <kbd>⌘↵</kbd>
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function SortableNote({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-note-id={note.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`note-card ${note.color} ${isDragging ? 'dragging' : ''}`}
      aria-label={`Открыть заметку ${note.title || 'Без названия'}`}
      onClick={onOpen}
    >
      <h2>{note.title || 'Без названия'}</h2>
      <p>{note.content}</p>
    </button>
  );
}

function HistoryView({ data, now }: { data: AppData; now: number }) {
  const days = data.history.reduce<Record<string, AppData['history']>>(
    (groups, item) => {
      const day = dateKey(new Date(item.finishedAt));
      (groups[day] ??= []).push(item);
      return groups;
    },
    {},
  );

  return (
    <section className="history-page">
      <div className="page-heading">
        <h1>История</h1>
      </div>
      {data.history.length ? (
        <div className="history-days">
          {Object.entries(days).map(([day, items]) => (
            <section className="history-day" key={day}>
              <h2>{ruDate.format(new Date(`${day}T12:00:00`))}</h2>
              <div className="history-list">
                {[...items]
                  .sort((a, b) => a.finishedAt - b.finishedAt)
                  .map((item) => {
                    const total = item.intervals.reduce(
                      (sum, interval) =>
                        sum + ((interval.end ?? now) - interval.start),
                      0,
                    );
                    const first = item.intervals[0]?.start;
                    const last = item.intervals.at(-1)?.end ?? item.finishedAt;
                    return (
                      <article key={item.id}>
                        <Check />
                        <div>
                          <h3>{item.text || 'Без названия'}</h3>
                          <p>
                            {first
                              ? `${ruTime.format(first)}–${ruTime.format(last)} · ${minutesLabel(total)}`
                              : `${ruTime.format(item.finishedAt)} · завершено`}
                          </p>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-history">Пока ничего не завершено.</div>
      )}
    </section>
  );
}
