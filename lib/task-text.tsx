import { useLayoutEffect, useRef } from 'react';

export function splitTaskText(text: string) {
  const lineBreak = text.indexOf('\n');
  if (lineBreak < 0) return { title: text, description: '' };
  return {
    title: text.slice(0, lineBreak),
    description: text.slice(lineBreak + 1),
  };
}

export function hasTaskTitle(text: string) {
  return splitTaskText(text).title.trim().length > 0;
}

export function leadingTaskTime(text: string) {
  const match =
    /^([01]\d|2[0-3]):([0-5]\d)(?:[ \t]*[-–—][ \t]*|[ \t]+(?=\S))/.exec(text);
  return match
    ? {
        plannedStart: `${match[1]}:${match[2]}`,
        text: text.slice(match[0].length),
      }
    : null;
}

function resize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${Math.max(42, element.scrollHeight)}px`;
}

function editorCaretTop(editor: HTMLTextAreaElement) {
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  mirror.style.position = 'fixed';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.width = `${editor.offsetWidth}px`;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.border = style.border;
  mirror.style.padding = style.padding;
  mirror.style.font = style.font;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'anywhere';
  mirror.textContent = editor.value.slice(0, editor.selectionStart);
  const caret = document.createElement('span');
  caret.textContent = '\u200b';
  mirror.append(caret);
  document.body.append(mirror);
  const top =
    caret.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  mirror.remove();
  return (
    editor.getBoundingClientRect().top + window.scrollY + top - editor.scrollTop
  );
}

function revealEditorStart(editor: HTMLTextAreaElement) {
  if (document.activeElement !== editor) return;
  const viewport = window.visualViewport;
  const visibleTop = viewport?.pageTop ?? window.scrollY;
  const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
  const caretTop = editorCaretTop(editor);
  const margin = 24;
  const offset =
    caretTop > visibleBottom - margin
      ? caretTop - (visibleBottom - margin)
      : caretTop < visibleTop + margin
        ? caretTop - (visibleTop + margin)
        : 0;
  if (!offset) return;
  const dialogBody = editor.closest<HTMLElement>('.project-dialog-body');
  if (dialogBody) dialogBody.scrollTop += offset;
  else window.scrollBy(0, offset);
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
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    resize(editor);
    editor.setSelectionRange(
      initialTitleLength.current,
      initialTitleLength.current,
    );
    editor.focus({ preventScroll: true });
    let frame = requestAnimationFrame(() => revealEditorStart(editor));
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => revealEditorStart(editor));
    };
    window.visualViewport?.addEventListener('resize', reveal);
    const fallback = window.setTimeout(reveal, 350);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      window.visualViewport?.removeEventListener('resize', reveal);
    };
  }, []);
  useLayoutEffect(() => resize(editorRef.current), [text]);
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
