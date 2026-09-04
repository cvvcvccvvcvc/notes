'use client';

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ReactNode } from 'react';

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
      collisionDetection={closestCenter}
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
  children,
}: {
  id: string;
  className: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'drop-over' : ''}`}
    >
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
