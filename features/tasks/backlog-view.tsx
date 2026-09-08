import { cardDragListeners, isCardSurface } from '@/lib/sorting';
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { MarkdownContent } from '@/components/markdown-content';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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

const PROJECT_DND_PREFIX = 'backlog-project:';
const projectDndId = (id: string) => `${PROJECT_DND_PREFIX}${id}`;

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
  addTask: (groupId: string) => string;
  renameGroup: (id: string, title: string) => void;
  setGroupContent: (id: string, content: string) => void;
  setGroupColor: (id: string, color?: TaskColor) => void;
  removeGroup: (id: string) => void;
  moveGroup: (id: string, direction: -1 | 1) => void;
  moveGroupTo: (sourceId: string, targetId: string) => void;
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

function focusBacklogGroup(id: string) {
  requestAnimationFrame(() => {
    const group = document.getElementById(`backlog-group-${id}`);
    group
      ?.querySelector<HTMLElement>('[data-project-select]')
      ?.focus({ preventScroll: true });
    group?.scrollIntoView({ block: 'nearest' });
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
  if ((event.target as HTMLElement).closest('[role="menu"]')) return false;
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingInfoKey, setEditingInfoKey] = useState<string | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const entries = props.groups.flatMap((group) =>
    group.tasks.map((task) => ({ groupId: group.id, id: task.id })),
  );
  const unsorted = props.groups.find((group) => group.id === UNSORTED_GROUP_ID);
  const projects = props.groups.filter(
    (group) => group.id !== UNSORTED_GROUP_ID,
  );
  const openGroup = props.groups.find((group) => group.id === openGroupId);

  function select(id: string) {
    setSelectedGroupId(null);
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
      targetId.startsWith('backlog-group:')
        ? sourceGroup === targetGroup
          ? props.groups.find((group) => group.id === targetGroup)?.tasks.at(-1)
              ?.id
          : undefined
        : targetId,
    );
    select(sourceId);
  }

  function dropItem(sourceId: string, targetId: string) {
    if (sourceId.startsWith(PROJECT_DND_PREFIX)) {
      if (!targetId.startsWith(PROJECT_DND_PREFIX)) return;
      props.moveGroupTo(
        sourceId.slice(PROJECT_DND_PREFIX.length),
        targetId.slice(PROJECT_DND_PREFIX.length),
      );
      return;
    }
    dropTask(sourceId, targetId);
  }

  function addGroup() {
    const id = props.addGroup();
    setSelectedGroupId(id);
    setEditingGroupKey(`card:${id}`);
  }

  function addTask(groupId: string) {
    const id = props.addTask(groupId);
    setSelectedGroupId(null);
    setSelectedId(id);
    setEditingId(id);
  }

  function moveGroup(id: string, direction: -1 | 1) {
    props.moveGroup(id, direction);
    setSelectedGroupId(id);
    focusBacklogGroup(id);
  }

  function openProject(id: string) {
    setSelectedGroupId(id);
    setSelectedId(null);
    setEditingId(null);
    setOpenGroupId(id);
  }

  function renderProject(
    group: TaskGroup,
    groupIndex: number,
    location: 'unsorted' | 'card' | 'dialog',
  ) {
    const locationKey = `${location}:${group.id}`;
    const titleEditing = editingGroupKey === locationKey;
    const infoEditing = editingInfoKey === locationKey;
    const contentVisible = location !== 'card' || openGroupId !== group.id;

    return (
      <>
        <header className="backlog-group-heading">
          <ProjectTitle
            id={`backlog-group-title-${location}-${group.id}`}
            title={group.title}
            readOnly={group.id === UNSORTED_GROUP_ID}
            editing={titleEditing}
            allowDoubleClick={location === 'dialog'}
            onStartEditing={() => {
              setSelectedGroupId(group.id);
              setEditingGroupKey(locationKey);
            }}
            onStopEditing={() => setEditingGroupKey(null)}
            onChange={(title) => props.renameGroup(group.id, title)}
          />
          {location === 'dialog' && (
            <button
              className="project-open"
              type="button"
              aria-label="Закрыть проект"
              onClick={() => setOpenGroupId(null)}
            >
              <X />
            </button>
          )}
          <ProjectMenu
            group={group}
            groupIndex={groupIndex}
            groupCount={props.groups.length}
            onMove={(direction) => moveGroup(group.id, direction)}
            onSetColor={(color) => props.setGroupColor(group.id, color)}
            onRemove={() => props.removeGroup(group.id)}
          />
        </header>
        {contentVisible && (
          <>
            <SortableDropZone
              id={`backlog-group:${group.id}`}
              className="backlog-list"
              kind="task-zone"
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
                      if (!task.text.trim()) {
                        selectAfterRemoval(task.id);
                        props.discardTask(group.id, task.id);
                        return;
                      }
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
            {location !== 'card' && (
              <Button
                className="project-add-task"
                variant="ghost"
                onClick={() => addTask(group.id)}
              >
                <Plus /> Новое дело
              </Button>
            )}
            {group.id !== UNSORTED_GROUP_ID && location === 'dialog' && (
              <ProjectInformation
                group={group}
                editing={infoEditing}
                editorId={`project-info-input-${location}-${group.id}`}
                onStartEditing={() => setEditingInfoKey(locationKey)}
                onStopEditing={() => setEditingInfoKey(null)}
                onChange={(content) => props.setGroupContent(group.id, content)}
              />
            )}
            {group.id !== UNSORTED_GROUP_ID &&
              location === 'card' &&
              group.content?.trim() && (
                <p className="project-info-preview">
                  {projectInfoPreview(group.content)}
                </p>
              )}
          </>
        )}
      </>
    );
  }

  return (
    <div
      className="backlog-page"
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-task-card]')) {
          setSelectedId(null);
          setEditingId(null);
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            active.closest('[data-task-card]')
          )
            active.blur();
        }
        if (!target.closest('[data-project-group]')) setSelectedGroupId(null);
      }}
    >
      <div className="page-heading backlog-heading">
        <h1>Проекты</h1>
      </div>
      <SortableRoot onDrop={dropItem}>
        {unsorted && (
          <section className="backlog-unsorted">
            {renderProject(
              unsorted,
              props.groups.findIndex((group) => group.id === unsorted.id),
              'unsorted',
            )}
          </section>
        )}
        <SortableItems
          items={projects.map((group) => projectDndId(group.id))}
          grid
        >
          <div className="backlog-groups">
            {projects.map((group) => (
              <SortableProject
                key={group.id}
                group={group}
                selected={selectedGroupId === group.id}
                onSelect={() => {
                  setSelectedGroupId(group.id);
                  setSelectedId(null);
                  setEditingId(null);
                }}
                onOpen={() => openProject(group.id)}
                onEditTitle={() => {
                  setSelectedGroupId(group.id);
                  setEditingGroupKey(`card:${group.id}`);
                }}
                onAddTask={() => addTask(group.id)}
                onMove={(direction) => moveGroup(group.id, direction)}
              >
                {renderProject(
                  group,
                  props.groups.findIndex(
                    (candidate) => candidate.id === group.id,
                  ),
                  'card',
                )}
              </SortableProject>
            ))}
          </div>
        </SortableItems>
        <Button
          className="backlog-add-group-bottom"
          variant="outline"
          onClick={addGroup}
        >
          <Plus /> Добавить проект
        </Button>

        <Dialog
          open={Boolean(openGroup)}
          onOpenChange={(open) => {
            if (!open) setOpenGroupId(null);
          }}
        >
          {openGroup && (
            <DialogContent
              className={`project-dialog ${openGroup.color ? `group-color-${openGroup.color}` : ''}`}
              showCloseButton={false}
              finalFocus={() =>
                document
                  .getElementById(`backlog-group-${openGroup.id}`)
                  ?.querySelector<HTMLElement>('[data-project-select]') ?? null
              }
            >
              <DialogTitle className="sr-only">
                {openGroup.title || 'Проект'}
              </DialogTitle>
              {renderProject(
                openGroup,
                props.groups.findIndex(
                  (candidate) => candidate.id === openGroup.id,
                ),
                'dialog',
              )}
            </DialogContent>
          )}
        </Dialog>
      </SortableRoot>
    </div>
  );
}

function SortableProject({
  group,
  selected,
  onSelect,
  onOpen,
  onEditTitle,
  onAddTask,
  onMove,
  children,
}: {
  group: TaskGroup;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEditTitle: () => void;
  onAddTask: () => void;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: projectDndId(group.id),
    data: { kind: 'project' },
  });
  const draggedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  return (
    <section
      ref={setNodeRef}
      id={`backlog-group-${group.id}`}
      data-project-group
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`backlog-group ${group.color ? `group-color-${group.color}` : ''} ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <button
        type="button"
        className="project-select-surface"
        data-project-select
        {...attributes}
        {...listeners}
        aria-label={`Открыть или переместить проект ${group.title}`}
        aria-keyshortcuts="Enter Shift+Enter Meta+ArrowUp Meta+ArrowDown"
        onPointerDownCapture={(event) => {
          draggedRef.current = false;
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          const start = pointerStartRef.current;
          pointerStartRef.current = null;
          const moved =
            start !== null &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6;
          if (draggedRef.current || moved) {
            draggedRef.current = false;
            return;
          }
          onOpen();
        }}
        onFocus={onSelect}
        onKeyDown={(event) => {
          if (
            !event.nativeEvent.isComposing &&
            event.shiftKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key === 'Enter'
          ) {
            event.preventDefault();
            if (!event.repeat) onAddTask();
            return;
          }
          if (
            !event.nativeEvent.isComposing &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key === 'Enter'
          ) {
            event.preventDefault();
            if (!event.repeat) onEditTitle();
            return;
          }
          if (
            !event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          if (!event.repeat)
            onMove(
              event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1,
            );
        }}
      />
      {children}
    </section>
  );
}

function ProjectTitle({
  id,
  title,
  readOnly,
  editing,
  allowDoubleClick,
  onStartEditing,
  onStopEditing,
  onChange,
}: {
  id: string;
  title: string;
  readOnly: boolean;
  editing: boolean;
  allowDoubleClick: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onChange: (title: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  return (
    <input
      ref={inputRef}
      id={id}
      className="backlog-group-title"
      value={title}
      readOnly={readOnly || !editing}
      tabIndex={allowDoubleClick || editing ? 0 : -1}
      aria-label="Название проекта"
      data-editing={editing || undefined}
      onDoubleClick={() => {
        if (!readOnly && !editing && allowDoubleClick) onStartEditing();
      }}
      onBlur={onStopEditing}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (!readOnly && !editing && event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          onStartEditing();
          return;
        }
        if (!editing) return;
        event.stopPropagation();
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ProjectMenu({
  group,
  groupIndex,
  groupCount,
  onMove,
  onSetColor,
  onRemove,
}: {
  group: TaskGroup;
  groupIndex: number;
  groupCount: number;
  onMove: (direction: -1 | 1) => void;
  onSetColor: (color?: TaskColor) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="more-button project-menu-button"
        render={<button type="button" aria-label="Действия с проектом" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {group.id !== UNSORTED_GROUP_ID && (
          <>
            <DropdownMenuItem
              disabled={groupIndex <= 1}
              onClick={() => onMove(-1)}
            >
              Переместить раньше
              <DropdownMenuShortcut>⌘↑</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={groupIndex === groupCount - 1}
              onClick={() => onMove(1)}
            >
              Переместить позже
              <DropdownMenuShortcut>⌘↓</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <TaskColorMenu
          label="Цвет проекта"
          color={group.color}
          onChange={onSetColor}
        />
        {group.id !== UNSORTED_GROUP_ID && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              Удалить проект → Не разобрано
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectInformation({
  group,
  editing,
  editorId,
  onStartEditing,
  onStopEditing,
  onChange,
}: {
  group: TaskGroup;
  editing: boolean;
  editorId: string;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onChange: (content: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (!group.content?.trim() && !editing)
    return (
      <button
        className="project-info-empty"
        type="button"
        onClick={onStartEditing}
      >
        Добавить информацию
      </button>
    );

  if (!expanded && !editing)
    return (
      <button
        className="project-info-collapsed"
        type="button"
        onClick={() => setExpanded(true)}
      >
        <span>{projectInfoPreview(group.content ?? '')}</span>
        <strong>
          Показать <ChevronDown />
        </strong>
      </button>
    );

  return (
    <section className="project-info">
      <div className="project-info-card">
        {editing ? (
          <ProjectInfoEditor
            id={editorId}
            value={group.content ?? ''}
            ariaLabel={`Информация о проекте ${group.title}`}
            onBlur={onStopEditing}
            onChange={onChange}
          />
        ) : (
          <MarkdownContent>{group.content ?? ''}</MarkdownContent>
        )}
      </div>
      {!editing && (
        <div className="project-info-actions">
          <button type="button" onClick={onStartEditing}>
            <Pencil /> Редактировать
          </button>
          <button type="button" onClick={() => setExpanded(false)}>
            Скрыть <ChevronUp />
          </button>
        </div>
      )}
    </section>
  );
}

function projectInfoPreview(content: string) {
  const plain = content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)[#>*_`~-]+(?=\S)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? plain;
}

function ProjectInfoEditor({
  id,
  value,
  ariaLabel,
  onBlur,
  onChange,
}: {
  id: string;
  value: string;
  ariaLabel: string;
  onBlur: () => void;
  onChange: (content: string) => void;
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  return (
    <Textarea
      ref={editorRef}
      id={id}
      className="project-info-input"
      value={value}
      placeholder="Информация о проекте"
      aria-label={ariaLabel}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
      onChange={(event) => onChange(event.target.value)}
    />
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
  const hasName = Boolean(task.text.trim());
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      disabled: !hasName,
      data: { kind: 'task' },
    });

  function handleShortcut(event: React.KeyboardEvent<HTMLElement>) {
    return backlogShortcut(event, {
      edit: onEdit,
      navigate: onNavigate,
      move: hasName ? onMove : () => {},
      take: hasName ? onTake : () => {},
      discard: onDiscard,
    });
  }

  return (
    <article
      ref={setNodeRef}
      id={`backlog-task-${task.id}`}
      data-task-card
      {...cardDragListeners(listeners, editing)}
      onKeyDownCapture={handleShortcut}
      onDoubleClickCapture={(event) => {
        if (isCardSurface(event.target)) onEdit();
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`backlog-task ${task.color ? `task-color-${task.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`}
      onFocusCapture={onSelect}
      onPointerDownCapture={(event) => {
        onSelect();
        if (isCardSurface(event.target)) {
          const card = event.currentTarget;
          requestAnimationFrame(() =>
            card.querySelector<HTMLElement>('[data-task-focus]')?.focus(),
          );
        }
      }}
    >
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
        aria-label="Перенести в Сегодня"
        disabled={!hasName}
        onClick={onTake}
      >
        <ArrowUpToLine /> <span>В Сегодня</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="more-button"
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
