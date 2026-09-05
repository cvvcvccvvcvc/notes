import {
  ArrowUpToLine,
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
import { UNSORTED_GROUP_ID } from '@/lib/backlog';
import type { Task, TaskColor, TaskGroup } from '@/lib/data';
import { SortableDropZone, SortableItems, SortableRoot } from '@/lib/sorting';
import { TaskTextEditor, TaskTextPreview } from '@/lib/task-text';

function isTextEditor(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, [contenteditable="true"]') ||
      target.closest('[contenteditable="true"]') != null)
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

export function BacklogView(props: BacklogProps) {
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
