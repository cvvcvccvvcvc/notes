import { ChevronDown, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Rule } from '@/lib/data';
import { SortableItems } from '@/lib/sorting';

const sortableId = (id: string) => `rule:${id}`;

function focusRule(id: string, editor = false) {
  requestAnimationFrame(() =>
    document
      .getElementById(editor ? `rule-editor-${id}` : `rule-${id}`)
      ?.focus({ preventScroll: true }),
  );
}

export function RulesPanel({
  rules,
  addRule,
  updateRule,
  removeRule,
  moveRule,
}: {
  rules: Rule[];
  addRule: () => string;
  updateRule: (id: string, text: string) => void;
  removeRule: (id: string) => void;
  moveRule: (id: string, direction: -1 | 1) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    function clearSelection(event: PointerEvent) {
      if ((event.target as HTMLElement).closest('.rules-panel')) return;
      setSelectedId(null);
      setEditingId(null);
    }
    document.addEventListener('pointerdown', clearSelection);
    return () => document.removeEventListener('pointerdown', clearSelection);
  }, []);

  function selectRelative(id: string, direction: -1 | 1) {
    const index = rules.findIndex((rule) => rule.id === id);
    const target = rules[index + direction];
    if (!target) return;
    setSelectedId(target.id);
    setEditingId(null);
    focusRule(target.id);
  }

  function moveSelected(id: string, direction: -1 | 1) {
    const index = rules.findIndex((rule) => rule.id === id);
    if (index < 0 || index + direction < 0 || index + direction >= rules.length)
      return;
    moveRule(id, direction);
    setEditingId(null);
    focusRule(id);
  }

  function removeSelected(id: string) {
    const index = rules.findIndex((rule) => rule.id === id);
    const target = rules[index + 1] ?? rules[index - 1];
    removeRule(id);
    setSelectedId(target?.id ?? null);
    setEditingId(null);
    if (target) focusRule(target.id);
  }

  function edit(id: string) {
    setSelectedId(id);
    setEditingId(id);
    focusRule(id, true);
  }

  function stopEditing(id: string) {
    setEditingId(null);
    focusRule(id);
  }

  function handleShortcut(event: React.KeyboardEvent<HTMLElement>, id: string) {
    if (event.nativeEvent.isComposing || event.shiftKey || event.altKey) return;
    const remove =
      event.metaKey && (event.key === 'Backspace' || event.key === 'Delete');
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';

    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) removeSelected(id);
      return;
    }
    if (event.metaKey && vertical) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) moveSelected(id, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if ((event.target as HTMLElement).matches('input')) {
      if (!event.metaKey && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault();
        stopEditing(id);
      }
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    if (!vertical && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (vertical) selectRelative(id, event.key === 'ArrowUp' ? -1 : 1);
    else edit(id);
  }

  return (
    <aside
      className="rules-panel"
      aria-label="Правила"
      onPointerDownCapture={(event) => {
        if (!(event.target as HTMLElement).closest('[data-rule-card]')) {
          setSelectedId(null);
          setEditingId(null);
        }
      }}
    >
      <button
        type="button"
        className="rules-mobile-summary"
        aria-expanded={mobileExpanded}
        aria-controls="rules-mobile-content"
        onClick={() => {
          setMobileExpanded((expanded) => !expanded);
          setSelectedId(null);
          setEditingId(null);
        }}
      >
        <span>Правила</span>
        <small>{rules.length}</small>
        <ChevronDown />
      </button>
      <h2>Правила</h2>
      <div
        id="rules-mobile-content"
        className={`rules-content ${mobileExpanded ? 'mobile-expanded' : ''}`}
      >
        <SortableItems items={rules.map((rule) => sortableId(rule.id))}>
          <div className="rules-list">
            {rules.map((rule) => (
              <SortableRule
                key={rule.id}
                rule={rule}
                selected={selectedId === rule.id}
                editing={editingId === rule.id}
                onSelect={() => {
                  setSelectedId(rule.id);
                  setEditingId(null);
                }}
                onEdit={() => edit(rule.id)}
                onStopEditing={() => setEditingId(null)}
                onChange={(text) => updateRule(rule.id, text)}
                onKeyDown={(event) => handleShortcut(event, rule.id)}
              />
            ))}
          </div>
        </SortableItems>
        <button
          type="button"
          className="add-rule"
          onClick={() => {
            const id = addRule();
            setSelectedId(id);
            setEditingId(id);
            focusRule(id, true);
          }}
        >
          <Plus /> Добавить правило
        </button>
      </div>
    </aside>
  );
}

function SortableRule({
  rule,
  selected,
  editing,
  onSelect,
  onEdit,
  onStopEditing,
  onChange,
  onKeyDown,
}: {
  rule: Rule;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onStopEditing: () => void;
  onChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId(rule.id) });
  const className = `rule-card ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`;
  const style = { transform: CSS.Translate.toString(transform), transition };

  if (editing)
    return (
      <div
        ref={setNodeRef}
        id={`rule-${rule.id}`}
        data-rule-card
        className={className}
        style={style}
      >
        <input
          id={`rule-editor-${rule.id}`}
          value={rule.text}
          placeholder="Новое правило"
          aria-label="Текст правила"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onStopEditing}
          onKeyDown={onKeyDown}
        />
      </div>
    );

  return (
    <button
      type="button"
      ref={setNodeRef}
      id={`rule-${rule.id}`}
      data-rule-card
      className={className}
      style={style}
      {...attributes}
      {...listeners}
      onFocus={onSelect}
      onClick={onSelect}
      onDoubleClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <span className="rule-text">{rule.text || 'Новое правило'}</span>
    </button>
  );
}
