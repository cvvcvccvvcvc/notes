import {
  ArrowUpToLine,
  CalendarDays,
  Check,
  CirclePause,
  CirclePlay,
  Clock3,
  GripVertical,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TaskColorMenu } from '@/features/tasks/task-color-menu';
import type { AppData, Task, TaskColor } from '@/lib/data';
import {
  dateKey,
  minutesLabel,
  ruDate,
  ruMonth,
  ruShortDate,
  ruTime,
  shiftedDay,
} from '@/lib/date-time';
import { monthTemplateTaskCount, nextMonthKey } from '@/lib/month-template';
import { SortableDropZone, SortableItems, SortableRoot } from '@/lib/sorting';
import { TaskTextEditor, TaskTextPreview } from '@/lib/task-text';
import { taskDuration, taskState } from '@/lib/task-operations';

export function focusTask(day: string, id?: string) {
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

function recordCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return 'запись';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'записи';
  return 'записей';
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

export function ScheduleView(props: ScheduleProps) {
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
