import type { AppData, Note } from './data';

export function isEmptyNote(note: Note) {
  return (
    !note.title.trim() &&
    !note.content.trim() &&
    (note.attachments?.length ?? 0) === 0
  );
}

export function updateNote(
  data: AppData,
  id: string,
  change: (note: Note) => Note,
) {
  const index = data.notes.findIndex((note) => note.id === id);
  if (index < 0) return data;
  const note = change(data.notes[index]);
  if (note === data.notes[index]) return data;
  const notes = [...data.notes];
  notes[index] = note;
  return { ...data, notes };
}

export function prependNote(data: AppData, note: Note) {
  if (data.notes.some((candidate) => candidate.id === note.id)) return data;
  return { ...data, notes: [note, ...data.notes] };
}

export function removeNote(data: AppData, id: string) {
  if (!data.notes.some((note) => note.id === id)) return data;
  return { ...data, notes: data.notes.filter((note) => note.id !== id) };
}

export function restoreNote(data: AppData, note: Note, index: number) {
  if (data.notes.some((candidate) => candidate.id === note.id)) return data;
  const notes = [...data.notes];
  notes.splice(Math.min(index, notes.length), 0, note);
  return { ...data, notes };
}

export function moveNote(data: AppData, sourceId: string, targetId: string) {
  if (sourceId === targetId) return data;
  const from = data.notes.findIndex((note) => note.id === sourceId);
  const to = data.notes.findIndex((note) => note.id === targetId);
  if (from < 0 || to < 0) return data;
  const notes = [...data.notes];
  const [moved] = notes.splice(from, 1);
  notes.splice(to, 0, moved);
  return { ...data, notes };
}
