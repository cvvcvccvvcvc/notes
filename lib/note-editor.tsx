import type { RefObject } from 'react';
import { Textarea } from '@/components/ui/textarea';

export function NoteEditor({
  editorRef,
  value,
  onChange,
}: {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="note-content-shell">
      <Textarea
        ref={editorRef}
        className="note-content-input"
        value={value}
        placeholder="Текст заметки"
        aria-label="Текст заметки"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
