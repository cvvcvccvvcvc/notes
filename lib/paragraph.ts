export type TextRange = { start: number; end: number };

// A paragraph is a newline-delimited block, not a visually wrapped line.
export function paragraphRange(text: string, selection: TextRange): TextRange {
  const caret = Math.max(0, Math.min(selection.start, text.length));
  const last = Math.max(caret, Math.min(selection.end - 1, text.length));
  const start = caret === 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1;
  const nextBreak = text.indexOf('\n', last);
  return { start, end: nextBreak === -1 ? text.length : nextBreak };
}
