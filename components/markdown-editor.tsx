import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { Annotation, EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  showTooltip,
  ViewPlugin,
  type DecorationSet,
  type Tooltip,
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
const BARE_URL = /https?:\/\/[^\s<>"']+/gi;

type EditorLink = { from: number; to: number; url: string };

function bareUrlText(value: string) {
  return value.replace(/[),.;!?]+$/, '');
}

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function parsedLinkAt(state: EditorState, position: number) {
  for (const side of [-1, 1] as const) {
    const resolved = syntaxTree(state).resolveInner(position, side);
    let node: typeof resolved | null = resolved;
    while (node) {
      if (node.name === 'Link' || node.name === 'Autolink') {
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (child.name !== 'URL') continue;
          const url = safeWebUrl(state.sliceDoc(child.from, child.to));
          if (url) return { from: node.from, to: node.to, url };
        }
      }
      node = node.parent;
    }
  }
  return null;
}

function bareLinkAt(state: EditorState, position: number) {
  const line = state.doc.lineAt(position);
  for (const match of line.text.matchAll(BARE_URL)) {
    const start = line.from + (match.index ?? 0);
    const text = bareUrlText(match[0]);
    const end = start + text.length;
    if (position < start || position > end) continue;
    const url = safeWebUrl(text);
    if (url) return { from: start, to: end, url };
  }
  return null;
}

function linkAt(state: EditorState): EditorLink | null {
  const selection = state.selection.main;
  if (!selection.empty) return null;
  return (
    parsedLinkAt(state, selection.head) ?? bareLinkAt(state, selection.head)
  );
}

function openLinkTooltip(link: EditorLink): Tooltip {
  return {
    pos: link.from,
    end: link.to,
    arrow: true,
    create() {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cm-link-tooltip';
      button.textContent = 'Открыть ссылку ↗';
      button.setAttribute('aria-label', 'Открыть ссылку в новой вкладке');
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(link.url, '_blank', 'noopener,noreferrer');
      });
      return { dom: button };
    },
  };
}

const selectedLinkTooltip = showTooltip.compute(
  ['doc', 'selection'],
  (state) => {
    const link = linkAt(state);
    return link ? openLinkTooltip(link) : null;
  },
);

function markdownDecorations(view: EditorView) {
  const activeLines = view.state.selection.ranges.map((range) => ({
    from: view.state.doc.lineAt(range.from).from,
    to: view.state.doc.lineAt(range.to).to,
  }));
  const ranges: Range<Decoration>[] = [];
  const parsedUrls: Array<{ from: number; to: number }> = [];

  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === 'URL')
        parsedUrls.push({ from: node.from, to: node.to });
      if (
        concealedNodes.has(node.name) &&
        !activeLines.some(
          (line) => node.from <= line.to && node.to >= line.from,
        )
      )
        ranges.push(Decoration.replace({}).range(node.from, node.to));
    },
  });

  for (const visible of view.visibleRanges) {
    const text = view.state.sliceDoc(visible.from, visible.to);
    for (const match of text.matchAll(BARE_URL)) {
      const from = visible.from + (match.index ?? 0);
      const to = from + bareUrlText(match[0]).length;
      if (
        from === to ||
        parsedUrls.some((url) => from < url.to && to > url.from)
      )
        continue;
      ranges.push(Decoration.mark({ class: 'cm-bare-link' }).range(from, to));
    }
  }

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
          selectedLinkTooltip,
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
