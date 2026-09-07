import { useState } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronLeft,
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
  moveReviewPeriod,
  reviewForPeriod,
  reviewPeriodLabel,
  reviewPeriodRange,
} from '@/lib/review-operations';
import { TaskTextPreview } from '@/lib/task-text';

type ReviewsViewProps = {
  data: AppData;
  now: number;
  startReview: (period: ReviewPeriod) => string;
  updateResult: (
    reviewId: string,
    resultId: string,
    change: (result: ReviewResult) => ReviewResult,
  ) => void;
  addResult: (reviewId: string) => string;
  removeResult: (reviewId: string, resultId: string) => void;
  completeReview: (reviewId: string) => void;
  addGoal: (period: ReviewPeriod) => string;
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
  updateGoal,
  removeGoal,
}: {
  data: AppData;
  period: ReviewPeriod;
  title: string;
  move: (direction: -1 | 1) => void;
  addGoal: ReviewsViewProps['addGoal'];
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
  updateGoal,
  removeGoal,
}: {
  goals: Goal[];
  period: ReviewPeriod;
  addGoal: ReviewsViewProps['addGoal'];
  updateGoal: ReviewsViewProps['updateGoal'];
  removeGoal: ReviewsViewProps['removeGoal'];
}) {
  function createGoal() {
    const id = addGoal(period);
    requestAnimationFrame(() => document.getElementById(`goal-${id}`)?.focus());
  }

  return (
    <div className="goal-list">
      {goals.length === 0 && <p className="goal-empty">Пока нет целей.</p>}
      {goals.map((goal, index) => (
        <div className="goal-row" key={goal.id}>
          <span>{index + 1}.</span>
          <textarea
            id={`goal-${goal.id}`}
            value={goal.text}
            rows={2}
            aria-label={`Цель ${index + 1}`}
            onChange={(event) => updateGoal(goal.id, event.target.value)}
          />
          <button
            type="button"
            aria-label="Удалить цель"
            onClick={() => removeGoal(goal.id)}
          >
            <Trash2 />
          </button>
        </div>
      ))}
      <button type="button" className="review-text-action" onClick={createGoal}>
        <Plus /> Добавить цель
      </button>
    </div>
  );
}

function ReviewEditor({
  data,
  review,
  close,
  updateResult,
  addResult,
  removeResult,
  completeReview,
  addGoal,
  updateGoal,
  removeGoal,
}: ReviewsViewProps & { review: PeriodReview; close: () => void }) {
  const nextPeriod = moveReviewPeriod(review.period, 1);
  const historyById = new Map(data.history.map((item) => [item.id, item]));
  const groups = new Map<string, ReviewResult[]>();
  for (const result of review.results) {
    const source = result.sourceHistoryItemId
      ? historyById.get(result.sourceHistoryItemId)
      : undefined;
    const key = source ? historyItemDay(source) : '';
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  const orderedGroups = [...groups].sort(([left], [right]) => {
    if (!left) return 1;
    if (!right) return -1;
    return left.localeCompare(right);
  });

  function createResult() {
    const id = addResult(review.id);
    requestAnimationFrame(() =>
      document.getElementById(`review-result-${id}`)?.focus(),
    );
  }

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
        <div>
          <p>{kindTitles[review.period.kind]}</p>
          <h1>{reviewPeriodLabel(review.period)}</h1>
        </div>
      </header>

      <section className="review-editor-section">
        <h2>На что был направлен период</h2>
        {review.goalSnapshot.length ? (
          <ol className="review-goal-snapshot">
            {review.goalSnapshot.map((goal, index) => (
              <li key={`${index}:${goal}`}>{goal}</li>
            ))}
          </ol>
        ) : (
          <p className="review-empty-copy">Целей на этот период не было.</p>
        )}
      </section>

      <section className="review-editor-section">
        <h2>Что получилось</h2>
        <p className="review-editor-note">
          Меняются только формулировки итога. Записи в истории дней останутся
          прежними.
        </p>
        {orderedGroups.length === 0 && (
          <p className="review-empty-copy">
            В истории этого периода нет завершённых дел.
          </p>
        )}
        {orderedGroups.map(([day, results]) => (
          <section className="review-result-group" key={day || 'manual'}>
            <h3>
              {day
                ? ruDate.format(new Date(`${day}T12:00:00`))
                : 'Добавлено вручную'}
            </h3>
            <div className="review-result-rows">
              {results.map((result) => (
                <div
                  className={`review-result-row ${result.included ? '' : 'excluded'}`}
                  key={result.id}
                >
                  <input
                    type="checkbox"
                    checked={result.included}
                    aria-label="Включить в итог"
                    onChange={(event) =>
                      updateResult(review.id, result.id, (current) => ({
                        ...current,
                        included: event.target.checked,
                      }))
                    }
                  />
                  <textarea
                    id={`review-result-${result.id}`}
                    rows={1}
                    value={result.text}
                    aria-label="Формулировка результата"
                    onChange={(event) =>
                      updateResult(review.id, result.id, (current) => ({
                        ...current,
                        text: event.target.value,
                      }))
                    }
                  />
                  {!result.sourceHistoryItemId && (
                    <button
                      type="button"
                      aria-label="Удалить добавленный результат"
                      onClick={() => removeResult(review.id, result.id)}
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        <button
          type="button"
          className="review-text-action"
          onClick={createResult}
        >
          <Plus /> Добавить результат, которого не было в делах
        </button>
      </section>

      <section className="review-editor-section">
        <h2>Цели на следующий период</h2>
        <p className="review-editor-note">{reviewPeriodLabel(nextPeriod)}</p>
        <GoalList
          goals={goalsForPeriod(data, nextPeriod)}
          period={nextPeriod}
          addGoal={addGoal}
          updateGoal={updateGoal}
          removeGoal={removeGoal}
        />
      </section>

      <footer className="review-editor-footer">
        <span>Черновик сохраняется автоматически</span>
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
            : 'Итоги подведены'}
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
