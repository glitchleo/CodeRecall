import { tokenizeCode } from './syntax.js';
import { normalizeLineEndings } from './editor.js';

/** Highlight once, then cut the tokens at line breaks: one array of tokens per source line. */
export function tokenLines(code = '', filename = '') {
  const lines = [[]];
  for (const { type, value } of tokenizeCode(normalizeLineEndings(code), filename)) {
    value.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines.at(-1).push({ type, value: part });
    });
  }
  return lines;
}