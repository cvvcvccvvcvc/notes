'use client';

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ReactNode } from 'react';

/** Card controls and text editing never initiate a drag. */
export function isCardSurface(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !target.closest(
      'input, textarea, [contenteditable="true"], [data-no-drag], button:not([data-task-focus]), a, [role="menu"]',
    )
  );
}

export function cardDragListeners(
  listeners: ReturnType<typeof useSortable>['listeners'],
  editing: boolean,
) {
  return {
    onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
      if (!editing && isCardSurface(event.target))
        listeners?.onMouseDown?.(event);
    },
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
      if (!editing && isCardSurface(event.target))
        listeners?.onTouchStart?.(event);
    },
  };
}

const cardCollision: CollisionDetection = (args) => {
  const activeKind = args.active.data.current?.kind;
  const droppableContainers = activeKind
    ? args.droppableContainers.filter((container) => {
        const kind = container.data.current?.kind;
        if (activeKind === 'project') return kind === 'project';
        if (activeKind === 'task')
          return kind === 'task' || kind === 'task-zone';
        return true;
      })
    : args.droppableContainers;
  const scopedArgs = { ...args, droppableContainers };
  const hits = pointerWithin(scopedArgs);
  const cards = hits.filter(
    ({ id }) =>
      droppableContainers.find((container) => container.id === id)?.data.current
        ?.sortable,
  );
  if (cards.length) return cards;
  const zone = hits[0];
  if (!zone) return [];
  const outer = droppableContainers.find(
    (container) => container.id === zone.id,
  )?.node.current;
  const children = droppableContainers.filter(
    (container) =>
      !!container.data.current?.sortable &&
      !!outer &&
      !!container.node.current &&
      outer.contains(container.node.current),
  );
  const bottom = Math.max(
    ...children.map(
      (container) => args.droppableRects.get(container.id)?.bottom ?? -Infinity,
    ),
  );
  if (args.pointerCoordinates && args.pointerCoordinates.y > bottom)
    return [zone];
  return children.length
    ? closestCenter({ ...scopedArgs, droppableContainers: children })
    : hits;
};

function usePointerSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );
}

export function SortableRoot({
  onDrop,
  children,
}: {
  onDrop: (source: string, target: string) => void;
  children: ReactNode;
}) {
  const sensors = usePointerSensors();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cardCollision}
      accessibility={{
        announcements: {
          onDragStart: () => 'Запись поднята.',
          onDragOver: () => undefined,
          onDragEnd: () => 'Перемещение завершено.',
          onDragCancel: () => 'Перемещение отменено.',
        },
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id)
          onDrop(String(active.id), String(over.id));
      }}
    >
      {children}
    </DndContext>
  );
}

export function SortableItems({
  items,
  grid = false,
  children,
}: {
  items: string[];
  grid?: boolean;
  children: ReactNode;
}) {
  return (
    <SortableContext
      items={items}
      strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}
    >
      {children}
    </SortableContext>
  );
}

export function SortableDropZone({
  id,
  className,
  kind,
  children,
}: {
  id: string;
  className: string;
  kind?: string;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id,
    data: kind ? { kind } : undefined,
  });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

export function SortableList({
  items,
  grid = false,
  onMove,
  children,
}: {
  items: string[];
  grid?: boolean;
  onMove: (source: string, target: string) => void;
  children: ReactNode;
}) {
  return (
    <SortableRoot onDrop={onMove}>
      <SortableItems items={items} grid={grid}>
        {children}
      </SortableItems>
    </SortableRoot>
  );
}
