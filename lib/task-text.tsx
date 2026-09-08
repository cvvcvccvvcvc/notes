import { useEffect, useRef } from 'react';

function splitTaskText(text: string) {
  const lineBreak = text.indexOf('\n');
  if (lineBreak < 0) return { title: text, description: '' };
  return {
    title: text.slice(0, lineBreak),
    description: text.slice(lineBreak + 1),
  };
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
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const initialTitleLength = useRef(splitTaskText(text).title.length);
  useEffect(() => {
    const editor = editorRef.current;
    editor?.focus();
    editor?.setSelectionRange(
      initialTitleLength.current,
      initialTitleLength.current,
    );
    resize(editor);
  }, []);
  useEffect(() => resize(editorRef.current), [text]);
  return (
    <textarea
      ref={editorRef}
      className="task-editor-fields task-unified-editor"
      value={text}
      rows={1}
      aria-label={ariaLabel}
      placeholder="Что сделать?"
      onBlur={() => onDone(false)}
      onChange={(event) => {
        resize(event.currentTarget);
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDone(true);
          return;
        }
        if (event.metaKey && ['Backspace', 'Delete'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          onDiscard();
          return;
        }
        onShortcut?.(event);
      }}
    />
  );
}
