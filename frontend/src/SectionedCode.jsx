import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseCopySections, getSectionCode } from './lib/editor.js';
import { tokenLines } from './lib/codeLines.js';
import { copyText } from './lib/clipboard.js';

const Line = ({ tokens }) => tokens.map(({ type, value }, index) => type === 'plain'
  ? <React.Fragment key={index}>{value}</React.Fragment>
  : <span className={`syntax-${type}`} key={index}>{value}</span>);

export default function SectionedCode({ content = '', filename = '', sections: propSections }) {
  const lines = useMemo(() => tokenLines(content, filename), [content, filename]);
  const parsed = useMemo(() => parseCopySections(content), [content]);
  const hasLegacyTags = !propSections && parsed.sections.length > 0;
  const sections = useMemo(() => {
    if (Array.isArray(propSections) && propSections.length > 0) return propSections;
    return parsed.sections;
  }, [propSections, parsed.sections]);
  const [copied, setCopied] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(section) {
    const code = section.code !== undefined ? section.code : getSectionCode(content, section);
    if (!code || !(await copyText(code))) return;
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
      const tag = hasLegacyTags && (row === section.start || row === section.end);
      inner.push(<div className={`snippet-line${tag ? ' snippet-tag-row' : ''}`} key={row}>{tag ? null : <Line tokens={lines[row]} />}</div>);
    }
    const sectionCode = section.code !== undefined ? section.code : getSectionCode(content, section);
    rows.push(<div className="snippet-section" key={`s${section.start}`}>
      <span className="snippet-copy-anchor"><button type="button" className={`snippet-copy-section${copied === section.start ? ' copied' : ''}`} disabled={!sectionCode}
        aria-label={sectionCode ? `Copy section, lines ${section.start + 1} to ${section.end + 1}` : 'Copy section (empty)'} title={sectionCode ? 'Copy this section' : 'This section is empty'}
        onClick={() => copy(section)}>{copied === section.start ? '✓' : 'C'}</button></span>
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
