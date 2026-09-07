import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Note } from '@/lib/data';
import { NoteEditor } from '@/lib/note-editor';
import type { TextRange } from '@/lib/paragraph';
import { SortableList } from '@/lib/sorting';
import { Plus, X } from 'lucide-react';

export function NotesView({
  notes,
  openNote,
  selectedText,
  selection,
  setOpenNoteId,
  closeNote,
  setSelection,
  updateNote,
  takeSelection,
  createNote,
  moveNote,
  undo,
  restoreUndo,
}: {
  notes: Note[];
  openNote: Note | null;
  selectedText: string;
  selection: TextRange;
  setOpenNoteId: (id: string | null) => void;
  closeNote: (id: string) => void;
  setSelection: (selection: { start: number; end: number }) => void;
  updateNote: (id: string, change: (note: Note) => Note) => void;
  takeSelection: (note: Note, cursor?: TextRange) => void;
  createNote: () => void;
  moveNote: (sourceId: string, targetId: string) => void;
  undo: { message: string } | null;
  restoreUndo: () => void;
}) {
  const noteContentRef = useRef<HTMLTextAreaElement>(null);
  const noteTitleRef = useRef<HTMLInputElement>(null);

  return (
    <section className="notes-page">
      <div className="page-heading">
        <h1>Заметки</h1>
        <Button className="add-primary" onClick={createNote}>
          <Plus /> Новая заметка
        </Button>
      </div>
      <SortableList items={notes.map((note) => note.id)} grid onMove={moveNote}>
        <div className="notes-grid">
          {notes.map((note) => (
            <SortableNote
              key={note.id}
              note={note}
              onOpen={() => {
                setSelection({ start: 0, end: 0 });
                setOpenNoteId(note.id);
              }}
            />
          ))}
        </div>
      </SortableList>

      <Dialog
        open={Boolean(openNote)}
        onOpenChange={(open) => {
          if (!open && openNote) closeNote(openNote.id);
        }}
      >
        {openNote && (
          <DialogContent
            className={`note-dialog ${openNote.color}`}
            showCloseButton={false}
            initialFocus={() =>
              !openNote.title && !openNote.content
                ? noteTitleRef.current
                : noteContentRef.current
            }
            finalFocus={() =>
              document.querySelector<HTMLButtonElement>(
                `[data-note-id="${openNote.id}"]`,
              )
            }
          >
            <DialogTitle className="sr-only">
              {openNote.title || 'Новая заметка'}
            </DialogTitle>
            <div className="note-dialog-toolbar">
              <div className="color-picker" aria-label="Цвет заметки">
                {(['teal', 'purple', 'white', 'red'] as const).map((color) => (
                  <button
                    key={color}
                    className={`color-dot ${color} ${openNote.color === color ? 'selected' : ''}`}
                    onClick={() =>
                      updateNote(openNote.id, (note) => ({ ...note, color }))
                    }
                    aria-label={`Выбрать цвет ${color}`}
                  />
                ))}
              </div>
              <button
                className="note-close"
                aria-label="Закрыть заметку"
                onClick={() => closeNote(openNote.id)}
              >
                <X />
              </button>
            </div>
            <input
              ref={noteTitleRef}
              className="note-title-input"
              value={openNote.title}
              placeholder="Название"
              aria-label="Название заметки"
              onChange={(event) =>
                updateNote(openNote.id, (note) => ({
                  ...note,
                  title: event.target.value,
                }))
              }
            />
            <NoteEditor
              editorRef={noteContentRef}
              value={openNote.content}
              selection={selection}
              onChange={(content) =>
                updateNote(openNote.id, (note) => ({
                  ...note,
                  content,
                }))
              }
              onSelection={setSelection}
              onTake={(cursor) => takeSelection(openNote, cursor)}
            />
            <div className="note-dialog-action">
              {undo && (
                <output className="note-undo">
                  <span>{undo.message}</span>
                  <Button variant="ghost" onClick={restoreUndo}>
                    Отменить
                  </Button>
                </output>
              )}
              <Button
                className="take-to-work-button"
                disabled={!selectedText}
                title={
                  selectedText
                    ? 'Взять абзац в работу · ⌘↵'
                    : 'Поставь курсор в нужный абзац'
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => takeSelection(openNote)}
              >
                <Plus /> Взять в работу <kbd>⌘↵</kbd>
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function SortableNote({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-note-id={note.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`note-card ${note.color} ${isDragging ? 'dragging' : ''}`}
      aria-label={
        note.title ? `Открыть заметку ${note.title}` : 'Открыть заметку'
      }
      onClick={onOpen}
    >
      <h2>{note.title}</h2>
      <p>{note.content}</p>
    </button>
  );
}
