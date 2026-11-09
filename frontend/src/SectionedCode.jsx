import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tokenLines } from './lib/codeLines.js';
import { copyText } from './lib/clipboard.js';

const Line = ({ tokens }) => tokens.map(({ type, value }, index) => type === 'plain'
  ? <React.Fragment key={index}>{value}</React.Fragment>
  : <span className={`syntax-${type}`} key={index}>{value}</span>);

/**
 * Read-only code with copy sections (0-based inclusive line ranges). Each section is drawn as a
 * bordered block with a square "C" button that stays in its top-right corner while you scroll.
 * Every source line keeps one row, so the line-number gutter lines up.
 */
export default function SectionedCode({ text = '', ranges = [], filename = '' }) {
  const lines = useMemo(() => tokenLines(text, filename), [text, filename]);
  const [copied, setCopied] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(range) {
    const code = text.split('\n').slice(range.start, range.end + 1).join('\n');
    if (!code || !(await copyText(code))) return;
    setCopied(range.start);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  }

  const rows = [];
  let index = 0;
  const plain = (to) => { for (; index < to; index += 1) rows.push(<div className="snippet-line" key={index}><Line tokens={lines[index]} /></div>); };
  for (const range of ranges) {
    plain(range.start);
    const empty = lines.slice(range.start, range.end + 1).every((tokens) => !tokens.length);
    const inner = [];
    for (; index <= range.end; index += 1) inner.push(<div className="snippet-line" key={index}><Line tokens={lines[index]} /></div>);
    rows.push(<div className="snippet-section" key={`s${range.start}`}>
      <span className="snippet-copy-anchor"><button type="button" className={`snippet-copy-section${copied === range.start ? ' copied' : ''}`} disabled={empty}
        aria-label={empty ? 'Copy section (empty)' : `Copy section, lines ${range.start + 1} to ${range.end + 1}`} title={empty ? 'This section is empty' : 'Copy this section'}
        onClick={() => copy(range)}>{copied === range.start ? '✓' : 'C'}</button></span>
      {inner}
    </div>);
  }
  plain(lines.length);

  return <div className="snippet-document">
    <pre className="snippet-read-gutter" aria-hidden="true">{lines.map((_, row) => row + 1).join('\n')}</pre>
    <div className="snippet-code snippet-lines">{rows}</div>
  </div>;
}