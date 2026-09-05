import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function TimeDialog({
  kind,
  start,
  end,
  onSave,
  onClose,
}: {
  kind: 'task' | 'day';
  start?: string;
  end?: string;
  onSave: (start?: string, end?: string) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(start ?? '');
  const [to, setTo] = useState(end ?? '');
  const invalid = kind === 'day' && !!from && !!to && to <= from;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="time-dialog">
        <DialogTitle>
          {kind === 'day' ? 'Границы дня' : 'Плановое начало'}
        </DialogTitle>
        <p>
          {kind === 'day'
            ? 'Ориентиры только для сегодня. Можно оставить одну или обе границы пустыми.'
            : 'Опорная точка в расписании. Таймер запускается отдельно.'}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) {
              onSave(from || undefined, to || undefined);
              onClose();
            }
          }}
        >
          <label>
            {kind === 'day' ? 'Начало дня' : 'Время начала'}
            <input
              type="time"
              step="60"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          {kind === 'day' && (
            <label>
              Конец дня
              <input
                type="time"
                step="60"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'time-error' : undefined}
              />
            </label>
          )}
          {invalid && (
            <p id="time-error" role="alert">
              Конец должен быть позже начала в пределах этих суток.
            </p>
          )}
          <div className="time-dialog-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onSave(undefined, undefined);
                onClose();
              }}
            >
              Убрать время
            </Button>
            <Button type="submit" disabled={invalid}>
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
