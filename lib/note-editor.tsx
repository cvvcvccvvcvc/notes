'use client';

import { useRef, type RefObject } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { paragraphRange, type TextRange } from './paragraph';

export function NoteEditor({
  editorRef,
  value,
  selection,
  onChange,
  onSelection,
  onTake,
}: {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  selection: TextRange;
  onChange: (value: string) => void;
  onSelection: (range: TextRange) => void;
  onTake: (range: TextRange) => void;
}) {
  const highlight = useRef<HTMLDivElement>(null);
  const range = paragraphRange(value, selection);
  const capture = (element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  });
  return (
    <div className="note-content-shell">
      <div
        ref={highlight}
        className="note-paragraph-highlight"
        aria-hidden="true"
      >
        {value.slice(0, range.start)}
        <mark>{value.slice(range.start, range.end)}</mark>
        {value.slice(range.end)}
        {'\u200b'}
      </div>
      <Textarea
        ref={editorRef}
        className="note-content-input"
        value={value}
        placeholder="Текст заметки"
        aria-label="Текст заметки"
        onChange={(event) => {
          onChange(event.target.value);
          onSelection(capture(event.currentTarget));
        }}
        onSelect={(event) => onSelection(capture(event.currentTarget))}
        onScroll={(event) => {
          if (highlight.current)
            highlight.current.scrollTop = event.currentTarget.scrollTop;
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.metaKey && event.key === 'Enter') {
            event.preventDefault();
            if (!event.repeat) onTake(capture(event.currentTarget));
          }
        }}
      />
    </div>
  );
}
