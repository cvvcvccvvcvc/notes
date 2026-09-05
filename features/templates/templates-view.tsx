import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type {
  MonthTemplateRule,
  MonthTemplateSchedule,
  TaskColor,
} from '@/lib/data';
import { defaultMonthTemplateSchedule } from '@/lib/month-template';

const weekdays = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

const months = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const scheduleKinds: Array<{
  value: MonthTemplateSchedule['kind'];
  label: string;
}> = [
  { value: 'weekly', label: 'каждую неделю' },
  { value: 'fortnightly', label: 'раз в две недели' },
  { value: 'annual', label: 'каждый год' },
];

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

type TemplatesViewProps = {
  rules: MonthTemplateRule[];
  today: Date;
  addRule: (kind: MonthTemplateSchedule['kind']) => void;
  updateRule: (
    id: string,
    change: (rule: MonthTemplateRule) => MonthTemplateRule,
  ) => void;
  removeRule: (id: string) => void;
  moveRule: (id: string, direction: -1 | 1) => void;
};

function scheduleLabel(schedule: MonthTemplateSchedule) {
  if (schedule.kind === 'weekly')
    return `${weekdays[schedule.weekday]}, каждую неделю`;
  if (schedule.kind === 'fortnightly')
    return `раз в две недели · ${schedule.anchorDay}`;
  return `${schedule.day} ${months[schedule.month - 1]}, каждый год`;
}

function focusRule(id: string, editor = false) {
  requestAnimationFrame(() =>
    document
      .getElementById(
        editor ? `template-rule-editor-${id}` : `template-rule-${id}`,
      )
      ?.focus({ preventScroll: true }),
  );
}

export function TemplatesView({
  rules,
  today,
  addRule,
  updateRule,
  removeRule,
  moveRule,
}: TemplatesViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const previousIds = useRef(new Set(rules.map((rule) => rule.id)));

  useEffect(() => {
    const added = rules.find((rule) => !previousIds.current.has(rule.id));
    previousIds.current = new Set(rules.map((rule) => rule.id));
    if (added) {
      setSelectedId(added.id);
      setEditingId(added.id);
      focusRule(added.id, true);
    } else if (selectedId && !rules.some((rule) => rule.id === selectedId)) {
      setSelectedId(null);
      setEditingId(null);
    }
  }, [rules, selectedId]);

  function selectRule(id: string) {
    setSelectedId(id);
    setEditingId((current) => (current === id ? current : null));
  }

  function editRule(id: string) {
    setSelectedId(id);
    setEditingId(id);
    focusRule(id, true);
  }

  function stopEditing(id: string) {
    setEditingId(null);
    focusRule(id);
  }

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

  function handleShortcut(
    event: React.KeyboardEvent<HTMLElement>,
    rule: MonthTemplateRule,
  ) {
    if (event.nativeEvent.isComposing) return;
    const formField = (event.target as HTMLElement).matches('input, select');
    const remove =
      event.metaKey && (event.key === 'Backspace' || event.key === 'Delete');

    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) removeSelected(rule.id);
      return;
    }
    if (formField) {
      if (
        editingId === rule.id &&
        !event.metaKey &&
        (event.key === 'Enter' || event.key === 'Escape')
      ) {
        event.preventDefault();
        stopEditing(rule.id);
      }
      return;
    }
    if (event.shiftKey || event.altKey || event.ctrlKey) return;

    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (!vertical && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;

    const direction = event.key === 'ArrowUp' ? -1 : 1;
    if (vertical && event.metaKey) moveSelected(rule.id, direction);
    else if (vertical) selectRelative(rule.id, direction);
    else if (!event.metaKey) editRule(rule.id);
  }

  return (
    <section
      className="templates-page"
      onPointerDownCapture={(event) => {
        if (!(event.target as HTMLElement).closest('.template-rule')) {
          setSelectedId(null);
          setEditingId(null);
        }
      }}
    >
      <div className="page-heading templates-heading">
        <div>
          <p className="eyebrow">Расписание</p>
          <h1>Шаблон месяцев</h1>
        </div>
      </div>
      <p className="templates-explanation">
        Записи из шаблона появляются при создании нового месяца. Созданные
        месяцы потом не переписываются.
      </p>

      <div className="template-rules">
        {rules.map((rule) => {
          const selected = selectedId === rule.id;
          const editing = editingId === rule.id;
          return (
            <article
              id={`template-rule-card-${rule.id}`}
              className={`template-rule ${selected ? 'selected' : ''} ${rule.color ? `template-color-${rule.color}` : ''}`}
              key={rule.id}
            >
              {editing ? (
                <div className="template-rule-main">
                  <input
                    id={`template-rule-editor-${rule.id}`}
                    className="template-rule-text-editor"
                    value={rule.text}
                    placeholder="Что добавить в расписание"
                    aria-label="Текст записи шаблона"
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(event) => handleShortcut(event, rule)}
                    onChange={(event) =>
                      updateRule(rule.id, (current) => ({
                        ...current,
                        text: event.target.value,
                      }))
                    }
                  />
                  <span className="template-rule-summary">
                    {scheduleLabel(rule.schedule)}
                  </span>
                </div>
              ) : (
                <button
                  id={`template-rule-${rule.id}`}
                  className="template-rule-main"
                  type="button"
                  aria-label={`${rule.text || 'Без названия'}. ${scheduleLabel(rule.schedule)}`}
                  onFocus={() => selectRule(rule.id)}
                  onClick={() => selectRule(rule.id)}
                  onDoubleClick={() => editRule(rule.id)}
                  onKeyDown={(event) => handleShortcut(event, rule)}
                >
                  <span className="template-rule-text">
                    {rule.text || 'Без названия'}
                  </span>
                  <span className="template-rule-summary">
                    {scheduleLabel(rule.schedule)}
                  </span>
                </button>
              )}

              {selected && (
                <div className="template-rule-controls">
                  <div className="template-rule-settings">
                    <select
                      value={rule.schedule.kind}
                      aria-label="Повтор"
                      onKeyDown={(event) => handleShortcut(event, rule)}
                      onChange={(event) =>
                        updateRule(rule.id, (current) => ({
                          ...current,
                          schedule: defaultMonthTemplateSchedule(
                            event.target.value as MonthTemplateSchedule['kind'],
                            today,
                          ),
                        }))
                      }
                    >
                      {scheduleKinds.map((kind) => (
                        <option value={kind.value} key={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </select>

                    {rule.schedule.kind === 'weekly' && (
                      <select
                        value={rule.schedule.weekday}
                        aria-label="День недели"
                        onKeyDown={(event) => handleShortcut(event, rule)}
                        onChange={(event) =>
                          updateRule(rule.id, (current) => ({
                            ...current,
                            schedule: {
                              kind: 'weekly',
                              weekday: Number(event.target.value),
                            },
                          }))
                        }
                      >
                        {weekdays.map((weekday, value) => (
                          <option value={value} key={weekday}>
                            {weekday}
                          </option>
                        ))}
                      </select>
                    )}

                    {rule.schedule.kind === 'fortnightly' && (
                      <label className="template-date-field">
                        <span>от</span>
                        <input
                          type="date"
                          value={rule.schedule.anchorDay}
                          aria-label="Опорная дата"
                          onKeyDown={(event) => handleShortcut(event, rule)}
                          onChange={(event) =>
                            updateRule(rule.id, (current) => ({
                              ...current,
                              schedule: {
                                kind: 'fortnightly',
                                anchorDay: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    )}

                    {rule.schedule.kind === 'annual' && (
                      <div className="template-annual-date">
                        <select
                          value={rule.schedule.day}
                          aria-label="День месяца"
                          onKeyDown={(event) => handleShortcut(event, rule)}
                          onChange={(event) =>
                            updateRule(rule.id, (current) => ({
                              ...current,
                              schedule: {
                                ...(current.schedule.kind === 'annual'
                                  ? current.schedule
                                  : { kind: 'annual', month: 1 }),
                                day: Number(event.target.value),
                              },
                            }))
                          }
                        >
                          {Array.from(
                            { length: 31 },
                            (_, index) => index + 1,
                          ).map((day) => (
                            <option value={day} key={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                        <select
                          value={rule.schedule.month}
                          aria-label="Месяц"
                          onKeyDown={(event) => handleShortcut(event, rule)}
                          onChange={(event) =>
                            updateRule(rule.id, (current) => ({
                              ...current,
                              schedule: {
                                ...(current.schedule.kind === 'annual'
                                  ? current.schedule
                                  : { kind: 'annual', day: 1 }),
                                month: Number(event.target.value),
                              },
                            }))
                          }
                        >
                          {months.map((month, index) => (
                            <option value={index + 1} key={month}>
                              {month}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="template-rule-tools">
                    <div className="template-color-picker" aria-label="Цвет">
                      {colors.map((color) => (
                        <button
                          key={color.className}
                          className={`template-color-dot ${color.className} ${rule.color === color.value ? 'selected' : ''}`}
                          onClick={() =>
                            updateRule(rule.id, (current) => ({
                              ...current,
                              color: color.value,
                            }))
                          }
                          aria-label={color.label}
                          title={color.label}
                          onKeyDown={(event) => handleShortcut(event, rule)}
                        />
                      ))}
                    </div>
                    <button
                      className="template-delete"
                      onClick={() => removeSelected(rule.id)}
                      aria-label="Удалить запись"
                      title="Удалить · ⌘Delete"
                      onKeyDown={(event) => handleShortcut(event, rule)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!rules.length && (
        <div className="templates-empty">
          Добавь постоянную запись — например, пару или день рождения.
        </div>
      )}

      <div className="template-add-actions">
        <Button variant="outline" onClick={() => addRule('weekly')}>
          <Plus /> Каждую неделю
        </Button>
        <Button variant="outline" onClick={() => addRule('fortnightly')}>
          <Plus /> Раз в две недели
        </Button>
        <Button variant="outline" onClick={() => addRule('annual')}>
          <Plus /> Ежегодная дата
        </Button>
      </div>
    </section>
  );
}
