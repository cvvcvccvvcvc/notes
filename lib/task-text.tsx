import { useEffect, useRef } from 'react';

export function splitTaskText(text: string) {
  const lineBreak = text.indexOf('\n');
  if (lineBreak < 0) return { title: text, description: '' };
  return {
    title: text.slice(0, lineBreak),
    description: text.slice(lineBreak + 1),
  };
}

function joinTaskText(title: string, description: string) {
  return description ? `${title}\n${description}` : title;
}

function resize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = '0px';
  element.style.height = `${Math.max(42, element.scrollHeight)}px`;
}

export function TaskTextPreview({
  text,
  revealDescription,
}: {
  text: string;
  revealDescription: boolean;
}) {
  const { title, description } = splitTaskText(text);
  return (
    <div className="task-text-preview">
      <span className="task-title">{title || 'Без названия'}</span>
      {description &&
        (revealDescription ? (
          <span className="task-description">{description}</span>
        ) : (
          <span
            className="task-description-indicator"
            aria-label="Есть описание"
          >
            <i />
            <i />
          </span>
        ))}
    </div>
  );
}

export function TaskTextEditor({
  text,
  ariaLabel,
  onChange,
  onDone,
  onDiscard,
  onShortcut,
}: {
  text: string;
  ariaLabel: string;
  onChange: (text: string) => void;
  onDone: (refocus?: boolean) => void;
  onDiscard: () => void;
  onShortcut?: (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const { title, description } = splitTaskText(text);
  const initialTitleLength = useRef(title.length);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.setSelectionRange(
      initialTitleLength.current,
      initialTitleLength.current,
    );
    resize(descriptionRef.current);
  }, []);

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (event.nativeEvent.isComposing) return;
    if (
      event.metaKey &&
      (event.key === 'Backspace' || event.key === 'Delete')
    ) {
      event.preventDefault();
      event.stopPropagation();
      onDiscard();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onDone(true);
      return;
    }
    onShortcut?.(event);
  }

  return (
    <div
      className="task-editor-fields"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next))
          onDone(false);
      }}
    >
      <input
        ref={titleRef}
        className="task-title-editor"
        value={title}
        aria-label={ariaLabel}
        placeholder="Что сделать?"
        onChange={(event) =>
          onChange(joinTaskText(event.target.value, description))
        }
        onKeyDown={(event) => {
          handleKeyDown(event);
          if (
            !event.defaultPrevented &&
            event.key === 'Enter' &&
            !event.metaKey &&
            !event.altKey &&
            !event.shiftKey
          ) {
            event.preventDefault();
            descriptionRef.current?.focus();
          }
        }}
      />
      <textarea
        ref={descriptionRef}
        className="task-description-editor"
        value={description}
        rows={1}
        aria-label="Описание дела"
        placeholder="Описание"
        onInput={(event) => resize(event.currentTarget)}
        onChange={(event) => {
          resize(event.currentTarget);
          onChange(joinTaskText(title, event.target.value));
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
