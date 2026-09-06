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
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string>();
  const hoursInput = useRef<HTMLInputElement>(null);
  const minutesInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const errorId = useId();
  const cancelBlur = useRef(false);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setHours(value?.slice(0, 2) ?? '');
      setMinutes(value?.slice(3, 5) ?? '');
      setEditing(true);
    }
  }
  useEffect(() => {
    if (editing) {
      hoursInput.current?.focus();
      hoursInput.current?.select();
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
    const empty = !hours && !minutes;
    const complete = hours.length === 2 && minutes.length === 2;
    const next = complete ? `${hours}:${minutes}` : undefined;
    const valid = next != null && Number(hours) <= 23 && Number(minutes) <= 59;
    const message = empty
      ? validate?.(undefined)
      : !complete
        ? 'Введите по две цифры часов и минут'
        : !valid
          ? 'Допустимое время — от 00:00 до 23:59'
          : validate?.(next);
    if (message) {
      setError(message);
      return;
    }
    if ((empty ? undefined : next) !== value)
      onChange(empty ? undefined : next);
    if (refocus) cancelBlur.current = true;
    close(refocus);
  }

  function digits(value: string) {
    return value.replace(/\D/g, '').slice(0, 2);
  }

  function edit() {
    cancelBlur.current = false;
    setHours(value?.slice(0, 2) ?? '');
    setMinutes(value?.slice(3, 5) ?? '');
    setEditing(true);
  }

  function focusMinutes() {
    minutesInput.current?.focus();
    minutesInput.current?.select();
  }

  function pasteHours(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 4);
    setHours(pasted.slice(0, 2));
    if (pasted.length > 2) setMinutes(pasted.slice(2, 4));
    setError(undefined);
    if (pasted.length >= 2) focusMinutes();
  }

  function pasteMinutes(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setMinutes(
      event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 2),
    );
    setError(undefined);
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (root.current?.contains(event.relatedTarget)) return;
    if (!cancelBlur.current) save(false);
    cancelBlur.current = false;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !/[0-9]/.test(event.key)
    ) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelBlur.current = true;
      close();
    }
  }
  return (
    <span
      ref={root}
      data-no-drag
      className={`inline-time ${className} ${value ? 'has-time' : ''}`}
    >
      {editing ? (
        <span aria-label={`${label}: время`} className="inline-time-fields">
          <input
            ref={hoursInput}
            type="text"
            inputMode="numeric"
            pattern="[0-9]{2}"
            maxLength={2}
            value={hours}
            aria-label={`${label}: часы`}
            placeholder="чч"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPaste={pasteHours}
            onChange={(event) => {
              const next = digits(event.target.value);
              setHours(next);
              setError(undefined);
              if (next.length === 2) focusMinutes();
            }}
          />
          <span aria-hidden="true">:</span>
          <input
            ref={minutesInput}
            type="text"
            inputMode="numeric"
            pattern="[0-9]{2}"
            maxLength={2}
            value={minutes}
            aria-label={`${label}: минуты`}
            placeholder="мм"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onBlur={handleBlur}
            onPaste={pasteMinutes}
            onChange={(event) => {
              setMinutes(digits(event.target.value));
              setError(undefined);
            }}
            onKeyDown={(event) => {
              handleKeyDown(event);
              if (event.key === 'Backspace' && !minutes)
                hoursInput.current?.focus();
            }}
          />
        </span>
      ) : (
        <button type="button" aria-label={label} title={label} onClick={edit}>
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
