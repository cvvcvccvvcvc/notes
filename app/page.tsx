'use client';

import {
  CalendarDays,
  Check,
  ArrowUpToLine,
  CirclePause,
  CirclePlay,
  Clock3,
  FileText,
  GripVertical,
  History,
  ListTodo,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { HistoryView } from '@/features/history/history-view';
import { NotesView } from '@/features/notes/notes-view';
import { TemplatesView } from '@/features/templates/templates-view';
import {
  type AppData,
  type MonthTemplateRule,
  type MonthTemplateSchedule,
  type Note,
  type Task,
  type TaskColor,
  type TaskGroup,
} from '@/lib/data';
import {
  dateKey,
  minutesLabel,
  ruDate,
  ruMonth,
  ruShortDate,
  ruTime,
  shiftedDay,
} from '@/lib/date-time';
import { UNSORTED_GROUP_ID } from '@/lib/backlog';
import {
  appendMonthTemplateRule,
  createMonthFromTemplate,
  defaultMonthTemplateSchedule,
  moveMonthTemplateRule as moveMonthTemplateRuleInData,
  monthTemplateTaskCount,
  nextMonthKey,
  removeMonthTemplateRule as removeMonthTemplateRuleFromData,
  updateMonthTemplateRule as updateMonthTemplateRuleInData,
} from '@/lib/month-template';
import {
  addNoteTaskToSchedule,
  moveNote as moveNoteInData,
  prependNote,
  updateNote as updateNoteInData,
} from '@/lib/note-operations';
import { SortableDropZone, SortableItems, SortableRoot } from '@/lib/sorting';
import { paragraphRange } from '@/lib/paragraph';
import { TaskTextEditor, TaskTextPreview } from '@/lib/task-text';
import {
  moveBacklogTask as moveBacklogTaskInData,
  moveBacklogTaskVertically as moveBacklogTaskVerticallyInData,
  moveScheduledTask,
  moveScheduledTaskToDay,
  finishScheduledTask,
  removeBacklogTask as removeBacklogTaskFromData,
  removeBacklogGroup as removeBacklogGroupFromData,
  removeScheduledTask,
  restoreScheduledTask,
  sendScheduledTaskToBacklog,
  takeBacklogTask as takeBacklogTaskFromData,
  takeFutureTask as takeFutureTaskFromData,
  taskDuration,
  taskState,
  toggleScheduledTaskTimer,
  updateBacklogTask as updateBacklogTaskInData,
  updateScheduledTask,
  updateScheduledTasks,
} from '@/lib/task-operations';
import {
  useSyncedAppData,
  type LocalSaveState,
  type SyncState,
} from '@/hooks/use-synced-app-data';

type View = 'today' | 'backlog' | 'notes' | 'templates' | 'history';
type UndoState = {
  message: string;
  restore: (current: AppData) => AppData;
} | null;

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function focusTask(day: string, id?: string) {
  requestAnimationFrame(() => {
    const card = document.getElementById(id ? `task-${id}` : `add-${day}`);
    const element =
      card?.querySelector<HTMLElement>('[data-task-focus]') ?? card;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'nearest' });
  });
}

function isTextEditor(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, [contenteditable="true"]') ||
      target.closest('[contenteditable="true"]') != null)
  );
}

function selectedTaskShortcut(
  event: React.KeyboardEvent<HTMLElement>,
  actions: {
    edit: () => void;
    navigate: (direction: -1 | 1) => void;
    activate: () => void;
    discard: () => void;
    move: (direction: -1 | 1) => void;
    toggleTimer?: () => void;
  },
) {
  if (event.nativeEvent.isComposing || event.shiftKey) return false;
  if (isTextEditor(event.target)) {
    if (
      event.metaKey &&
      (event.key === 'Backspace' || event.key === 'Delete')
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) actions.discard();
      return true;
    }
    if (
      !(
        event.key === 'Enter' &&
        ((event.metaKey && !event.altKey) || (!event.metaKey && event.altKey))
      )
    )
      return false;
  }
  if (!event.metaKey && event.altKey && event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) actions.toggleTimer?.();
    return true;
  }
  if (event.altKey) return false;
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  if (!event.metaKey && !vertical && event.key !== 'Enter') return false;
  if (
    event.metaKey &&
    !vertical &&
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
  else actions.discard();
  return true;
}

function persistenceLabel(saveState: LocalSaveState, syncState: SyncState) {
  if (saveState === 'loading') return 'Открываю…';
  if (saveState === 'saving') return 'Сохраняю…';
  if (saveState === 'error') return 'Ошибка сохранения';
  if (syncState === 'syncing') return 'Синхронизирую…';
  if (syncState === 'synced') return 'Синхронизировано';
  if (syncState === 'offline') return 'Без сети · сохранено';
  if (syncState === 'auth') return 'Нужен вход';
  if (syncState === 'conflict') return 'Нужно выбрать версию';
  return 'Сохранено локально';
}

function recordCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return 'запись';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'записи';
  return 'записей';
}

export default function Home() {
  const [view, setView] = useState<View>('today');
  const [now, setNow] = useState(() => Date.now());
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [undo, setUndo] = useState<UndoState>(null);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const todayKey = dateKey(new Date(now));
  const {
    data,
    dataRef,
    saveState,
    syncState,
    commit,
    synchronize,
    resolveConflict,
  } = useSyncedAppData(todayKey);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

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
    let refreshing = false;
    const applyUpdate = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', applyUpdate);
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch(() => undefined);
    return () =>
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        applyUpdate,
      );
  }, []);

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
    function handleUndo(event: KeyboardEvent) {
      if (
        !undo ||
        !event.metaKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'z' ||
        isTextEditor(event.target)
      )
        return;
      event.preventDefault();
      const currentUndo = undo;
      setUndo(null);
      commit(currentUndo.restore);
    }
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [commit, undo]);

  useEffect(() => {
    if (!undo) return;
    const timeout = window.setTimeout(() => setUndo(null), 15_000);
    return () => window.clearTimeout(timeout);
  }, [undo]);

  function updateTasks(day: string, change: (tasks: Task[]) => Task[]) {
    commit((current) => updateScheduledTasks(current, day, change));
  }

  function addTask(day: string) {
    const id = uid();
    updateTasks(day, (tasks) => [...tasks, { id, text: '', intervals: [] }]);
    window.setTimeout(() => document.getElementById(`task-${id}`)?.focus(), 0);
    return id;
  }

  function updateTask(day: string, id: string, change: (task: Task) => Task) {
    commit((current) => updateScheduledTask(current, day, id, change));
  }

  function runTimer(day: string, id: string) {
    if (day !== todayKey) return;
    commit((current) => toggleScheduledTaskTimer(current, day, id, Date.now()));
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
    commitWithUndo(
      'Дело завершено',
      (current) => finishScheduledTask(current, { day, id, historyId, stamp }),
      (current) => ({
        ...restoreScheduledTask(current, day, task, index),
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
      (current) => removeScheduledTask(current, day, id),
      (current) => restoreScheduledTask(current, day, task, index),
    );
  }

  function moveTask(day: string, id: string, direction: -1 | 1) {
    commit((current) =>
      moveScheduledTask(current, {
        day,
        id,
        direction,
        adjacentDay: shiftedDay(day, direction),
        today: todayKey,
        now: Date.now(),
      }),
    );
  }

  function moveTaskToDay(
    sourceDay: string,
    id: string,
    targetDay: string,
    targetId?: string,
  ) {
    commit((current) =>
      moveScheduledTaskToDay(current, {
        sourceDay,
        id,
        targetDay,
        targetId,
        today: todayKey,
        now: Date.now(),
      }),
    );
  }

  function setTaskColor(day: string, id: string, color?: TaskColor) {
    updateTask(day, id, (task) => ({ ...task, color }));
  }

  function sendTaskToBacklog(day: string, id: string) {
    const tasks = dataRef.current?.schedule[day] ?? [];
    const index = tasks.findIndex((task) => task.id === id);
    const original = tasks[index];
    if (!original) return;
    commitWithUndo(
      'Перенесено в Дела',
      (current) => sendScheduledTaskToBacklog(current, day, id, Date.now()),
      (current) => ({
        ...restoreScheduledTask(current, day, original, index),
        backlog: (current.backlog ?? []).map((group) => ({
          ...group,
          tasks: group.tasks.filter((candidate) => candidate.id !== id),
        })),
      }),
    );
  }

  function updateBacklog(change: (groups: TaskGroup[]) => TaskGroup[]) {
    commit((current) => ({
      ...current,
      backlog: change(current.backlog ?? []),
    }));
  }

  function addBacklogGroup() {
    const id = uid();
    updateBacklog((groups) => [
      ...groups,
      { id, title: 'Новая группа', tasks: [] },
    ]);
    return id;
  }

  function renameBacklogGroup(id: string, title: string) {
    updateBacklog((groups) =>
      groups.map((group) => (group.id === id ? { ...group, title } : group)),
    );
  }

  function setBacklogGroupColor(id: string, color?: TaskColor) {
    updateBacklog((groups) =>
      groups.map((group) => (group.id === id ? { ...group, color } : group)),
    );
  }

  function removeBacklogGroup(id: string) {
    if (id === UNSORTED_GROUP_ID) return;
    commit((current) => removeBacklogGroupFromData(current, id));
  }

  function updateBacklogTask(
    groupId: string,
    id: string,
    change: (task: Task) => Task,
  ) {
    commit((current) => updateBacklogTaskInData(current, groupId, id, change));
  }

  function moveBacklogTask(
    sourceGroupId: string,
    id: string,
    targetGroupId: string,
    targetId?: string,
  ) {
    commit((current) =>
      moveBacklogTaskInData(current, {
        sourceGroupId,
        id,
        targetGroupId,
        targetId,
      }),
    );
  }

  function moveBacklogTaskVertically(
    groupId: string,
    id: string,
    direction: -1 | 1,
  ) {
    commit((current) =>
      moveBacklogTaskVerticallyInData(current, groupId, id, direction),
    );
  }

  function discardBacklogTask(groupId: string, id: string) {
    const group = dataRef.current?.backlog?.find(
      (candidate) => candidate.id === groupId,
    );
    const index = group?.tasks.findIndex((task) => task.id === id) ?? -1;
    const task = group?.tasks[index];
    if (!task || index < 0) return;
    commitWithUndo(
      'Дело убрано',
      (current) => removeBacklogTaskFromData(current, groupId, id),
      (current) => ({
        ...current,
        backlog: (current.backlog ?? []).map((candidate) => {
          if (candidate.id !== groupId) return candidate;
          if (candidate.tasks.some((item) => item.id === id)) return candidate;
          const tasks = [...candidate.tasks];
          tasks.splice(Math.min(index, tasks.length), 0, task);
          return { ...candidate, tasks };
        }),
      }),
    );
  }

  function takeBacklogTask(groupId: string, id: string) {
    const group = dataRef.current?.backlog?.find(
      (candidate) => candidate.id === groupId,
    );
    const index = group?.tasks.findIndex((task) => task.id === id) ?? -1;
    const task = group?.tasks[index];
    if (!task || index < 0) return;
    commitWithUndo(
      'Перенесено в Сегодня',
      (current) => takeBacklogTaskFromData(current, groupId, id, todayKey),
      (current) => ({
        ...current,
        backlog: (current.backlog ?? []).map((candidate) => {
          if (candidate.id !== groupId) return candidate;
          const liveTask = current.schedule[todayKey]?.find(
            (item) => item.id === id,
          );
          if (!liveTask || candidate.tasks.some((item) => item.id === id))
            return candidate;
          const tasks = [...candidate.tasks];
          tasks.splice(Math.min(index, tasks.length), 0, liveTask);
          return { ...candidate, tasks };
        }),
        schedule: {
          ...current.schedule,
          [todayKey]: (current.schedule[todayKey] ?? []).filter(
            (item) => item.id !== id,
          ),
        },
      }),
    );
  }

  function takeFutureTask(day: string, id: string) {
    if (day <= todayKey) return;
    const tasks = dataRef.current?.schedule[day] ?? [];
    const index = tasks.findIndex((task) => task.id === id);
    const task = tasks[index];
    if (!task) return;
    commitWithUndo(
      'Перенесено в Сегодня',
      (current) => takeFutureTaskFromData(current, day, id, todayKey),
      (current) => {
        const liveTask = current.schedule[todayKey]?.find(
          (item) => item.id === id,
        );
        if (!liveTask) return current;
        return restoreScheduledTask(
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

  function updateNote(id: string, change: (note: Note) => Note) {
    commit((current) => updateNoteInData(current, id, change));
  }

  function createNote() {
    const id = uid();
    commit((current) =>
      prependNote(current, { id, title: '', content: '', color: 'white' }),
    );
    setSelection({ start: 0, end: 0 });
    setOpenNoteId(id);
  }

  function moveNote(sourceId: string, targetId: string) {
    commit((current) => moveNoteInData(current, sourceId, targetId));
  }

  function takeSelection(note: Note, cursor = selection) {
    const range = paragraphRange(note.content, cursor);
    const text = note.content.slice(range.start, range.end).trim();
    if (!text) return;
    const taskId = uid();
    commitWithUndo(
      'Добавлено в Сегодня',
      (current) =>
        addNoteTaskToSchedule(current, {
          today: todayKey,
          taskId,
          noteId: note.id,
          text,
        }),
      (current) => removeScheduledTask(current, todayKey, taskId),
    );
  }

  function addMonthTemplateRule(kind: MonthTemplateSchedule['kind']) {
    const id = uid();
    const rule: MonthTemplateRule = {
      id,
      text: '',
      schedule: defaultMonthTemplateSchedule(kind, new Date(now)),
    };
    commit((current) => appendMonthTemplateRule(current, rule));
    requestAnimationFrame(() =>
      document.getElementById(`template-rule-${id}`)?.focus(),
    );
  }

  function updateMonthTemplateRule(
    id: string,
    change: (rule: MonthTemplateRule) => MonthTemplateRule,
  ) {
    commit((current) => updateMonthTemplateRuleInData(current, id, change));
  }

  function removeMonthTemplateRule(id: string) {
    commit((current) => removeMonthTemplateRuleFromData(current, id));
  }

  function moveMonthTemplateRule(id: string, direction: -1 | 1) {
    commit((current) => moveMonthTemplateRuleInData(current, id, direction));
  }

  function createMonth(month: string) {
    commit((current) => createMonthFromTemplate(current, month));
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
        active={view === 'backlog'}
        icon={<ListTodo />}
        onClick={() => setView('backlog')}
      >
        Дела
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
  const storageLabel = persistenceLabel(saveState, syncState);
  const storageProblem =
    saveState === 'error' || syncState === 'auth' || syncState === 'conflict';
  const openStorageStatus = () => {
    if (syncState === 'auth') window.location.assign('/login');
    else if (syncState === 'conflict') setSyncPanelOpen(true);
    else void synchronize();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('today')}>
          notes
        </button>
        <nav aria-label="Основная навигация">{navigation}</nav>
        <div className="sidebar-spacer" />
        <button
          className={`utility-button ${view === 'templates' ? 'active' : ''}`}
          onClick={() => setView('templates')}
        >
          <CalendarDays />
          <span>Шаблоны</span>
        </button>
        <button
          className={`utility-button ${view === 'history' ? 'active' : ''}`}
          onClick={() => setView('history')}
        >
          <History />
          <span>История</span>
        </button>
        <button className="storage-status" onClick={openStorageStatus}>
          <span
            className={`status-dot ${storageProblem ? 'error' : ''} ${syncState === 'offline' ? 'offline' : ''}`}
          />
          <span>{storageLabel}</span>
        </button>
      </aside>

      <header className="mobile-header">
        <button className="brand" onClick={() => setView('today')}>
          notes
        </button>
        <div className="mobile-tools">
          <button
            className={`mobile-save ${storageProblem ? 'error' : ''}`}
            onClick={openStorageStatus}
          >
            {storageLabel}
          </button>
          <button
            className={view === 'templates' ? 'active' : ''}
            onClick={() => setView('templates')}
            aria-label="Шаблоны месяцев"
          >
            <CalendarDays />
          </button>
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
            sendTaskToBacklog={sendTaskToBacklog}
            takeFutureTask={takeFutureTask}
            createMonth={createMonth}
            openTemplates={() => setView('templates')}
          />
        )}
        {view === 'backlog' && (
          <BacklogView
            groups={data.backlog ?? []}
            addGroup={addBacklogGroup}
            renameGroup={renameBacklogGroup}
            setGroupColor={setBacklogGroupColor}
            removeGroup={removeBacklogGroup}
            updateTask={updateBacklogTask}
            moveTask={moveBacklogTask}
            moveTaskVertically={moveBacklogTaskVertically}
            discardTask={discardBacklogTask}
            takeTask={takeBacklogTask}
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
        {view === 'templates' && (
          <TemplatesView
            rules={data.monthPlanning?.rules ?? []}
            today={new Date(now)}
            addRule={addMonthTemplateRule}
            updateRule={updateMonthTemplateRule}
            removeRule={removeMonthTemplateRule}
            moveRule={moveMonthTemplateRule}
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

      <Dialog open={syncPanelOpen} onOpenChange={setSyncPanelOpen}>
        <DialogContent className="sync-dialog">
          <DialogTitle>Данные изменились на двух устройствах</DialogTitle>
          <p>
            Автоматически соединить версии без риска не получилось. Выбери,
            какую оставить; до выбора эта версия продолжает храниться на этом
            устройстве.
          </p>
          <div className="sync-dialog-actions">
            <Button
              variant="outline"
              onClick={() => {
                resolveConflict('remote');
                setSyncPanelOpen(false);
              }}
            >
              Взять с сервера
            </Button>
            <Button
              onClick={() => {
                resolveConflict('local');
                setSyncPanelOpen(false);
              }}
            >
              Оставить это устройство
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  sendTaskToBacklog: (day: string, id: string) => void;
  takeFutureTask: (day: string, id: string) => void;
  createMonth: (month: string) => void;
  openTemplates: () => void;
};

type TaskInteractions = {
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onStopEditing: (refocus?: boolean) => void;
  onNavigate: (direction: -1 | 1) => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleTimer?: () => void;
  onSetColor: (color?: TaskColor) => void;
  onSendToBacklog: () => void;
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
  const nextMonth = nextMonthKey(data, todayKey);
  const nextMonthDate = new Date(`${nextMonth}-01T12:00:00`);
  const templateRules = data.monthPlanning?.rules ?? [];
  const hasFilledTemplate = templateRules.some((rule) => rule.text.trim());
  const generatedTaskCount = monthTemplateTaskCount(data, nextMonth);

  function materializeNextMonth() {
    props.createMonth(nextMonth);
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLDetailsElement>(
        `[data-month="${nextMonth}"]`,
      );
      if (!element) return;
      element.open = true;
      element.scrollIntoView({ block: 'start' });
    });
  }

  function selectTask(day: string, id: string) {
    setSelectedId(id);
    setEditingId(null);
    focusTask(day, id);
  }

  function markSelected(id: string) {
    setSelectedId(id);
    setEditingId((current) => (current === id ? current : null));
  }

  function editTask(day: string, id: string) {
    setSelectedId(id);
    setEditingId(id);
  }

  function tasksInNavigationOrder() {
    return Object.keys(data.schedule)
      .sort()
      .filter((candidate) => candidate >= todayKey)
      .flatMap((candidate) =>
        (data.schedule[candidate] ?? []).map((task) => ({
          day: candidate,
          id: task.id,
        })),
      );
  }

  function selectRelative(day: string, id: string, direction: -1 | 1) {
    const entries = tasksInNavigationOrder();
    const index = entries.findIndex((entry) => entry.id === id);
    const target = entries[index + direction];
    if (target) selectTask(target.day, target.id);
  }

  function selectAfterRemoval(day: string, id: string) {
    const entries = tasksInNavigationOrder();
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

  function moveSelectedVertically(day: string, id: string, direction: -1 | 1) {
    const tasks = data.schedule[day] ?? [];
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    const staysInDay =
      index + direction >= 0 && index + direction < tasks.length;
    const targetDay = staysInDay ? day : shiftedDay(day, direction);
    if (targetDay < todayKey) return;
    props.moveTask(day, id, direction);
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

  const interactionsFor = (day: string, id: string) => {
    const tasks = data.schedule[day] ?? [];
    const index = tasks.findIndex((task) => task.id === id);
    return {
      selected: selectedId === id,
      editing: editingId === id,
      onSelect: () => markSelected(id),
      onEdit: () => editTask(day, id),
      onStopEditing: (refocus = false) => {
        setEditingId(null);
        if (refocus) focusTask(day, id);
      },
      onNavigate: (direction: -1 | 1) => selectRelative(day, id, direction),
      onMove: (direction: -1 | 1) => moveSelectedVertically(day, id, direction),
      canMoveUp: !(day === todayKey && index === 0),
      canMoveDown: true,
      onToggleTimer:
        day === todayKey ? () => props.runTimer(day, id) : undefined,
      onSetColor: (color?: TaskColor) => props.setTaskColor(day, id, color),
      onSendToBacklog: () => {
        selectAfterRemoval(day, id);
        props.sendTaskToBacklog(day, id);
      },
      onDiscard: () => {
        selectAfterRemoval(day, id);
        props.discardTask(day, id);
      },
    };
  };

  return (
    <SortableRoot onDrop={dropAcrossSchedule}>
      <div
        className="schedule-page"
        onPointerDownCapture={(event) => {
          if (!(event.target as HTMLElement).closest('[data-task-card]')) {
            setSelectedId(null);
            setEditingId(null);
            const active = document.activeElement;
            if (
              active instanceof HTMLElement &&
              active.closest('[data-task-card]')
            )
              active.blur();
          }
        }}
      >
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
                todayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    day={todayKey}
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
              data-month={month}
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
                        {tasks.map((task) => (
                          <FutureTaskRow
                            key={task.id}
                            {...props}
                            task={task}
                            day={day}
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
          <div className="month-end">
            <div>
              <strong>
                {ruMonth.format(nextMonthDate)} {nextMonthDate.getFullYear()}
              </strong>
              <span>
                {hasFilledTemplate
                  ? `${generatedTaskCount} ${recordCountLabel(generatedTaskCount)} из шаблона`
                  : 'Сначала добавь постоянные записи'}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={
                hasFilledTemplate ? materializeNextMonth : props.openTemplates
              }
            >
              <CalendarDays />
              {hasFilledTemplate ? 'Создать месяц' : 'Настроить шаблон'}
            </Button>
          </div>
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
  label = 'Цвет',
}: {
  color?: TaskColor;
  onChange: (color?: TaskColor) => void;
  label?: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className={`task-color-dot ${color ?? 'none'}`} />
        {label}
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

type BacklogProps = {
  groups: TaskGroup[];
  addGroup: () => string;
  renameGroup: (id: string, title: string) => void;
  setGroupColor: (id: string, color?: TaskColor) => void;
  removeGroup: (id: string) => void;
  updateTask: (
    groupId: string,
    id: string,
    change: (task: Task) => Task,
  ) => void;
  moveTask: (
    sourceGroupId: string,
    id: string,
    targetGroupId: string,
    targetId?: string,
  ) => void;
  moveTaskVertically: (groupId: string, id: string, direction: -1 | 1) => void;
  discardTask: (groupId: string, id: string) => void;
  takeTask: (groupId: string, id: string) => void;
};

function focusBacklogTask(id?: string) {
  requestAnimationFrame(() => {
    const card = id ? document.getElementById(`backlog-task-${id}`) : undefined;
    const element =
      card?.querySelector<HTMLElement>('[data-task-focus]') ?? card;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'nearest' });
  });
}

function backlogShortcut(
  event: React.KeyboardEvent<HTMLElement>,
  actions: {
    edit: () => void;
    navigate: (direction: -1 | 1) => void;
    move: (direction: -1 | 1) => void;
    take: () => void;
    discard: () => void;
  },
) {
  if (isTextEditor(event.target)) {
    if (
      event.metaKey &&
      (event.key === 'Backspace' || event.key === 'Delete')
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) actions.discard();
      return true;
    }
    if (!(event.metaKey && event.key === 'Enter')) return false;
  }
  if (
    event.nativeEvent.isComposing ||
    event.shiftKey ||
    event.altKey ||
    (!event.metaKey &&
      !['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) ||
    (event.metaKey &&
      !['ArrowUp', 'ArrowDown', 'Enter', 'Backspace', 'Delete'].includes(
        event.key,
      ))
  )
    return false;
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return true;
  if (!event.metaKey && event.key === 'Enter') actions.edit();
  else if (!event.metaKey) actions.navigate(event.key === 'ArrowUp' ? -1 : 1);
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    actions.move(event.key === 'ArrowUp' ? -1 : 1);
  else if (event.key === 'Enter') actions.take();
  else actions.discard();
  return true;
}

function BacklogView(props: BacklogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const entries = props.groups.flatMap((group) =>
    group.tasks.map((task) => ({ groupId: group.id, id: task.id })),
  );

  function select(id: string) {
    setSelectedId(id);
    setEditingId((current) => (current === id ? current : null));
  }

  function selectRelative(id: string, direction: -1 | 1) {
    const index = entries.findIndex((entry) => entry.id === id);
    const target = entries[index + direction];
    if (!target) return;
    select(target.id);
    focusBacklogTask(target.id);
  }

  function selectAfterRemoval(id: string) {
    const index = entries.findIndex((entry) => entry.id === id);
    const target = entries[index + 1] ?? entries[index - 1];
    setSelectedId(target?.id ?? null);
    setEditingId(null);
    focusBacklogTask(target?.id);
  }

  function groupForTask(id: string) {
    return props.groups.find((group) =>
      group.tasks.some((task) => task.id === id),
    )?.id;
  }

  function dropTask(sourceId: string, targetId: string) {
    const sourceGroup = groupForTask(sourceId);
    const targetGroup = targetId.startsWith('backlog-group:')
      ? targetId.slice('backlog-group:'.length)
      : groupForTask(targetId);
    if (!sourceGroup || !targetGroup) return;
    props.moveTask(
      sourceGroup,
      sourceId,
      targetGroup,
      targetId.startsWith('backlog-group:') ? undefined : targetId,
    );
    select(sourceId);
  }

  function addGroup() {
    const id = props.addGroup();
    requestAnimationFrame(() => {
      const input = document.getElementById(`backlog-group-title-${id}`);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
  }

  return (
    <div
      className="backlog-page"
      onPointerDownCapture={(event) => {
        if (!(event.target as HTMLElement).closest('[data-task-card]')) {
          setSelectedId(null);
          setEditingId(null);
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            active.closest('[data-task-card]')
          )
            active.blur();
        }
      }}
    >
      <div className="page-heading backlog-heading">
        <div>
          <h1>Дела</h1>
        </div>
      </div>
      <SortableRoot onDrop={dropTask}>
        <div className="backlog-groups">
          {props.groups.map((group, groupIndex) => (
            <section
              className={`backlog-group ${group.color ? `group-color-${group.color}` : ''}`}
              key={group.id}
            >
              <header className="backlog-group-heading">
                <input
                  id={`backlog-group-title-${group.id}`}
                  className="backlog-group-title"
                  value={group.title}
                  readOnly={group.id === UNSORTED_GROUP_ID}
                  aria-label="Название группы"
                  onChange={(event) =>
                    props.renameGroup(group.id, event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="more-button"
                    render={
                      <button type="button" aria-label="Действия с группой" />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <TaskColorMenu
                      label="Цвет группы"
                      color={group.color}
                      onChange={(color) => props.setGroupColor(group.id, color)}
                    />
                    {group.id !== UNSORTED_GROUP_ID && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => props.removeGroup(group.id)}
                        >
                          Удалить группу → Не разобрано
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>
              <SortableDropZone
                id={`backlog-group:${group.id}`}
                className="backlog-list"
              >
                <SortableItems items={group.tasks.map((task) => task.id)}>
                  {group.tasks.map((task, index) => (
                    <BacklogTaskRow
                      key={task.id}
                      task={task}
                      selected={selectedId === task.id}
                      editing={editingId === task.id}
                      onSelect={() => select(task.id)}
                      onEdit={() => {
                        setSelectedId(task.id);
                        setEditingId(task.id);
                      }}
                      onStopEditing={(refocus = false) => {
                        setEditingId(null);
                        if (refocus) focusBacklogTask(task.id);
                      }}
                      onNavigate={(direction) =>
                        selectRelative(task.id, direction)
                      }
                      onMove={(direction) => {
                        props.moveTaskVertically(group.id, task.id, direction);
                        focusBacklogTask(task.id);
                      }}
                      canMoveUp={index > 0 || groupIndex > 0}
                      canMoveDown={
                        index < group.tasks.length - 1 ||
                        groupIndex < props.groups.length - 1
                      }
                      onUpdate={(change) =>
                        props.updateTask(group.id, task.id, change)
                      }
                      onTake={() => {
                        selectAfterRemoval(task.id);
                        props.takeTask(group.id, task.id);
                      }}
                      onDiscard={() => {
                        selectAfterRemoval(task.id);
                        props.discardTask(group.id, task.id);
                      }}
                    />
                  ))}
                </SortableItems>
              </SortableDropZone>
            </section>
          ))}
          <Button
            className="backlog-add-group-bottom"
            variant="outline"
            onClick={addGroup}
          >
            <Plus /> Добавить группу
          </Button>
        </div>
      </SortableRoot>
    </div>
  );
}

function BacklogTaskRow({
  task,
  selected,
  editing,
  onSelect,
  onEdit,
  onStopEditing,
  onNavigate,
  onMove,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onTake,
  onDiscard,
}: {
  task: Task;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onStopEditing: (refocus?: boolean) => void;
  onNavigate: (direction: -1 | 1) => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (change: (task: Task) => Task) => void;
  onTake: () => void;
  onDiscard: () => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  function handleShortcut(event: React.KeyboardEvent<HTMLElement>) {
    return backlogShortcut(event, {
      edit: onEdit,
      navigate: onNavigate,
      move: onMove,
      take: onTake,
      discard: onDiscard,
    });
  }

  return (
    <article
      ref={setNodeRef}
      id={`backlog-task-${task.id}`}
      data-task-card
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`backlog-task ${task.color ? `task-color-${task.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`}
      onFocusCapture={onSelect}
      onPointerDownCapture={(event) => {
        onSelect();
        if (!(event.target as HTMLElement).closest('button, input, textarea')) {
          const card = event.currentTarget;
          requestAnimationFrame(() =>
            card.querySelector<HTMLElement>('[data-task-focus]')?.focus(),
          );
        }
      }}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        onKeyDown={(event) => {
          if (!handleShortcut(event)) listeners?.onKeyDown?.(event);
        }}
        aria-label="Перетащить дело"
      >
        <GripVertical />
      </button>
      {editing ? (
        <TaskTextEditor
          text={task.text}
          ariaLabel="Название дела"
          onDone={onStopEditing}
          onDiscard={onDiscard}
          onShortcut={handleShortcut}
          onChange={(text) =>
            onUpdate((current) => ({
              ...current,
              text,
            }))
          }
        />
      ) : (
        <button
          data-task-focus
          className="backlog-task-text"
          onClick={onSelect}
          onDoubleClick={onEdit}
          onKeyDown={handleShortcut}
        >
          <TaskTextPreview
            text={task.text}
            revealDescription={selected || task.intervals.length > 0}
          />
        </button>
      )}
      <Button
        className="backlog-take"
        variant="outline"
        title="Перенести в Сегодня · ⌘↵"
        onClick={onTake}
        onKeyDown={handleShortcut}
      >
        <ArrowUpToLine /> В Сегодня
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="more-button"
          onKeyDown={handleShortcut}
          render={<button type="button" aria-label="Действия с делом" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="task-menu" align="end">
          <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}>
            Переместить вверх
            <DropdownMenuShortcut>⌘↑</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}>
            Переместить вниз
            <DropdownMenuShortcut>⌘↓</DropdownMenuShortcut>
          </DropdownMenuItem>
          <TaskColorMenu
            color={task.color}
            onChange={(color) => onUpdate((current) => ({ ...current, color }))}
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDiscard}>
            Убрать<DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function FutureTaskRow({
  task,
  day,
  selected,
  editing,
  onSelect,
  onEdit,
  onStopEditing,
  onNavigate,
  onMove,
  canMoveUp,
  canMoveDown,
  onSetColor,
  onSendToBacklog,
  onActivate,
  onDiscard,
  updateTask,
}: ScheduleProps & {
  task: Task;
  day: string;
} & TaskInteractions) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  function handleShortcut(event: React.KeyboardEvent<HTMLElement>) {
    return selectedTaskShortcut(event, {
      edit: onEdit,
      navigate: onNavigate,
      activate: onActivate,
      discard: onDiscard,
      move: onMove,
    });
  }
  return (
    <article
      ref={setNodeRef}
      id={`task-${task.id}`}
      data-task-card
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`future-task ${task.color ? `task-color-${task.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`}
      onFocusCapture={onSelect}
      onPointerDownCapture={(event) => {
        onSelect();
        if (!(event.target as HTMLElement).closest('button, input, textarea')) {
          const card = event.currentTarget;
          requestAnimationFrame(() =>
            card.querySelector<HTMLElement>('[data-task-focus]')?.focus(),
          );
        }
      }}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        onKeyDown={(event) => {
          if (!handleShortcut(event)) listeners?.onKeyDown?.(event);
        }}
        aria-label="Перетащить дело"
      >
        <GripVertical />
      </button>
      {editing ? (
        <TaskTextEditor
          text={task.text}
          ariaLabel={`Дело на ${ruShortDate.format(new Date(`${day}T12:00:00`))}`}
          onDone={onStopEditing}
          onDiscard={onDiscard}
          onShortcut={handleShortcut}
          onChange={(text) =>
            updateTask(day, task.id, (current) => ({
              ...current,
              text,
            }))
          }
        />
      ) : (
        <button
          data-task-focus
          className="future-task-text"
          onClick={onSelect}
          onDoubleClick={onEdit}
          onKeyDown={handleShortcut}
        >
          <TaskTextPreview
            text={task.text}
            revealDescription={selected || task.intervals.length > 0}
          />
        </button>
      )}
      <Button
        className="future-take"
        variant="outline"
        title="Перенести в Сегодня · ⌘↵"
        aria-label="В работу сегодня"
        onClick={onActivate}
        onKeyDown={handleShortcut}
      >
        <ArrowUpToLine />
        <span>В работу</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="more-button"
          aria-label="Действия с делом"
          onKeyDown={handleShortcut}
          render={<button type="button" aria-label="Действия с делом" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="task-menu" align="end" sideOffset={8}>
          <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}>
            Переместить вверх
            <DropdownMenuShortcut>⌘↑</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}>
            Переместить вниз
            <DropdownMenuShortcut>⌘↓</DropdownMenuShortcut>
          </DropdownMenuItem>
          <TaskColorMenu color={task.color} onChange={onSetColor} />
          <DropdownMenuItem onClick={onSendToBacklog}>
            Перенести в Дела
          </DropdownMenuItem>
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
  now,
  updateTask,
  runTimer,
  selected,
  editing,
  onSelect,
  onEdit,
  onStopEditing,
  onNavigate,
  onMove,
  canMoveUp,
  canMoveDown,
  onToggleTimer,
  onSetColor,
  onSendToBacklog,
  onActivate,
  onDiscard,
}: ScheduleProps & {
  task: Task;
  day: string;
} & TaskInteractions) {
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

  function handleShortcut(event: React.KeyboardEvent<HTMLElement>) {
    return selectedTaskShortcut(event, {
      edit: onEdit,
      navigate: onNavigate,
      activate: onActivate,
      discard: onDiscard,
      move: onMove,
      toggleTimer: onToggleTimer,
    });
  }

  return (
    <article
      ref={setNodeRef}
      id={`task-${task.id}`}
      data-task-card
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`task-row ${task.color ? `task-color-${task.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${state === 'running' ? 'running' : ''} ${isDragging ? 'dragging' : ''}`}
      onFocusCapture={onSelect}
      onPointerDownCapture={(event) => {
        onSelect();
        if (!(event.target as HTMLElement).closest('button, input, textarea')) {
          const card = event.currentTarget;
          requestAnimationFrame(() =>
            card.querySelector<HTMLElement>('[data-task-focus]')?.focus(),
          );
        }
      }}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        onKeyDown={(event) => {
          if (!handleShortcut(event)) listeners?.onKeyDown?.(event);
        }}
        aria-label="Перетащить дело"
      >
        <GripVertical />
      </button>
      <div className="task-body">
        {editing ? (
          <TaskTextEditor
            text={task.text}
            ariaLabel="Название дела"
            onDone={onStopEditing}
            onDiscard={onDiscard}
            onShortcut={handleShortcut}
            onChange={(text) =>
              updateTask(day, task.id, (current) => ({
                ...current,
                text,
              }))
            }
          />
        ) : (
          <button
            data-task-focus
            className="task-text task-text-display"
            onClick={onSelect}
            onDoubleClick={onEdit}
            onKeyDown={handleShortcut}
          >
            <TaskTextPreview
              text={task.text}
              revealDescription={selected || state !== 'idle'}
            />
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
          onClick={() => {
            onSelect();
            runTimer(day, task.id);
          }}
        >
          <TimerIcon /> {timerLabel}
        </Button>
        <Button
          className="finish-button"
          size="icon"
          onKeyDown={handleShortcut}
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
            render={<button type="button" aria-label="Другие действия" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="task-menu" align="end" sideOffset={8}>
            <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}>
              Переместить вверх
              <DropdownMenuShortcut>⌘↑</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}>
              Переместить вниз
              <DropdownMenuShortcut>⌘↓</DropdownMenuShortcut>
            </DropdownMenuItem>
            <TaskColorMenu color={task.color} onChange={onSetColor} />
            <DropdownMenuItem onClick={onSendToBacklog}>
              Перенести в Дела
            </DropdownMenuItem>
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
