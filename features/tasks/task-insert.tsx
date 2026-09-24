import { Plus } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { Task } from '@/lib/data';
import { hasTaskTitle } from '@/lib/task-text';

export function TaskInsert({
  adjacent,
  edge = false,
  empty = false,
  id,
  mobileLabel,
  onInsert,
}: {
  adjacent: boolean;
  edge?: boolean;
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
      className={`task-insert${adjacent ? ' adjacent' : ''}${edge ? ' edge' : ''}${empty ? ' empty' : ''}`}
      tabIndex={adjacent || edge || empty ? 0 : -1}
      aria-hidden={!adjacent && !edge && !empty}
      aria-label={
        adjacent || edge || empty ? mobileLabel : 'Добавить дело здесь'
      }
      onPointerDown={(event) => event.preventDefault()}
      onClick={onInsert}
    >
      <span className="task-insert-label">
        <Plus aria-hidden="true" />
      </span>
      <span className="task-insert-edge-label" aria-hidden="true">
        <Plus />
      </span>
    </button>
  );
}

export function TaskInsertList({
  tasks,
  editingId,
  enabled = true,
  emptyId,
  emptyLabel,
  onInsert,
  renderTask,
}: {
  tasks: Task[];
  editingId: string | null;
  enabled?: boolean;
  emptyId?: string;
  emptyLabel: string;
  onInsert: (afterId: string | null) => void;
  renderTask: (task: Task, index: number) => ReactNode;
}) {
  const editingTask = tasks.find((task) => task.id === editingId);
  const showAdjacent = editingTask && hasTaskTitle(editingTask.text);

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
          !!showAdjacent && (editingId === task.id || editingId === previousId);
        return (
          <Fragment key={task.id}>
            <TaskInsert
              adjacent={adjacent}
              edge={index === 0 && hasTaskTitle(task.text)}
              mobileLabel={
                index === 0
                  ? 'Добавить дело в начало списка'
                  : editingId === task.id
                    ? 'Новое дело выше'
                    : 'Новое дело ниже'
              }
              onInsert={() => onInsert(previousId)}
            />
            {renderTask(task, index)}
          </Fragment>
        );
      })}
      <TaskInsert
        adjacent={!!showAdjacent && editingId === tasks.at(-1)?.id}
        edge={hasTaskTitle(tasks.at(-1)!.text)}
        mobileLabel="Добавить дело в конец списка"
        onInsert={() => onInsert(tasks.at(-1)!.id)}
      />
    </>
  );
}
