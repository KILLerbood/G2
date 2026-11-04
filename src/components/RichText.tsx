import type { ReactNode } from 'react';
import { parseInline } from '../lib/rules';

/** Announcement / message text: **bold**, "- " lists, links and @mentions. Rendered as React nodes, never HTML. */
export function RichText({ text, mentions = [] }: { text: string; mentions?: string[] }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string, k: string) => parseInline(s, mentions).map((p, i) =>
    p.t === 'bold' ? <strong key={k + i}>{p.v}</strong>
      : p.t === 'link' ? <a key={k + i} href={p.v} target="_blank" rel="noopener noreferrer" className="ltr">{p.v}</a>
        : p.t === 'mention' ? <span key={k + i} className="mention">{p.v}</span>
          : <span key={k + i}>{p.v}</span>);
  const flush = (k: number) => { if (list.length) { out.push(<ul key={'u' + k}>{list.map((l, i) => <li key={i}>{inline(l, 'l' + k + '-' + i)}</li>)}</ul>); list = []; } };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-•]\s+(.*)$/);
    if (m) { list.push(m[1]); return; }
    flush(i);
    out.push(<span key={'p' + i}>{inline(line, 'p' + i)}{i < lines.length - 1 ? '\n' : ''}</span>);
  });
  flush(lines.length);
  return <>{out}</>;
}
