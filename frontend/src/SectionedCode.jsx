import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseCopySections } from './lib/editor.js';
import { tokenLines } from './lib/codeLines.js';
import { copyText } from './lib/clipboard.js';

const Line = ({ tokens }) => tokens.map(({ type, value }, index) => type === 'plain'
  ? <React.Fragment key={index}>{value}</React.Fragment>
  : <span className={`syntax-${type}`} key={index}>{value}</span>);

/**
 * Read-only code with <copy-sec> sections: the two tag rows are blank (they only show
 * the border lines) and a small "c" button stays in the section's top-right corner.
 * Every source line keeps one row, so the line-number gutter still lines up.
 */
export default function SectionedCode({ content = '', filename = '' }) {
  const lines = useMemo(() => tokenLines(content, filename), [content, filename]);
  const { sections } = useMemo(() => parseCopySections(content), [content]);
  const [copied, setCopied] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(section) {
    if (!section.code || !(await copyText(section.code))) return;
    setCopied(section.start);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  }

  const rows = [];
  let index = 0;
  for (const section of sections) {
    for (; index < section.start; index += 1) rows.push(<div className="snippet-line" key={index}><Line tokens={lines[index]} /></div>);
    const inner = [];
    for (let row = section.start; row <= section.end; row += 1) {
      const tag = row === section.start || row === section.end;
      inner.push(<div className={`snippet-line${tag ? ' snippet-tag-row' : ''}`} key={row}>{tag ? null : <Line tokens={lines[row]} />}</div>);
    }
    rows.push(<div className="snippet-section" key={`s${section.start}`}>
      <span className="snippet-copy-anchor"><button type="button" className={`snippet-copy-section${copied === section.start ? ' copied' : ''}`} disabled={!section.code}
        aria-label={section.code ? `Copy section, lines ${section.start + 2} to ${section.end}` : 'Copy section (empty)'} title={section.code ? 'Copy this section' : 'This section is empty'}
        onClick={() => copy(section)}>{copied === section.start ? '✓' : 'c'}</button></span>
      {inner}
    </div>);
    index = section.end + 1;
  }
  for (; index < lines.length; index += 1) rows.push(<div className="snippet-line" key={index}><Line tokens={lines[index]} /></div>);

  return <div className="snippet-document">
    <pre className="snippet-read-gutter" aria-hidden="true">{lines.map((_, row) => row + 1).join('\n')}</pre>
    <div className="snippet-code snippet-lines">{rows}</div>
  </div>;
}