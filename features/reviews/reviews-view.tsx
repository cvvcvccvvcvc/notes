import { useState, type KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import type {
  AppData,
  Goal,
  PeriodReview,
  ReviewPeriod,
  ReviewPeriodKind,
  ReviewResult,
} from '@/lib/data';
import { dateKey, minutesLabel, ruDate, ruTime } from '@/lib/date-time';
import {
  currentReviewPeriod,
  dueReviewPeriods,
  goalsForPeriod,
  historyItemDay,
  historyItemsForPeriod,
  moveReviewPeriod,
  reviewForPeriod,
  reviewPeriodLabel,
  reviewPeriodRange,
  sourceReviewsForPeriod,
} from '@/lib/review-operations';
import {
  splitTaskText,
  TaskTextEditor,
  TaskTextPreview,
} from '@/lib/task-text';
import { cardDragListeners, isCardSurface, SortableList } from '@/lib/sorting';

type ReviewsViewProps = {
  data: AppData;
  now: number;
  startReview: (period: ReviewPeriod) => string;
  updateResult: (
    reviewId: string,
    resultId: string,
    change: (result: ReviewResult) => ReviewResult,
  ) => void;
  addResult: (reviewId: string, afterId?: string) => string;
  moveResult: (reviewId: string, sourceId: string, targetId: string) => void;
  removeResult: (reviewId: string, resultId: string) => void;
  completeReview: (reviewId: string) => void;
  addGoal: (period: ReviewPeriod, afterId?: string) => string;
  moveGoal: (sourceId: string, targetId: string) => void;
  updateGoal: (id: string, text: string) => void;
  removeGoal: (id: string) => void;
};

const kinds: ReviewPeriodKind[] = ['week', 'month', 'year'];
const kindTitles: Record<ReviewPeriodKind, string> = {
  week: 'Неделя',
  month: 'Месяц',
  year: 'Год',
};
const archiveTitles: Record<ReviewPeriodKind | 'day', string> = {
  day: 'Дни',
  week: 'Недели',
  month: 'Месяцы',
  year: 'Годы',
};

export function ReviewsView(props: ReviewsViewProps) {
  const { data, now } = props;
  const today = dateKey(new Date(now));
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [archiveKind, setArchiveKind] = useState<ReviewPeriodKind | 'day'>(
    'day',
  );
  const [goalPeriods, setGoalPeriods] = useState<
    Record<ReviewPeriodKind, ReviewPeriod>
  >(() => ({
    week: currentReviewPeriod('week', today),
    month: currentReviewPeriod('month', today),
    year: currentReviewPeriod('year', today),
  }));
  const selectedReview = (data.reviews ?? []).find(
    (review) => review.id === selectedReviewId,
  );

  if (selectedReview)
    return (
      <ReviewEditor
        {...props}
        review={selectedReview}
        close={() => setSelectedReviewId(null)}
      />
    );

  const due = dueReviewPeriods(data, today);
  return (
    <section className="reviews-page">
      <div className="page-heading">
        <div>
          <h1>Итоги</h1>
          <p className="reviews-intro">
            Дневная история остаётся фактом, а здесь из неё складывается
            главное.
          </p>
        </div>
      </div>

      <section className={`review-debt ${due.length ? 'has-debt' : ''}`}>
        <div className="review-debt-heading">
          <div className="review-debt-icon">
            <CalendarCheck />
          </div>
          <div>
            <h2>
              {due.length
                ? `Нужно подвести итоги · ${due.length}`
                : 'Итоги подведены'}
            </h2>
            <p>
              {due.length
                ? 'Пропущенные периоды сохраняются, пока вы их не завершите.'
                : 'Новых завершившихся периодов пока нет.'}
            </p>
          </div>
        </div>
        {due.length > 0 && (
          <div className="review-debt-list">
            {due.map((period) => {
              const existing = reviewForPeriod(data, period);
              return (
                <button
                  type="button"
                  className="review-debt-row"
                  key={`${period.kind}:${period.key}`}
                  onClick={() =>
                    setSelectedReviewId(
                      existing?.id ?? props.startReview(period),
                    )
                  }
                >
                  <span>
                    <strong>{kindTitles[period.kind]}</strong>
                    <small>{reviewPeriodLabel(period)}</small>
                  </span>
                  <span>{existing ? 'Продолжить' : 'Начать'}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="goals-section">
        <div className="reviews-section-heading">
          <div>
            <h2>Цели</h2>
            <p>Можно перейти к любому периоду и изменить простой список.</p>
          </div>
        </div>
        <div className="goal-period-grid">
          {kinds.map((kind) => {
            const period = goalPeriods[kind];
            return (
              <GoalPeriodEditor
                key={kind}
                data={data}
                period={period}
                title={kindTitles[kind]}
                addGoal={props.addGoal}
                moveGoal={props.moveGoal}
                updateGoal={props.updateGoal}
                removeGoal={props.removeGoal}
                move={(direction) =>
                  setGoalPeriods((current) => ({
                    ...current,
                    [kind]: moveReviewPeriod(current[kind], direction),
                  }))
                }
              />
            );
          })}
        </div>
      </section>

      <section className="reviews-archive">
        <div className="reviews-section-heading archive-heading">
          <h2>Архив</h2>
          <div
            className="review-tabs"
            role="tablist"
            aria-label="Период итогов"
          >
            {(['day', ...kinds] as const).map((kind) => (
              <button
                type="button"
                role="tab"
                aria-selected={archiveKind === kind}
                className={archiveKind === kind ? 'active' : ''}
                key={kind}
                onClick={() => setArchiveKind(kind)}
              >
                {archiveTitles[kind]}
              </button>
            ))}
          </div>
        </div>
        {archiveKind === 'day' ? (
          <DayArchive data={data} now={now} />
        ) : (
          <PeriodArchive
            data={data}
            kind={archiveKind}
            edit={(review) => setSelectedReviewId(review.id)}
          />
        )}
      </section>
    </section>
  );
}

function GoalPeriodEditor({
  data,
  period,
  title,
  move,
  addGoal,
  moveGoal,
  updateGoal,
  removeGoal,
}: {
  data: AppData;
  period: ReviewPeriod;
  title: string;
  move: (direction: -1 | 1) => void;
  addGoal: ReviewsViewProps['addGoal'];
  moveGoal: ReviewsViewProps['moveGoal'];
  updateGoal: ReviewsViewProps['updateGoal'];
  removeGoal: ReviewsViewProps['removeGoal'];
}) {
  return (
    <article className="goal-period-card">
      <div className="goal-period-heading">
        <div>
          <span>{title}</span>
          <strong>{reviewPeriodLabel(period)}</strong>
        </div>
        <div className="goal-period-arrows">
          <button
            type="button"
            aria-label={`Предыдущий период: ${title}`}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label={`Следующий период: ${title}`}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <GoalList
        goals={goalsForPeriod(data, period)}
        period={period}
        addGoal={addGoal}
        moveGoal={moveGoal}
        updateGoal={updateGoal}
        removeGoal={removeGoal}
      />
    </article>
  );
}

function GoalList({
  goals,
  period,
  addGoal,
  moveGoal,
  updateGoal,
  removeGoal,
}: {
  goals: Goal[];
  period: ReviewPeriod;
  addGoal: ReviewsViewProps['addGoal'];
  moveGoal: ReviewsViewProps['moveGoal'];
  updateGoal: ReviewsViewProps['updateGoal'];
  removeGoal: ReviewsViewProps['removeGoal'];
}) {
  return (
    <ReviewEditableList
      items={goals}
      itemLabel="Цель"
      addLabel="Добавить цель"
      onAdd={(afterId) => addGoal(period, afterId)}
      onUpdate={updateGoal}
      onRemove={removeGoal}
      onMove={moveGoal}
    />
  );
}

function focusReviewEntry(id: string) {
  requestAnimationFrame(() => {
    document
      .getElementById(`review-entry-${id}`)
      ?.querySelector<HTMLElement>('[data-task-focus]')
      ?.focus({ preventScroll: true });
  });
}

type EditableReviewItem = { id: string; text: string };
type ReviewEditableListProps = {
  items: EditableReviewItem[];
  itemLabel: string;
  addLabel: string;
  onAdd: (afterId?: string) => string;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onMove: (sourceId: string, targetId: string) => void;
};

function ReviewEditableList({
  items,
  itemLabel,
  addLabel,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: ReviewEditableListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function add(afterId?: string) {
    const id = onAdd(afterId);
    setSelectedId(id);
    setEditingId(id);
  }

  function select(id: string) {
    setSelectedId(id);
    setEditingId(null);
    focusReviewEntry(id);
  }

  function remove(id: string) {
    const index = items.findIndex((item) => item.id === id);
    const neighbor = items[index + 1] ?? items[index - 1];
    onRemove(id);
    setSelectedId(neighbor?.id ?? null);
    setEditingId(null);
    if (neighbor) focusReviewEntry(neighbor.id);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLElement>,
    item: EditableReviewItem,
    index: number,
  ) {
    if (
      event.nativeEvent.isComposing ||
      (event.target as HTMLElement).closest('[data-no-drag]')
    )
      return;
    const editing = event.target instanceof HTMLTextAreaElement;
    if (
      event.key === 'Enter' &&
      event.shiftKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) add(item.id);
      return;
    }
    if (event.shiftKey || event.altKey || event.ctrlKey) return;
    if (
      event.metaKey &&
      (event.key === 'Backspace' || event.key === 'Delete')
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) remove(item.id);
      return;
    }
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (vertical && event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      const target = items[index + direction];
      if (target && !event.repeat) onMove(item.id, target.id);
      if (!editing) focusReviewEntry(item.id);
      return;
    }
    if (editing || event.metaKey) return;
    if (vertical) {
      event.preventDefault();
      event.stopPropagation();
      const target = items[index + direction];
      if (target && !event.repeat) select(target.id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        setSelectedId(item.id);
        setEditingId(item.id);
      }
    }
  }

  return (
    <div className="review-editable-list">
      <SortableList items={items.map((item) => item.id)} onMove={onMove}>
        <div className="review-entry-list">
          {items.map((item, index) => (
            <ReviewEditableRow
              key={item.id}
              item={item}
              itemLabel={itemLabel}
              selected={selectedId === item.id}
              editing={editingId === item.id}
              onSelect={() => setSelectedId(item.id)}
              onEdit={() => {
                setSelectedId(item.id);
                setEditingId(item.id);
              }}
              onDone={(refocus = false) => {
                if (!item.text.trim()) remove(item.id);
                else {
                  setEditingId(null);
                  if (refocus) focusReviewEntry(item.id);
                }
              }}
              onUpdate={(text) => onUpdate(item.id, text)}
              onRemove={() => remove(item.id)}
              onKeyDown={(event) => handleKeyDown(event, item, index)}
            />
          ))}
        </div>
      </SortableList>
      <button
        type="button"
        className="review-text-action"
        onClick={() => add()}
      >
        <Plus /> {addLabel}
      </button>
    </div>
  );
}

function ReviewEditableRow({
  item,
  itemLabel,
  selected,
  editing,
  onSelect,
  onEdit,
  onDone,
  onUpdate,
  onRemove,
  onKeyDown,
}: {
  item: EditableReviewItem;
  itemLabel: string;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDone: (refocus?: boolean) => void;
  onUpdate: (text: string) => void;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: editing || !item.text.trim() });

  return (
    <article
      ref={setNodeRef}
      id={`review-entry-${item.id}`}
      data-task-card
      {...cardDragListeners(listeners, editing)}
      onKeyDownCapture={onKeyDown}
      onFocusCapture={onSelect}
      onPointerDownCapture={(event) => {
        if (!isCardSurface(event.target)) return;
        onSelect();
        const card = event.currentTarget;
        requestAnimationFrame(() =>
          card
            .querySelector<HTMLElement>('[data-task-focus]')
            ?.focus({ preventScroll: true }),
        );
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`review-entry${selected ? ' selected' : ''}${editing ? ' editing' : ''}${isDragging ? ' dragging' : ''}`}
    >
      {editing ? (
        <TaskTextEditor
          text={item.text}
          ariaLabel={itemLabel}
          placeholder=""
          onChange={onUpdate}
          onDone={onDone}
          onDiscard={onRemove}
        />
      ) : (
        <button
          type="button"
          data-task-focus
          className="review-entry-text"
          aria-label={
            item.text ? undefined : `Редактировать ${itemLabel.toLowerCase()}`
          }
          aria-keyshortcuts="Enter Shift+Enter Meta+ArrowUp Meta+ArrowDown Meta+Backspace"
          onClick={onEdit}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        data-no-drag
        className="review-entry-delete"
        aria-label={`Удалить ${itemLabel.toLowerCase()}`}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </article>
  );
}

function ReviewEditor({
  data,
  review,
  close,
  updateResult,
  addResult,
  moveResult,
  removeResult,
  completeReview,
  addGoal,
  moveGoal,
  updateGoal,
  removeGoal,
}: ReviewsViewProps & { review: PeriodReview; close: () => void }) {
  const nextPeriod = moveReviewPeriod(review.period, 1);
  const history = historyItemsForPeriod(data, review.period);
  const sourceReviews = sourceReviewsForPeriod(data, review.period);
  const weekDays =
    review.period.kind === 'week'
      ? Array.from({ length: 7 }, (_, offset) => {
          const date = new Date(`${review.period.key}T12:00:00`);
          date.setDate(date.getDate() + offset);
          const key = dateKey(date);
          return {
            key,
            date,
            items: history.filter((item) => historyItemDay(item) === key),
          };
        })
      : [];
  const writtenResults = review.results.filter((result) => result.included);
  const referenceTitle =
    review.period.kind === 'week'
      ? 'Сделано'
      : review.period.kind === 'month'
        ? 'Итоги недель'
        : 'Итоги месяцев';
  const nextTitle =
    review.period.kind === 'week'
      ? 'Следующая неделя'
      : review.period.kind === 'month'
        ? 'Следующий месяц'
        : 'Следующий год';

  return (
    <section className="review-editor">
      <header className="review-editor-heading">
        <button
          type="button"
          className="review-back"
          aria-label="Вернуться к итогам"
          onClick={close}
        >
          <ArrowLeft />
        </button>
        <h1>{reviewPeriodLabel(review.period)}</h1>
      </header>

      <section className="review-editor-section">
        <h2>{referenceTitle}</h2>
        <div className="review-reference">
          {weekDays
            .filter(({ items }) => items.length > 0)
            .map(({ key, date, items }) => (
              <details className="review-reference-period" key={key} open>
                <summary>
                  {ruDate.format(date)} <ChevronDown aria-hidden="true" />
                </summary>
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>{splitTaskText(item.text).title}</li>
                  ))}
                </ul>
              </details>
            ))}
          {sourceReviews.map((source) => {
            const results = source.results.filter(
              (result) => result.included && result.text.trim(),
            );
            return (
              <details className="review-reference-period" key={source.id} open>
                <summary>
                  {reviewPeriodLabel(source.period)}{' '}
                  <ChevronDown aria-hidden="true" />
                </summary>
                {results.length > 0 && (
                  <ul>
                    {results.map((result) => (
                      <li key={result.id}>{result.text}</li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
          {review.period.kind === 'week' && !history.length && (
            <p className="review-empty-copy">Нет завершённых дел.</p>
          )}
          {review.period.kind !== 'week' && !sourceReviews.length && (
            <p className="review-empty-copy">Нет завершённых итогов.</p>
          )}
        </div>
      </section>

      <section className="review-editor-section">
        <h2>Цели</h2>
        {review.goalSnapshot.length ? (
          <ul className="review-static-list">
            {review.goalSnapshot.map((goal, index) => (
              <li className="review-static-row" key={`${index}:${goal}`}>
                {goal}
              </li>
            ))}
          </ul>
        ) : (
          <p className="review-empty-copy">Целей не было.</p>
        )}
      </section>

      <section className="review-editor-section">
        <h2>Итоги</h2>
        <ReviewEditableList
          items={writtenResults}
          itemLabel="Итог"
          addLabel="Добавить итог"
          onAdd={(afterId) => addResult(review.id, afterId)}
          onUpdate={(id, text) =>
            updateResult(review.id, id, (current) => ({ ...current, text }))
          }
          onRemove={(id) => removeResult(review.id, id)}
          onMove={(sourceId, targetId) =>
            moveResult(review.id, sourceId, targetId)
          }
        />
      </section>

      <section className="review-editor-section">
        <div className="review-editor-section-heading">
          <h2>{nextTitle}</h2>
          <span>{reviewPeriodLabel(nextPeriod)}</span>
        </div>
        <GoalList
          goals={goalsForPeriod(data, nextPeriod)}
          period={nextPeriod}
          addGoal={addGoal}
          moveGoal={moveGoal}
          updateGoal={updateGoal}
          removeGoal={removeGoal}
        />
      </section>

      <footer className="review-editor-footer">
        <button
          type="button"
          className="review-complete"
          onClick={() => {
            completeReview(review.id);
            close();
          }}
        >
          {review.status === 'completed'
            ? 'Сохранить изменения'
            : 'Подвести итог'}
        </button>
      </footer>
    </section>
  );
}

function DayArchive({ data, now }: { data: AppData; now: number }) {
  const days = data.history.reduce<Record<string, AppData['history']>>(
    (groups, item) => {
      (groups[historyItemDay(item)] ??= []).push(item);
      return groups;
    },
    {},
  );
  const entries = Object.entries(days).sort(([left], [right]) =>
    right.localeCompare(left),
  );
  if (!entries.length)
    return <div className="empty-history">Пока ничего не завершено.</div>;

  return (
    <div className="history-days">
      {entries.map(([day, items]) => (
        <section className="history-day" key={day}>
          <h3>{ruDate.format(new Date(`${day}T12:00:00`))}</h3>
          <div className="history-list">
            {[...items]
              .sort((left, right) => left.finishedAt - right.finishedAt)
              .map((item) => {
                const total = item.intervals.reduce(
                  (sum, interval) =>
                    sum + ((interval.end ?? now) - interval.start),
                  0,
                );
                const first = item.intervals[0]?.start;
                const last = item.intervals.at(-1)?.end ?? item.finishedAt;
                return (
                  <article key={item.id}>
                    <Check />
                    <div className="history-task">
                      <TaskTextPreview text={item.text} revealDescription />
                      <p>
                        {first
                          ? `${ruTime.format(first)}–${ruTime.format(last)} · ${minutesLabel(total)}`
                          : `${ruTime.format(item.finishedAt)} · завершено`}
                      </p>
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function PeriodArchive({
  data,
  kind,
  edit,
}: {
  data: AppData;
  kind: ReviewPeriodKind;
  edit: (review: PeriodReview) => void;
}) {
  const reviews = (data.reviews ?? [])
    .filter(
      (review) => review.period.kind === kind && review.status === 'completed',
    )
    .sort((left, right) =>
      reviewPeriodRange(right.period).end.localeCompare(
        reviewPeriodRange(left.period).end,
      ),
    );
  if (!reviews.length)
    return <div className="empty-history">Пока нет подведённых итогов.</div>;

  return (
    <div className="period-review-list">
      {reviews.map((review) => {
        const results = review.results.filter(
          (result) => result.included && result.text.trim(),
        );
        return (
          <article className="period-review-card" key={review.id}>
            <header>
              <div>
                <span>{kindTitles[kind]}</span>
                <h3>{reviewPeriodLabel(review.period)}</h3>
              </div>
              <button type="button" onClick={() => edit(review)}>
                <Pencil /> Редактировать
              </button>
            </header>
            {review.goalSnapshot.length > 0 && (
              <div className="period-review-goals">
                <strong>Цели периода</strong>
                <ul>
                  {review.goalSnapshot.map((goal, index) => (
                    <li key={`${index}:${goal}`}>{goal}</li>
                  ))}
                </ul>
              </div>
            )}
            {results.length ? (
              <ul className="period-review-results">
                {results.map((result) => (
                  <li key={result.id}>{result.text}</li>
                ))}
              </ul>
            ) : (
              <p className="review-empty-copy">
                Значимых результатов не добавлено.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
