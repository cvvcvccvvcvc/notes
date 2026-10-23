import assert from 'node:assert/strict';
import test from 'node:test';

import { noteLinkRanges, noteLinks } from './note-links';

void test('numbers, versions and email addresses are not web links', () => {
  assert.deepEqual(
    noteLinks(
      '3.0 1.25 v3.0 1.2.3 user@gmail.com @gmail.com first.last@sub.gmail.com',
    ),
    [],
  );
});

void test('recognizes web addresses, international domains and explicit local URLs', () => {
  const text =
    'example.com, https://example.org/a?q=3.0 www.example.net/path пример.рф https://localhost:8788 http://127.0.0.1:8788';
  const links = noteLinkRanges(text);
  assert.equal(links.length, 6);
  for (const link of links)
    assert.equal(text.slice(link.from, link.to), link.label);
  assert.equal(links[0].url, 'https://example.com/');
  assert.equal(links[3].url, 'https://xn--e1afmkfd.xn--p1ai/');
});

void test('deduplicates URLs and rejects malformed domain labels', () => {
  assert.equal(noteLinks('example.com https://example.com').length, 1);
  assert.deepEqual(noteLinks('-example.com example-.com'), []);
});
