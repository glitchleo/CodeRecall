import React, { memo, useMemo } from 'react';
import { tokenizeCode } from './lib/syntax.js';
import './syntax.css';

// Only spans/text, so the editor can place this inside its own scrolling mirror.
export const CodeTokens = memo(function CodeTokens({ code = '', filename = '' }) {
  const tokens = useMemo(() => tokenizeCode(code, filename), [code, filename]);
  return tokens.map(({ type, value }, index) => type === 'plain'
    ? <React.Fragment key={index}>{value}</React.Fragment>
    : <span className={`syntax-${type}`} key={index}>{value}</span>);
});

export default function SyntaxCode({ code = '', filename = '', className = '' }) {
  return <pre className={`syntax-code ${className}`}><code><CodeTokens code={code} filename={filename} /></code></pre>;
}
