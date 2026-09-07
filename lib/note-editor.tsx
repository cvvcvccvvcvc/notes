import { useRef, type KeyboardEvent, type RefObject } from 'react';
import { Textarea } from '@/components/ui/textarea';

export function NoteEditor({
  editorRef,
  value,
  onChange,
  recoverPreviousSession,
}: {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  recoverPreviousSession?: () => boolean;
}) {
  const initialValueRef = useRef(value);
  const hasLocalChangesRef = useRef(false);
  const recoveryUsedRef = useRef(false);

  function handleUndo(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !recoverPreviousSession ||
      recoveryUsedRef.current ||
      hasLocalChangesRef.current ||
      event.shiftKey ||
      event.altKey ||
      (!event.metaKey && !event.ctrlKey) ||
      event.key.toLowerCase() !== 'z'
    )
      return;

    event.preventDefault();
    recoveryUsedRef.current = recoverPreviousSession();
  }

  return (
    <div className="note-content-shell">
      <Textarea
        ref={editorRef}
        className="note-content-input"
        value={value}
        placeholder="Текст заметки"
        aria-label="Текст заметки"
        onChange={(event) => {
          const nextValue = event.target.value;
          hasLocalChangesRef.current = nextValue !== initialValueRef.current;
          onChange(nextValue);
        }}
        onKeyDown={handleUndo}
      />
    </div>
  );
}
