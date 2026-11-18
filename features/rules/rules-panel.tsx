import { ChevronDown, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Rule, TaskColor } from '@/lib/data';
import { SortableItems } from '@/lib/sorting';

const colors: Array<{
  value?: TaskColor;
  label: string;
  className: string;
}> = [
  { label: 'Без цвета', className: 'none' },
  { value: 'blue', label: 'Голубой', className: 'blue' },
  { value: 'yellow', label: 'Жёлтый', className: 'yellow' },
  { value: 'purple', label: 'Фиолетовый', className: 'purple' },
  { value: 'rose', label: 'Розовый', className: 'rose' },
];

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
  updateRule: (id: string, change: (rule: Rule) => Rule) => void;
  removeRule: (id: string) => void;
  moveRule: (id: string, direction: -1 | 1) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const summaryTouchY = useRef<number | null>(null);
  const suppressSummaryClick = useRef(false);

  useEffect(() => {
    function clearSelection(event: PointerEvent) {
      if ((event.target as HTMLElement).closest('.rules-panel')) return;
      if (
        editingId &&
        !rules.find((rule) => rule.id === editingId)?.text.trim()
      )
        removeRule(editingId);
      setSelectedId(null);
      setEditingId(null);
    }
    document.addEventListener('pointerdown', clearSelection);
    return () => document.removeEventListener('pointerdown', clearSelection);
  }, [editingId, rules, removeRule]);

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

  function stopEditing(id: string, refocus = true) {
    setEditingId(null);
    if (!rules.find((rule) => rule.id === id)?.text.trim()) {
      removeRule(id);
      setSelectedId(null);
    } else if (refocus) focusRule(id);
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
      className={`rules-panel ${mobileExpanded ? 'mobile-expanded' : ''}`}
      aria-label="Планы"
      onPointerDownCapture={(event) => {
        if (!(event.target as HTMLElement).closest('[data-rule-card]')) {
          if (editingId) stopEditing(editingId, false);
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
        onTouchStart={(event) => {
          summaryTouchY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(event) => {
          const start = summaryTouchY.current;
          summaryTouchY.current = null;
          if (start === null) return;
          const movement = event.changedTouches[0].clientY - start;
          if (Math.abs(movement) < 36) return;
          suppressSummaryClick.current = true;
          window.setTimeout(() => {
            suppressSummaryClick.current = false;
          }, 400);
          setMobileExpanded(movement > 0);
        }}
        onClick={() => {
          if (suppressSummaryClick.current) {
            suppressSummaryClick.current = false;
            return;
          }
          setMobileExpanded((expanded) => !expanded);
          setSelectedId(null);
          setEditingId(null);
        }}
      >
        <span>Планы</span>
        <ChevronDown />
      </button>
      {mobileExpanded && (
        <button
          type="button"
          className="rules-mobile-close"
          aria-label="Скрыть планы"
          onClick={() => setMobileExpanded(false)}
        >
          <X />
        </button>
      )}
      <h2>Планы</h2>
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
                onStopEditing={() => stopEditing(rule.id, false)}
                onRemove={() => removeSelected(rule.id)}
                onChange={(text) =>
                  updateRule(rule.id, (current) => ({ ...current, text }))
                }
                onSetColor={(color) =>
                  updateRule(rule.id, (current) => ({ ...current, color }))
                }
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
          <Plus /> Добавить план
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
  onRemove,
  onChange,
  onSetColor,
  onKeyDown,
}: {
  rule: Rule;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onStopEditing: () => void;
  onRemove: () => void;
  onChange: (text: string) => void;
  onSetColor: (color?: TaskColor) => void;
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
  const className = `rule-card ${rule.color ? `rule-color-${rule.color}` : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`;
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div ref={setNodeRef} data-rule-card className={className} style={style}>
      {editing ? (
        <input
          id={`rule-editor-${rule.id}`}
          value={rule.text}
          placeholder="Новый план"
          aria-label="Текст плана"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onStopEditing}
          onKeyDown={onKeyDown}
        />
      ) : (
        <button
          type="button"
          id={`rule-${rule.id}`}
          className="rule-select"
          {...attributes}
          {...listeners}
          onFocus={onSelect}
          onClick={onEdit}
          onKeyDown={onKeyDown}
        >
          <span className="rule-text">{rule.text || 'Новый план'}</span>
        </button>
      )}
      <button
        type="button"
        className="rule-delete"
        aria-label="Удалить план"
        title="Удалить план"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </button>
      {selected && (
        <fieldset className="rule-color-picker" aria-label="Цвет плана">
          {colors.map((color) => (
            <button
              key={color.className}
              type="button"
              className={`rule-color-dot ${color.className} ${rule.color === color.value ? 'selected' : ''}`}
              title={color.label}
              aria-label={color.label}
              aria-pressed={rule.color === color.value}
              onClick={() => onSetColor(color.value)}
            />
          ))}
        </fieldset>
      )}
    </div>
  );
}
