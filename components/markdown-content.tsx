import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="markdown-content">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </Markdown>
    </div>
  );
}
