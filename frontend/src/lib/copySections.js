/**
 * Copy sections are line ranges, not text. A file stores them as
 *   copySections: [{ startLine, endLine }]   (1-based, inclusive, sorted, never overlapping)
 * so the code itself stays clean. While editing, ranges are 0-based { start, end } and are
 * kept in step with every edit by mapSectionsThroughEdit().
 *
 * Rules the editor relies on:
 *  - a section always has a free (non-section) line below it, so you can arrow out of it;
 *  - Enter anywhere inside a section grows it; deleting all of its lines removes it;
 *  - a new section can never overlap or nest inside another one.
 */
export const MAX_COPY_SECTIONS = 500;

const KEYS = ['startLine', 'endLine'];
const isLine = (value) => Number.isInteger(value) && value >= 1;
const newlines = (text) => { let n = 0; for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1; return n; };

export const countLines = (text) => newlines(text) + 1;
export const lineOfOffset = (text, offset) => newlines(text.slice(0, offset));

export function lineStartOffset(text, line) {
  let offset = 0;
  for (let i = 0; i < line; i += 1) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}
export function lineEndOffset(text, line) {
  const next = text.indexOf('\n', lineStartOffset(text, line));
  return next === -1 ? text.length : next;
}

/** Shape check only (used when loading a whole library): ranges are clamped later against the content. */
export function validCopySectionShape(value) {
  return Array.isArray(value) && value.length <= MAX_COPY_SECTIONS && value.every((item) => item && typeof item === 'object' && !Array.isArray(item)
    && Object.keys(item).every((key) => KEYS.includes(key)) && isLine(item.startLine) && isLine(item.endLine) && item.startLine <= item.endLine);
}

/** Canonical stored form for this content: sorted, inside the file, no overlaps. Bad entries are dropped. */
export function sanitizeCopySections(value, content = '') {
  if (!Array.isArray(value)) return [];
  const total = countLines(String(content));
  const out = [];
  const sorted = value.filter((item) => item && isLine(item.startLine) && isLine(item.endLine) && item.startLine <= item.endLine).sort((a, b) => a.startLine - b.startLine);
  for (const item of sorted) {
    if (item.startLine > total || out.length >= MAX_COPY_SECTIONS) continue;
    if (out.length && item.startLine <= out.at(-1).endLine) continue;
    out.push({ startLine: item.startLine, endLine: Math.min(item.endLine, total) });
  }
  return out;
}

/** Strict version for user-supplied JSON: report the first problem instead of dropping silently. */
export function copySectionProblem(value, content) {
  if (!validCopySectionShape(value)) return `copySections must be a list of up to ${MAX_COPY_SECTIONS} items like { "startLine": 2, "endLine": 5 } (1-based, startLine ≤ endLine).`;
  const total = countLines(content);
  let previous = 0;
  for (const item of value) {
    if (item.endLine > total) return `copySections line ${item.endLine} is past the end of the file (${total} lines).`;
    if (item.startLine <= previous) return 'copySections must be sorted and must not overlap.';
    previous = item.endLine;
  }
  return '';
}

export const toRanges = (stored = []) => stored.map(({ startLine, endLine }) => ({ start: startLine - 1, end: endLine - 1 }));
export const toStored = (ranges = []) => ranges.map(({ start, end }) => ({ startLine: start + 1, endLine: end + 1 }));
export const sameRanges = (a = [], b = []) => a.length === b.length && a.every((range, i) => range.start === b[i].start && range.end === b[i].end);
export const sameStored = (a = [], b = []) => a.length === b.length && a.every((item, i) => item.startLine === b[i].startLine && item.endLine === b[i].endLine);

function normalizeRanges(ranges, total) {
  const sorted = ranges.map(({ start, end }) => ({ start: Math.max(0, start), end: Math.min(total - 1, end) }))
    .filter(({ start, end }) => start <= end && start < total).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/**
 * Re-aim ranges after the text between `from` and `to` was replaced by `insert`.
 * Only edits that add or remove line breaks matter. The line where the edit starts decides
 * whether the merged lines stay in a section; an edit that swallows every line of a
 * section removes it.
 */
export function mapSectionsThroughEdit(oldText, { from, to, insert }, ranges) {
  const k = newlines(insert);
  const removed = newlines(oldText.slice(from, to));
  if (!ranges.length || k === removed) return ranges;
  const first = lineOfOffset(oldText, from);
  const last = first + removed;
  const delta = k - removed;
  const headEmpty = from === lineStartOffset(oldText, first);
  const out = [];
  for (const { start: s, end: e } of ranges) {
    if (e < first) { out.push({ start: s, end: e }); continue; }
    if (s > last) { out.push({ start: s + delta, end: e + delta }); continue; }
    const above = first < s;
    const below = last > e;
    let start = s;
    let end;
    if (!above && !below) end = e + delta;                        // edit stays inside the section
    else if (above && below) continue;                            // every line was swallowed
    else if (above) { start = first + k + 1; end = e + delta; }   // started above: merged lines belong outside
    else end = headEmpty ? first - 1 : first + k;                 // started inside, ended below
    if (start <= end) out.push({ start, end });
  }
  return out;
}

/** Work out which text was replaced, from the selection before the edit and the caret after it. */
export function deriveEdit(oldText, oldStart, oldEnd, newText, newCaret) {
  const oldLength = oldText.length;
  const newLength = newText.length;
  const region = (from, to) => {
    const inserted = newLength - (oldLength - (to - from));
    if (from < 0 || to > oldLength || from > to || inserted < 0) return null;
    if (newText.slice(0, from) !== oldText.slice(0, from) || newText.slice(from + inserted) !== oldText.slice(to)) return null;
    return { from, to, insert: newText.slice(from, from + inserted) };
  };
  const removedLength = oldLength - newLength;
  const candidates = [[oldStart, oldEnd]];
  if (removedLength > 0 && oldStart === oldEnd) candidates.push([newCaret, newCaret + removedLength], [oldStart, oldStart + removedLength]);
  for (const [from, to] of candidates) {
    const found = region(from, to);
    if (found) return found;
  }
  let from = 0;
  const limit = Math.min(oldLength, newLength);
  while (from < limit && oldText[from] === newText[from]) from += 1;
  let to = oldLength;
  let newTo = newLength;
  while (to > from && newTo > from && oldText[to - 1] === newText[newTo - 1]) { to -= 1; newTo -= 1; }
  return { from, to, insert: newText.slice(from, newTo) };
}

/**
 * Keep a free line below every section (adding one at the end of the file, or between two
 * sections that touch). `offsets` are caret positions that should follow the inserted lines.
 */
export function ensureSectionGaps(text, ranges, offsets = []) {
  const offs = [...offsets];
  if (!ranges.length) return { text, sections: [], offsets: offs };
  let current = text;
  const sections = normalizeRanges(ranges, countLines(text));
  for (let i = 0; i < sections.length; i += 1) {
    const range = sections[i];
    if (range.end === countLines(current) - 1) { current += '\n'; continue; }
    const next = sections[i + 1];
    if (next && next.start === range.end + 1) {
      const at = lineStartOffset(current, range.end + 1);
      current = `${current.slice(0, at)}\n${current.slice(at)}`;
      offs.forEach((value, index) => { if (value >= at) offs[index] = value + 1; });
      for (let j = i + 1; j < sections.length; j += 1) sections[j] = { start: sections[j].start + 1, end: sections[j].end + 1 };
    }
  }
  return { text: current, sections, offsets: offs };
}

/**
 * Alt+Shift+C. Returns null when it must do nothing: the caret or any selected line is already
 * inside a section. A selection becomes a section; a caret on a blank line turns that line into
 * one; a caret on code adds a new empty line below it and makes that the section.
 */
export function createCopySection(text, ranges, selStart, selEnd) {
  const ranged = selEnd > selStart;
  const lastOffset = ranged && text[selEnd - 1] === '\n' ? selEnd - 1 : selEnd;
  const first = lineOfOffset(text, selStart);
  const last = ranged ? lineOfOffset(text, lastOffset) : first;
  if (ranges.some((range) => range.start <= last && range.end >= first)) return null;
  if (ranged) {
    const fixed = ensureSectionGaps(text, [...ranges, { start: first, end: last }], [selStart, selEnd]);
    return { text: fixed.text, sections: fixed.sections, start: fixed.offsets[0], end: fixed.offsets[1] };
  }
  const lineStart = lineStartOffset(text, first);
  const lineEnd = lineEndOffset(text, first);
  if (text.slice(lineStart, lineEnd).trim() === '') {
    const fixed = ensureSectionGaps(text, [...ranges, { start: first, end: first }], [selStart]);
    return { text: fixed.text, sections: fixed.sections, start: fixed.offsets[0], end: fixed.offsets[0] };
  }
  const withLine = `${text.slice(0, lineEnd)}\n${text.slice(lineEnd)}`;
  const shifted = mapSectionsThroughEdit(text, { from: lineEnd, to: lineEnd, insert: '\n' }, ranges);
  const caret = lineEnd + 1;
  const fixed = ensureSectionGaps(withLine, [...shifted, { start: first + 1, end: first + 1 }], [caret]);
  return { text: fixed.text, sections: fixed.sections, start: fixed.offsets[0], end: fixed.offsets[0] };
}

const LEGACY_TAG = /^[ \t]*(?:(?:\/\/|#|--|;|%|\/\*|<!--)[ \t]*)?<(\/?)copy-sec>(?:[ \t]*(?:\*\/|-->))?[ \t]*$/;

/** Older versions kept <copy-sec> tag lines in the code. Convert them to ranges (tags removed), or null. */
export function convertLegacyTags(text) {
  const lines = text.split('\n');
  let open = null;
  const pairs = [];
  lines.forEach((line, index) => {
    const match = LEGACY_TAG.exec(line);
    if (!match) return;
    if (!match[1]) open = index;
    else if (open !== null) { pairs.push([open, index]); open = null; }
  });
  const pairs2 = pairs.filter(([start, end]) => end - start > 1);
  if (!pairs.length) return null;
  const drop = new Set(pairs.flatMap(([start, end]) => [start, end]));
  const newIndex = new Map();
  const kept = [];
  lines.forEach((line, index) => { if (!drop.has(index)) { newIndex.set(index, kept.length); kept.push(line); } });
  const ranges = pairs2.map(([start, end]) => ({ start: newIndex.get(start + 1), end: newIndex.get(end - 1) }));
  return { text: kept.join('\n'), ranges };
}

/** The document the editor and the viewer show: normalized text plus 0-based ranges. */
export function loadCodeDocument(content, stored, { ensure = true } = {}) {
  let text = String(content ?? '').replace(/\r\n?/g, '\n');
  let ranges = toRanges(sanitizeCopySections(stored, text));
  if (!ranges.length) {
    const legacy = convertLegacyTags(text);
    if (legacy) ({ text, ranges } = legacy);
  }
  if (ensure && ranges.length) {
    const fixed = ensureSectionGaps(text, ranges);
    return { text: fixed.text, ranges: fixed.sections };
  }
  return { text, ranges };
}