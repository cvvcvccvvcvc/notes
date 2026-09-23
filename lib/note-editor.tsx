import { lazy, Suspense } from 'react';

const MarkdownEditor = lazy(() =>
  import('@/components/markdown-editor').then((module) => ({
    default: module.MarkdownEditor,
  })),
);

export function NoteEditor({
  id,
  value,
  onChange,
  recoverPreviousSession,
  focusOnMount,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  recoverPreviousSession?: () => boolean;
  focusOnMount: boolean;
}) {
  return (
    <div className="note-content-shell">
      <Suspense fallback={<div className="note-editor-loading">Загрузка…</div>}>
        <MarkdownEditor
          id={`note-content-editor-${id}`}
          value={value}
          placeholder="Текст заметки"
          ariaLabel="Текст заметки"
          onChange={onChange}
          plainText
          recoverPreviousSession={recoverPreviousSession}
          focusOnMount={focusOnMount}
        />
      </Suspense>
    </div>
  );
}
