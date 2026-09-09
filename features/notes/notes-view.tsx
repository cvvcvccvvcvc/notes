import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Note, NoteAttachment } from '@/lib/data';
import {
  copyNoteAttachmentToClipboard,
  loadNoteAttachment,
  savePastedNoteAttachment,
  synchronizeNoteAttachments,
} from '@/lib/note-attachments';
import { NoteEditor } from '@/lib/note-editor';
import { SortableList } from '@/lib/sorting';
import { NOTE_ATTACHMENT_MAX_COUNT } from '@/src/shared/data-schema';
import { Copy, ImageOff, Plus, Trash2, X } from 'lucide-react';

export function NotesView({
  notes,
  openNote,
  openNoteById,
  closeNote,
  deleteNote,
  updateNote,
  createNote,
  moveNote,
  undo,
  restoreUndo,
}: {
  notes: Note[];
  openNote: Note | null;
  openNoteById: (id: string) => void;
  closeNote: (id: string) => void;
  deleteNote: (id: string) => void;
  updateNote: (id: string, change: (note: Note) => Note) => void;
  createNote: () => void;
  moveNote: (sourceId: string, targetId: string) => void;
  undo: {
    message: string;
    visible: boolean;
    noteContentId?: string;
  } | null;
  restoreUndo: () => boolean;
}) {
  const noteContentRef = useRef<HTMLTextAreaElement>(null);
  const noteTitleRef = useRef<HTMLInputElement>(null);
  const [attachmentMessage, setAttachmentMessage] = useState<{
    noteId: string;
    text: string;
    error?: boolean;
  } | null>(null);
  const attachmentIds = notes
    .flatMap((note) => note.attachments ?? [])
    .map((attachment) => attachment.id)
    .join('\n');

  useEffect(() => {
    const ids = attachmentIds ? attachmentIds.split('\n') : [];
    const synchronize = () => void synchronizeNoteAttachments(ids);
    synchronize();
    window.addEventListener('online', synchronize);
    return () => window.removeEventListener('online', synchronize);
  }, [attachmentIds]);

  async function pasteImages(event: ClipboardEvent) {
    if (!openNote) return;
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (images.length === 0) return;
    event.preventDefault();

    const remaining =
      NOTE_ATTACHMENT_MAX_COUNT - (openNote.attachments?.length ?? 0);
    if (remaining <= 0) {
      setAttachmentMessage({
        noteId: openNote.id,
        text: 'В заметке уже 100 изображений',
        error: true,
      });
      return;
    }

    const results = await Promise.allSettled(
      images.slice(0, remaining).map(savePastedNoteAttachment),
    );
    const attachments = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (attachments.length > 0)
      updateNote(openNote.id, (note) => ({
        ...note,
        attachments: [...(note.attachments ?? []), ...attachments].slice(
          0,
          NOTE_ATTACHMENT_MAX_COUNT,
        ),
      }));

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    setAttachmentMessage({
      noteId: openNote.id,
      text: failure
        ? failure.reason instanceof Error
          ? failure.reason.message
          : 'Не удалось добавить изображение'
        : attachments.length === 1
          ? 'Изображение добавлено'
          : `Добавлено изображений: ${attachments.length}`,
      error: Boolean(failure),
    });
  }

  return (
    <section className="notes-page">
      <div className="page-heading">
        <h1>Заметки</h1>
        <Button
          className="add-primary"
          onClick={() => {
            setAttachmentMessage(null);
            createNote();
          }}
        >
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
                setAttachmentMessage(null);
                openNoteById(note.id);
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
            onPaste={pasteImages}
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
              <div className="note-dialog-controls">
                <button
                  className="note-delete"
                  aria-label="Удалить заметку"
                  title="Удалить заметку"
                  onClick={() => deleteNote(openNote.id)}
                >
                  <Trash2 />
                </button>
                <button
                  className="note-close"
                  aria-label="Закрыть заметку"
                  onClick={() => closeNote(openNote.id)}
                >
                  <X />
                </button>
              </div>
            </div>
            {(openNote.attachments?.length ?? 0) > 0 && (
              <div className="note-attachments">
                {openNote.attachments?.map((attachment) => (
                  <NoteImage
                    key={attachment.id}
                    attachment={attachment}
                    alt={openNote.title || 'Изображение из заметки'}
                    onCopied={(ok) =>
                      setAttachmentMessage({
                        noteId: openNote.id,
                        text: ok
                          ? 'Изображение скопировано'
                          : 'Не удалось скопировать изображение',
                        error: !ok,
                      })
                    }
                  />
                ))}
              </div>
            )}
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
              onChange={(content) =>
                updateNote(openNote.id, (note) => ({
                  ...note,
                  content,
                }))
              }
              recoverPreviousSession={
                undo?.noteContentId === openNote.id ? restoreUndo : undefined
              }
            />
            {attachmentMessage?.noteId === openNote.id && (
              <output
                className={`note-attachment-message ${attachmentMessage.error ? 'error' : ''}`}
              >
                {attachmentMessage.text}
              </output>
            )}
            {undo?.visible && (
              <div className="note-dialog-action">
                <output className="note-undo">
                  <span>{undo.message}</span>
                  <Button variant="ghost" onClick={restoreUndo}>
                    Отменить
                  </Button>
                </output>
              </div>
            )}
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
      {note.attachments?.[0] && (
        <NoteImage
          attachment={note.attachments[0]}
          alt={note.title || 'Изображение из заметки'}
          preview
        />
      )}
      <span className="note-card-body">
        <span className="note-card-title">{note.title}</span>
        <span className="note-card-content">{note.content}</span>
      </span>
    </button>
  );
}

/* oxlint-disable next/no-img-element -- note images use local Blob URLs */
function NoteImage({
  attachment,
  alt,
  preview = false,
  onCopied,
}: {
  attachment: NoteAttachment;
  alt: string;
  preview?: boolean;
  onCopied?: (ok: boolean) => void;
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const retryDelays = [1_000, 3_000, 10_000];
    let active = true;
    let objectUrl: string | null = null;
    let retryTimer: number | null = null;
    let retryIndex = 0;
    let attempt = 0;
    let loaded = false;

    const load = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      const currentAttempt = ++attempt;
      void loadNoteAttachment(attachment.id)
        .then((blob) => {
          if (!active || currentAttempt !== attempt) return;
          if (!blob) {
            setMissing(true);
            const delay = retryDelays[retryIndex++];
            if (delay !== undefined && navigator.onLine)
              retryTimer = window.setTimeout(load, delay);
            return;
          }
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob);
          loaded = true;
          setMissing(false);
          setImage({ blob, url: objectUrl });
        })
        .catch(() => {
          if (!active || currentAttempt !== attempt) return;
          setMissing(true);
          const delay = retryDelays[retryIndex++];
          if (delay !== undefined && navigator.onLine)
            retryTimer = window.setTimeout(load, delay);
        });
    };
    const retryWhenAvailable = () => {
      if (loaded) return;
      retryIndex = 0;
      load();
    };

    load();
    window.addEventListener('online', retryWhenAvailable);
    window.addEventListener('focus', retryWhenAvailable);
    return () => {
      active = false;
      attempt += 1;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener('online', retryWhenAvailable);
      window.removeEventListener('focus', retryWhenAvailable);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (missing)
    return preview ? null : (
      <div className="note-image-missing" aria-label="Изображение недоступно">
        <ImageOff />
      </div>
    );
  if (!image)
    return (
      <div
        className={`note-image-loading ${preview ? 'preview' : ''}`}
        aria-hidden="true"
      />
    );

  return (
    <figure className={`note-image ${preview ? 'preview' : ''}`}>
      <img src={image.url} alt={alt} draggable={false} />
      {onCopied && (
        <button
          type="button"
          className="note-image-copy"
          aria-label="Скопировать изображение"
          title="Скопировать изображение"
          onClick={() => {
            void copyNoteAttachmentToClipboard(image.blob).then(
              () => onCopied(true),
              () => onCopied(false),
            );
          }}
        >
          <Copy />
        </button>
      )}
    </figure>
  );
}
/* oxlint-enable next/no-img-element */
