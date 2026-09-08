/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData, Note } from './data.ts';
import {
  isEmptyNote,
  moveNote,
  prependNote,
  removeNote,
  restoreNote,
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

void test('a note is empty only when its title and content are blank', () => {
  assert.equal(isEmptyNote({ ...first, title: '', content: '' }), true);
  assert.equal(isEmptyNote({ ...first, title: '  ', content: '\n' }), true);
  assert.equal(isEmptyNote({ ...first, title: '', content: 'Текст' }), false);
  assert.equal(
    isEmptyNote({ ...first, title: 'Название', content: '' }),
    false,
  );
});

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

void test('removing a note preserves unrelated notes', () => {
  const current = data();
  const removed = removeNote(current, 'first');

  assert.deepEqual(removed.notes, [second]);
  assert.deepEqual(restoreNote(removed, first, 0).notes, [first, second]);
  assert.equal(restoreNote(current, first, 0), current);
  assert.equal(removeNote(current, 'missing'), current);
});
