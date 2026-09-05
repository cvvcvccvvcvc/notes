'use client';

import {
  CalendarDays,
  FileText,
  History,
  ListTodo,
  NotebookPen,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { HistoryView } from '@/features/history/history-view';
import { NotesView } from '@/features/notes/notes-view';
import { BacklogView } from '@/features/tasks/backlog-view';
import { focusTask, ScheduleView } from '@/features/tasks/schedule-view';
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
import { dateKey, shiftedDay } from '@/lib/date-time';
import { UNSORTED_GROUP_ID } from '@/lib/backlog';
import {
  appendMonthTemplateRule,
  createMonthFromTemplate,
  defaultMonthTemplateSchedule,
  moveMonthTemplateRule as moveMonthTemplateRuleInData,
  removeMonthTemplateRule as removeMonthTemplateRuleFromData,
  updateMonthTemplateRule as updateMonthTemplateRuleInData,
} from '@/lib/month-template';
import {
  addNoteTaskToSchedule,
  moveNote as moveNoteInData,
  prependNote,
  updateNote as updateNoteInData,
} from '@/lib/note-operations';
import { paragraphRange } from '@/lib/paragraph';
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

function isTextEditor(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, [contenteditable="true"]') ||
      target.closest('[contenteditable="true"]') != null)
  );
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
