'use client';

import { setDayWindow } from '@/lib/day-timeline';

import {
  CalendarDays,
  FileText,
  FolderKanban,
  History,
  NotebookPen,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ReviewsView } from '@/features/reviews/reviews-view';
import { NotesView } from '@/features/notes/notes-view';
import { BacklogView } from '@/features/tasks/backlog-view';
import { focusTask, ScheduleView } from '@/features/tasks/schedule-view';
import { TemplatesView } from '@/features/templates/templates-view';
import {
  type AppData,
  type MonthTemplateRule,
  type MonthTemplateSchedule,
  type Note,
  type ReviewPeriod,
  type ReviewResult,
  type Rule,
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
  isEmptyNote,
  moveNote as moveNoteInData,
  prependNote,
  removeNote as removeNoteFromData,
  restoreNote,
  updateNote as updateNoteInData,
} from '@/lib/note-operations';
import {
  appendRule,
  moveRule as moveRuleInData,
  moveRuleTo,
  removeRule as removeRuleFromData,
  restoreRule,
  updateRule as updateRuleInData,
} from '@/lib/rule-operations';
import {
  appendGoal,
  appendReviewResult,
  completePeriodReview,
  createPeriodReview,
  dueReviewPeriods,
  historyItemsForPeriod,
  removeGoal as removeGoalFromData,
  removeReviewResult as removeReviewResultFromData,
  reviewForPeriod,
  updateGoal as updateGoalInData,
  updateReviewResult as updateReviewResultInData,
} from '@/lib/review-operations';
import {
  appendBacklogTask,
  moveBacklogGroup as moveBacklogGroupInData,
  moveBacklogGroupTo as moveBacklogGroupToInData,
  moveBacklogTask as moveBacklogTaskInData,
  moveBacklogTaskVertically as moveBacklogTaskVerticallyInData,
  moveScheduledTask,
  moveScheduledTaskToDay,
  finishScheduledTask,
  removeBacklogTask as removeBacklogTaskFromData,
  removeBacklogGroup as removeBacklogGroupFromData,
  removeScheduledTask,
  restoreBacklogGroup,
  restoreScheduledTask,
  sendScheduledTaskToBacklog,
  takeBacklogTask as takeBacklogTaskFromData,
  takeFutureTask as takeFutureTaskFromData,
  toggleScheduledTaskTimer,
  updateBacklogTask as updateBacklogTaskInData,
  updateScheduledTask,
  updateScheduledTasks,
} from '@/lib/task-operations';
import { hasTaskTitle } from '@/lib/task-text';
import {
  useSyncedAppData,
  type LocalSaveState,
  type SyncState,
} from '@/hooks/use-synced-app-data';

type View = 'today' | 'backlog' | 'notes' | 'templates' | 'reviews';
const viewHashes = new Map<View, string>([
  ['today', ''],
  ['backlog', '#projects'],
  ['notes', '#notes'],
  ['templates', '#templates'],
  ['reviews', '#reviews'],
]);

type UndoState = {
  message: string;
  restore: (current: AppData) => AppData;
  visible: boolean;
  noteContentId?: string;
} | null;

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function viewFromHash(hash: string): View {
  for (const [view, viewHash] of viewHashes) {
    if (hash === viewHash) return view;
  }
  return 'today';
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
  const [view, setView] = useState<View>(() =>
    viewFromHash(window.location.hash),
  );
  const [now, setNow] = useState(() => Date.now());
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const noteEditSessionRef = useRef<{ initial: Note } | null>(null);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const todayKey = dateKey(new Date(now));
  const {
    data,
    dataRef,
    saveState,
    syncState,
    commit,
    retryLocalLoad,
    synchronize,
    resolveConflict,
  } = useSyncedAppData(todayKey);

  function navigate(nextView: View) {
    const nextHash = viewHashes.get(nextView) ?? '';
    if (window.location.hash !== nextHash) {
      const url = new URL(window.location.href);
      url.hash = nextHash;
      window.history.pushState(null, '', url);
    }
    setView(nextView);
  }

  useEffect(() => {
    const restoreView = () => setView(viewFromHash(window.location.hash));
    window.addEventListener('popstate', restoreView);
    window.addEventListener('hashchange', restoreView);
    return () => {
      window.removeEventListener('popstate', restoreView);
      window.removeEventListener('hashchange', restoreView);
    };
  }, []);

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
    const entryScript = document.querySelector<HTMLScriptElement>(
      'script[type="module"][src*="/assets/"]',
    )?.src;
    const build = entryScript
      ? new URL(entryScript).pathname.split('/').at(-1)
      : 'app';
    navigator.serviceWorker
      .register(
        `/service-worker.js?build=${encodeURIComponent(build ?? 'app')}`,
      )
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
    registerUndo(message, restore);
    commit(change);
  }

  function registerUndo(
    message: string,
    restore: (current: AppData) => AppData,
    noteContentId?: string,
  ) {
    setUndo({ message, restore, visible: true, noteContentId });
  }

  function restoreUndo() {
    if (!undo) return false;
    setUndo(null);
    commit(undo.restore);
    return true;
  }

  useEffect(() => {
    function handleUndo(event: KeyboardEvent) {
      if (
        !undo ||
        (!event.metaKey && !event.ctrlKey) ||
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
    if (!undo?.visible) return;
    const visibleUndo = undo;
    const timeout = window.setTimeout(
      () =>
        setUndo((current) =>
          current === visibleUndo ? { ...current, visible: false } : current,
        ),
      15_000,
    );
    return () => window.clearTimeout(timeout);
  }, [undo]);

  function updateTasks(day: string, change: (tasks: Task[]) => Task[]) {
    commit((current) => updateScheduledTasks(current, day, change));
  }

  function addTask(day: string, afterId?: string) {
    const id = uid();
    updateTasks(day, (tasks) => {
      const next = [...tasks];
      const index = afterId
        ? tasks.findIndex((task) => task.id === afterId)
        : -1;
      next.splice(index < 0 ? tasks.length : index + 1, 0, {
        id,
        text: '',
        intervals: [],
      });
      return next;
    });
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
    if (!hasTaskTitle(task.text)) {
      commit((current) => removeScheduledTask(current, day, id));
      return;
    }
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
      'Перенесено в проекты',
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
      { id, title: 'Новый проект', content: '', tasks: [] },
    ]);
    return id;
  }

  function addBacklogTask(groupId: string) {
    const id = uid();
    commit((current) =>
      appendBacklogTask(current, groupId, { id, text: '', intervals: [] }),
    );
    return id;
  }

  function renameBacklogGroup(id: string, title: string) {
    updateBacklog((groups) =>
      groups.map((group) => (group.id === id ? { ...group, title } : group)),
    );
  }

  function setBacklogGroupContent(id: string, content: string) {
    updateBacklog((groups) =>
      groups.map((group) => (group.id === id ? { ...group, content } : group)),
    );
  }

  function setBacklogGroupColor(id: string, color?: TaskColor) {
    updateBacklog((groups) =>
      groups.map((group) => (group.id === id ? { ...group, color } : group)),
    );
  }

  function removeBacklogGroup(id: string) {
    if (id === UNSORTED_GROUP_ID) return;
    const groups = dataRef.current?.backlog ?? [];
    const index = groups.findIndex((group) => group.id === id);
    const group = groups[index];
    if (!group) return;
    commitWithUndo(
      'Проект удалён',
      (current) => removeBacklogGroupFromData(current, id),
      (current) => restoreBacklogGroup(current, group, index),
    );
  }

  function moveBacklogGroup(id: string, direction: -1 | 1) {
    commit((current) => moveBacklogGroupInData(current, id, direction));
  }

  function moveBacklogGroupTo(sourceId: string, targetId: string) {
    commit((current) => moveBacklogGroupToInData(current, sourceId, targetId));
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
    if (!hasTaskTitle(task.text)) {
      commit((current) => removeBacklogTaskFromData(current, groupId, id));
      return;
    }
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
    const note: Note = { id, title: '', content: '', color: 'white' };
    commit((current) => prependNote(current, note));
    noteEditSessionRef.current = { initial: note };
    setOpenNoteId(id);
  }

  function openNoteById(id: string) {
    const note = dataRef.current?.notes.find(
      (candidate) => candidate.id === id,
    );
    if (!note) return;
    noteEditSessionRef.current = { initial: note };
    setOpenNoteId(id);
  }

  function closeNote(id: string) {
    const current = dataRef.current;
    const index = current?.notes.findIndex((note) => note.id === id) ?? -1;
    const note = index >= 0 ? current!.notes[index] : undefined;
    const session =
      noteEditSessionRef.current?.initial.id === id
        ? noteEditSessionRef.current
        : null;

    if (note && isEmptyNote(note)) {
      if (session && !isEmptyNote(session.initial)) {
        commitWithUndo(
          'Заметка удалена',
          (data) => removeNoteFromData(data, id),
          (data) => restoreNote(data, session.initial, index),
        );
      } else {
        commit((data) => removeNoteFromData(data, id));
      }
    } else if (note && session && note.content !== session.initial.content) {
      const previousContent = session.initial.content;
      const savedContent = note.content;
      registerUndo(
        'Изменение текста сохранено',
        (data) =>
          updateNoteInData(data, id, (currentNote) =>
            currentNote.content === savedContent
              ? { ...currentNote, content: previousContent }
              : currentNote,
          ),
        id,
      );
    }

    noteEditSessionRef.current = null;
    setOpenNoteId(null);
  }

  function deleteNote(id: string) {
    const current = dataRef.current;
    const index = current?.notes.findIndex((note) => note.id === id) ?? -1;
    if (!current || index < 0) return;
    const note = current.notes[index];
    noteEditSessionRef.current = null;
    commitWithUndo(
      'Заметка удалена',
      (data) => removeNoteFromData(data, id),
      (data) => restoreNote(data, note, index),
    );
    setOpenNoteId(null);
  }

  function moveNote(sourceId: string, targetId: string) {
    commit((current) => moveNoteInData(current, sourceId, targetId));
  }

  function createRule() {
    const id = uid();
    commit((current) => appendRule(current, { id, text: '' }));
    return id;
  }

  function updateRule(id: string, text: string) {
    commit((current) =>
      updateRuleInData(current, id, (rule) => ({ ...rule, text })),
    );
  }

  function moveRule(id: string, direction: -1 | 1) {
    commit((current) => moveRuleInData(current, id, direction));
  }

  function dropRule(sourceId: string, targetId: string) {
    commit((current) => moveRuleTo(current, sourceId, targetId));
  }

  function discardRule(id: string) {
    const rules = dataRef.current?.rules ?? [];
    const index = rules.findIndex((rule) => rule.id === id);
    const rule: Rule | undefined = rules[index];
    if (!rule) return;
    commitWithUndo(
      'Правило удалено',
      (current) => removeRuleFromData(current, id),
      (current) => restoreRule(current, rule, index),
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

  function startReview(period: ReviewPeriod) {
    const current = dataRef.current;
    const existing = current ? reviewForPeriod(current, period) : undefined;
    if (existing) return existing.id;
    const id = uid();
    const resultIds = current
      ? historyItemsForPeriod(current, period).map(() => uid())
      : [];
    commit((latest) =>
      createPeriodReview(latest, {
        id,
        period,
        createdAt: Date.now(),
        resultIds,
      }),
    );
    return id;
  }

  function updateReviewResult(
    reviewId: string,
    resultId: string,
    change: (result: ReviewResult) => ReviewResult,
  ) {
    commit((current) =>
      updateReviewResultInData(current, reviewId, resultId, change),
    );
  }

  function addReviewResult(reviewId: string) {
    const id = uid();
    commit((current) =>
      appendReviewResult(current, reviewId, {
        id,
        text: '',
        included: true,
      }),
    );
    return id;
  }

  function removeReviewResult(reviewId: string, resultId: string) {
    commit((current) =>
      removeReviewResultFromData(current, reviewId, resultId),
    );
  }

  function completeReview(reviewId: string) {
    commit((current) => completePeriodReview(current, reviewId, Date.now()));
  }

  function addGoal(period: ReviewPeriod) {
    const id = uid();
    commit((current) => appendGoal(current, { id, period, text: '' }));
    return id;
  }

  function updateGoal(id: string, text: string) {
    commit((current) =>
      updateGoalInData(current, id, (goal) => ({ ...goal, text })),
    );
  }

  function removeGoal(id: string) {
    commit((current) => removeGoalFromData(current, id));
  }

  if (!data)
    return saveState === 'error' ? (
      <main className="loading-screen">
        <div className="loading-error">
          <p>Не удалось открыть локальные записи.</p>
          <Button variant="outline" onClick={retryLocalLoad}>
            Повторить
          </Button>
        </div>
      </main>
    ) : (
      <main className="loading-screen">Открываю локальные записи…</main>
    );

  const openNote = data.notes.find((note) => note.id === openNoteId) ?? null;
  const reviewDebtCount = dueReviewPeriods(data, todayKey).length;

  const navigation = (
    <>
      <NavButton
        active={view === 'today'}
        icon={<NotebookPen />}
        onClick={() => navigate('today')}
      >
        Расписание
      </NavButton>
      <NavButton
        active={view === 'backlog'}
        icon={<FolderKanban />}
        onClick={() => navigate('backlog')}
      >
        Проекты
      </NavButton>
      <NavButton
        active={view === 'notes'}
        icon={<FileText />}
        onClick={() => navigate('notes')}
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
        <button className="brand" onClick={() => navigate('today')}>
          <span className="brand-full">notes</span>
          <span className="brand-compact">n</span>
        </button>
        <nav aria-label="Основная навигация">{navigation}</nav>
        <div className="sidebar-spacer" />
        <button
          className={`utility-button ${view === 'templates' ? 'active' : ''}`}
          onClick={() => navigate('templates')}
        >
          <CalendarDays />
          <span>Шаблоны</span>
        </button>
        <button
          className={`utility-button reviews-nav-button ${view === 'reviews' ? 'active' : ''} ${reviewDebtCount ? 'has-debt' : ''}`}
          onClick={() => navigate('reviews')}
        >
          <History />
          <span>Итоги</span>
          {reviewDebtCount > 0 && <strong>{reviewDebtCount}</strong>}
        </button>
        <button className="storage-status" onClick={openStorageStatus}>
          <span
            className={`status-dot ${storageProblem ? 'error' : ''} ${syncState === 'offline' ? 'offline' : ''}`}
          />
          <span>{storageLabel}</span>
        </button>
      </aside>

      <header className="mobile-header">
        <button className="brand" onClick={() => navigate('today')}>
          <span className="brand-full">notes</span>
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
            onClick={() => navigate('templates')}
            aria-label="Шаблоны месяцев"
          >
            <CalendarDays />
          </button>
          <button
            className={`${view === 'reviews' ? 'active' : ''} ${reviewDebtCount ? 'has-debt' : ''}`}
            onClick={() => navigate('reviews')}
            aria-label={`Итоги${reviewDebtCount ? `: ожидает ${reviewDebtCount}` : ''}`}
          >
            <History />
            {reviewDebtCount > 0 && <strong>{reviewDebtCount}</strong>}
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
            setDayWindow={(day, window) =>
              commit((current) => setDayWindow(current, day, window))
            }
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
            openTemplates={() => navigate('templates')}
            rules={data.rules ?? []}
            addRule={createRule}
            updateRule={updateRule}
            removeRule={discardRule}
            moveRule={moveRule}
            dropRule={dropRule}
          />
        )}
        {view === 'backlog' && (
          <BacklogView
            groups={data.backlog ?? []}
            addGroup={addBacklogGroup}
            addTask={addBacklogTask}
            renameGroup={renameBacklogGroup}
            setGroupContent={setBacklogGroupContent}
            setGroupColor={setBacklogGroupColor}
            removeGroup={removeBacklogGroup}
            moveGroup={moveBacklogGroup}
            moveGroupTo={moveBacklogGroupTo}
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
            openNoteById={openNoteById}
            closeNote={closeNote}
            deleteNote={deleteNote}
            updateNote={updateNote}
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
        {view === 'reviews' && (
          <ReviewsView
            data={data}
            now={now}
            startReview={startReview}
            updateResult={updateReviewResult}
            addResult={addReviewResult}
            removeResult={removeReviewResult}
            completeReview={completeReview}
            addGoal={addGoal}
            updateGoal={updateGoal}
            removeGoal={removeGoal}
          />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Основная навигация">
        {navigation}
      </nav>

      {undo?.visible && !(view === 'notes' && openNote) && (
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
