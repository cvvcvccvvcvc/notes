import { useState } from 'react';
import { MoreHorizontal, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TemplateSuggestion } from '@/lib/month-template';
import { shiftedDay } from '@/lib/date-time';

export function TemplateSuggestions({
  suggestions,
  today,
  onAccept,
  onSkip,
}: {
  suggestions: TemplateSuggestion[];
  today: string;
  onAccept: (ruleId: string, day: string, targetDay: string) => void;
  onSkip: (ruleId: string, day: string) => void;
}) {
  const [movingId, setMovingId] = useState<string | null>(null);
  const [targetDay, setTargetDay] = useState('');
  if (!suggestions.length) return null;

  return (
    <div className="template-suggestions">
      {suggestions.map(({ id, day, rule }) => (
        <div
          className={`template-suggestion ${rule.color ? `task-color-${rule.color}` : ''}`}
          key={id}
        >
          <span className="template-suggestion-text" title={rule.text}>
            <small>Из шаблона</small>
            <span>{rule.text}</span>
          </span>
          <button
            type="button"
            className="template-suggestion-add"
            aria-label={`Добавить из шаблона: ${rule.text}`}
            onClick={() => onAccept(rule.id, day, day)}
          >
            <Plus aria-hidden="true" /> Добавить
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="more-button"
              render={
                <button
                  type="button"
                  aria-label={`Действия с подсказкой: ${rule.text}`}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="task-menu" align="end">
              <DropdownMenuItem
                onClick={() => {
                  setTargetDay(shiftedDay(day, 1));
                  setMovingId(id);
                }}
              >
                Перенести на другую дату
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSkip(rule.id, day)}>
                {day === today
                  ? 'Пропустить сегодня'
                  : 'Пропустить в этот день'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {movingId === id && (
            <form
              className="template-suggestion-move"
              onSubmit={(event) => {
                event.preventDefault();
                if (targetDay < today) return;
                onAccept(rule.id, day, targetDay);
                setMovingId(null);
              }}
            >
              <label>
                На какую дату
                <input
                  type="date"
                  required
                  min={today}
                  value={targetDay}
                  onChange={(event) => setTargetDay(event.target.value)}
                />
              </label>
              <Button type="submit" variant="outline">
                Перенести
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Отменить перенос"
                onClick={() => setMovingId(null)}
              >
                <X />
              </Button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
