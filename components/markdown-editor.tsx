import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { Annotation, EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

const externalChange = Annotation.define<boolean>();
const concealedNodes = new Set([
  'CodeMark',
  'EmphasisMark',
  'HeaderMark',
  'LinkMark',
  'StrikethroughMark',
  'URL',
]);

function markdownDecorations(view: EditorView) {
  const activeLines = view.state.selection.ranges.map((range) => ({
    from: view.state.doc.lineAt(range.from).from,
    to: view.state.doc.lineAt(range.to).to,
  }));
  const ranges: Range<Decoration>[] = [];

  syntaxTree(view.state).iterate({
    enter(node) {
      if (
        concealedNodes.has(node.name) &&
        !activeLines.some(
          (line) => node.from <= line.to && node.to >= line.from,
        )
      )
        ranges.push(Decoration.replace({}).range(node.from, node.to));
    },
  });

  return Decoration.set(ranges, true);
}

const concealInactiveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = markdownDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = markdownDecorations(update.view);
    }
  },
  { decorations: (value) => value.decorations },
);

export function MarkdownEditor({
  id,
  value,
  placeholder: placeholderText,
  ariaLabel,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(classHighlighter),
          concealInactiveMarkdown,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': ariaLabel,
            'aria-multiline': 'true',
            spellcheck: 'true',
          }),
          placeholder(placeholderText),
          EditorState.tabSize.of(4),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(externalChange),
              )
            )
              onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, placeholderText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalChange.of(true),
    });
  }, [value]);

  return <div ref={containerRef} id={id} className="markdown-editor" />;
}
