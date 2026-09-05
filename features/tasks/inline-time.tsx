import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export function InlineTime({
  value,
  label,
  className = '',
  placeholder = '···',
  validate,
  onChange,
  open = false,
  onClose,
}: {
  value?: string;
  label: string;
  className?: string;
  placeholder?: string;
  validate?: (value?: string) => string | undefined;
  onChange: (value?: string) => void;
  open?: boolean;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const errorId = useId();
  const cancelBlur = useRef(false);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setDraft(value ?? '');
      setEditing(true);
    }
  }
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  function close(refocus = true) {
    const host = root.current;
    if (refocus)
      requestAnimationFrame(() => {
        const card = host?.closest('[data-task-card]');
        const target =
          card?.querySelector<HTMLElement>('[data-task-focus]') ??
          host?.querySelector<HTMLButtonElement>('button');
        target?.focus({ preventScroll: true });
      });
    setEditing(false);
    setError(undefined);
    onClose?.();
  }
  function save(refocus = true) {
    const raw = draft.trim();
    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw);
    const next = match
      ? `${match[1].padStart(2, '0')}:${match[2] ?? '00'}`
      : undefined;
    const message =
      raw && (!next || !/^([01]\d|2[0-3]):[0-5]\d$/.test(next))
        ? 'Введите время, например 17:30'
        : validate?.(next);
    if (message) {
      setError(message);
      return;
    }
    if (next !== value) onChange(next);
    close(refocus);
  }
  return (
    <span
      ref={root}
      data-no-drag
      className={`inline-time ${className} ${value ? 'has-time' : ''}`}
    >
      {editing ? (
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={label}
          placeholder="чч:мм"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onBlur={() => {
            if (!cancelBlur.current) save(false);
            cancelBlur.current = false;
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelBlur.current = true;
              close();
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => {
            cancelBlur.current = false;
            setDraft(value ?? '');
            setEditing(true);
          }}
        >
          {value ?? (placeholder === '+' ? <Plus /> : placeholder)}
        </button>
      )}
      {error && (
        <span id={errorId} className="inline-time-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
