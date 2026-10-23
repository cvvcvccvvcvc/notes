import { Plus, X } from 'lucide-react';

import type { TemplateSuggestion } from '@/lib/month-template';
import { TaskTextPreview } from '@/lib/task-text';

export function TemplateSuggestions({
  suggestions,
  onAccept,
  onSkip,
}: {
  suggestions: TemplateSuggestion[];
  onAccept: (ruleId: string, day: string, targetDay: string) => void;
  onSkip: (ruleId: string, day: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="template-suggestions">
      {suggestions.map(({ id, day, rule }) => (
        <div
          className={`task-row template-suggestion ${rule.color ? `task-color-${rule.color}` : ''}`}
          key={id}
        >
          <div className="task-text task-text-display" title={rule.text}>
            <TaskTextPreview text={rule.text} revealDescription={false} />
          </div>
          <button
            type="button"
            className="template-suggestion-action template-suggestion-add"
            aria-label={`Добавить дело: ${rule.text}`}
            title="Добавить дело"
            onClick={() => onAccept(rule.id, day, day)}
          >
            <Plus aria-hidden="true" />
          </button>
          <button
            type="button"
            className="template-suggestion-action template-suggestion-skip"
            aria-label={`Пропустить на этот день: ${rule.text}`}
            title="Пропустить на этот день"
            onClick={() => onSkip(rule.id, day)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
