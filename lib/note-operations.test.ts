/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData, Note } from './data.ts';
import {
  addNoteTaskToSchedule,
  moveNote,
  prependNote,
  updateNote,
} from './note-operations.ts';

const first: Note = {
  id: 'first',
  title: 'Первая',
  content: '',
  color: 'white',
};
const second: Note = { ...first, id: 'second', title: 'Вторая' };

function data(): AppData {
  return {
    version: 3,
    schedule: {},
    backlog: [],
    monthPlanning: { rules: [], createdMonths: [] },
    notes: [first, second],
    history: [],
  };
}

void test('note updates and moves preserve unrelated notes', () => {
  const updated = updateNote(data(), 'second', (note) => ({
    ...note,
    content: 'Текст',
  }));
  const moved = moveNote(updated, 'second', 'first');

  assert.deepEqual(
    moved.notes.map(({ id }) => id),
    ['second', 'first'],
  );
  assert.equal(moved.notes[0].content, 'Текст');
  assert.equal(moved.notes[1], first);
});

void test('a new note is prepended once', () => {
  const note = { ...first, id: 'new' };
  const created = prependNote(data(), note);
  assert.equal(created.notes[0], note);
  assert.equal(prependNote(created, note), created);
});

void test('taking note text creates a linked task without changing the note', () => {
  const current = data();
  const result = addNoteTaskToSchedule(current, {
    today: '2026-09-05',
    taskId: 'task',
    noteId: 'first',
    text: '  Сделать вещь  ',
  });

  assert.equal(result.notes, current.notes);
  assert.deepEqual(result.schedule['2026-09-05'], [
    {
      id: 'task',
      text: 'Сделать вещь',
      intervals: [],
      source: { noteId: 'first', snapshot: 'Сделать вещь' },
    },
  ]);
});
