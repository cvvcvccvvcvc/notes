import { Plus } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { Task } from '@/lib/data';
import { hasTaskTitle } from '@/lib/task-text';

export function TaskInsert({
  adjacent,
  empty = false,
  id,
  mobileLabel,
  onInsert,
}: {
  adjacent: boolean;
  empty?: boolean;
  id?: string;
  mobileLabel: string;
  onInsert: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      data-task-insert
      className={`task-insert${adjacent ? ' adjacent' : ''}${empty ? ' empty' : ''}`}
      tabIndex={adjacent || empty ? 0 : -1}
      aria-hidden={!adjacent && !empty}
      aria-label={adjacent || empty ? mobileLabel : 'Добавить дело здесь'}
      onClick={onInsert}
    >
      <span className="task-insert-label">
        <Plus aria-hidden="true" />
        <span className="task-insert-desktop-label">Новое дело здесь</span>
        <span className="task-insert-mobile-label">{mobileLabel}</span>
      </span>
    </button>
  );
}

export function TaskInsertList({
  tasks,
  selectedId,
  enabled = true,
  emptyId,
  emptyLabel,
  onInsert,
  renderTask,
}: {
  tasks: Task[];
  selectedId: string | null;
  enabled?: boolean;
  emptyId?: string;
  emptyLabel: string;
  onInsert: (afterId: string | null) => void;
  renderTask: (task: Task, index: number) => ReactNode;
}) {
  const selected = tasks.find((task) => task.id === selectedId);
  const showAdjacent = selected && hasTaskTitle(selected.text);

  if (!enabled) return <>{tasks.map(renderTask)}</>;

  if (!tasks.length)
    return (
      <TaskInsert
        adjacent={false}
        empty
        id={emptyId}
        mobileLabel={emptyLabel}
        onInsert={() => onInsert(null)}
      />
    );

  return (
    <>
      {tasks.map((task, index) => {
        const previousId = tasks[index - 1]?.id ?? null;
        const adjacent =
          !!showAdjacent &&
          (selectedId === task.id || selectedId === previousId);
        return (
          <Fragment key={task.id}>
            <TaskInsert
              adjacent={adjacent}
              mobileLabel={
                selectedId === task.id ? 'Новое дело выше' : 'Новое дело ниже'
              }
              onInsert={() => onInsert(previousId)}
            />
            {renderTask(task, index)}
          </Fragment>
        );
      })}
      <TaskInsert
        adjacent={!!showAdjacent && selectedId === tasks.at(-1)?.id}
        mobileLabel="Новое дело ниже"
        onInsert={() => onInsert(tasks.at(-1)!.id)}
      />
    </>
  );
}
