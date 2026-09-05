import { Check } from 'lucide-react';

import type { AppData } from '@/lib/data';
import { dateKey, minutesLabel, ruDate, ruTime } from '@/lib/date-time';
import { TaskTextPreview } from '@/lib/task-text';

export function HistoryView({ data, now }: { data: AppData; now: number }) {
  const days = data.history.reduce<Record<string, AppData['history']>>(
    (groups, item) => {
      const day = dateKey(new Date(item.finishedAt));
      (groups[day] ??= []).push(item);
      return groups;
    },
    {},
  );

  return (
    <section className="history-page">
      <div className="page-heading">
        <h1>История</h1>
      </div>
      {data.history.length ? (
        <div className="history-days">
          {Object.entries(days).map(([day, items]) => (
            <section className="history-day" key={day}>
              <h2>{ruDate.format(new Date(`${day}T12:00:00`))}</h2>
              <div className="history-list">
                {[...items]
                  .sort((a, b) => a.finishedAt - b.finishedAt)
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
      ) : (
        <div className="empty-history">Пока ничего не завершено.</div>
      )}
    </section>
  );
}
