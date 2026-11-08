/** Textarea positions are UTF-16 offsets, matching selectionStart/selectionEnd. */
export const EDITOR_HISTORY_LIMIT = 200;
const GROUP_DELAY = 600;

export function normalizeLineEndings(text = "") {
  return String(text).replace(/\r\n?/g, "\n");
}

function selection(text, start = 0, end = start, sections = undefined) {
  const bound = (offset) => Math.min(text.length, Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  const from = bound(start);
  const to = bound(end);
  const result = { text, start: Math.min(from, to), end: Math.max(from, to) };
  if (sections !== undefined) result.sections = sections;
  return result;
}

export function equalSections(a = [], b = []) {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((s, i) => s && b[i] && s.start === b[i].start && s.end === b[i].end);
}

export function createEditorState(text = "", sections = undefined) {
  return { present: selection(String(text), 0, 0, sections), past: [], future: [] };
}

/** Selection changes never create history entries or discard redo history. */
export function selectEditorRange(state, start, end = start) {
  const present = selection(state.present.text, start, end, state.present.sections);
  if (present.start === state.present.start && present.end === state.present.end) return state;
  return { ...state, present, lastEdit: null };
}

function editDirection(previous, next, group) {
  if (previous.start !== previous.end || next.start !== next.end) return null;
  const difference = next.text.length - previous.text.length;
  const caret = previous.start;
  if (group === "typing" && difference > 0 && next.start === caret + difference) {
    const inserted = next.text.slice(caret, next.start);
    if (!/[\r\n\t]/.test(inserted)
      && next.text === previous.text.slice(0, caret) + inserted + previous.text.slice(caret)) return "insert";
  }
  if (group === "delete" && difference < 0) {
    const removed = -difference;
    if (next.start === caret - removed
      && next.text === previous.text.slice(0, next.start) + previous.text.slice(caret)) return "backward";
    if (next.start === caret
      && next.text === previous.text.slice(0, caret) + previous.text.slice(caret + removed)) return "forward";
  }
  return null;
}

/** Record text edits; consecutive uninterrupted typing/deletion can share one undo step. */
export function recordEdit(state, snapshot, { group = null, time = Date.now() } = {}) {
  const sections = snapshot.sections ?? state.present.sections;
  const present = selection(String(snapshot.text), snapshot.start, snapshot.end, sections);
  if (present.text === state.present.text && equalSections(present.sections, state.present.sections)) {
    return selectEditorRange(state, present.start, present.end);
  }
  const direction = editDirection(state.present, present, group);
  const sectionsChanged = !equalSections(present.sections, state.present.sections);
  const canGroup = !sectionsChanged && direction !== null && Number.isFinite(time) && state.future.length === 0
    && state.lastEdit?.group === group && state.lastEdit?.direction === direction
    && time >= state.lastEdit.time && time - state.lastEdit.time <= GROUP_DELAY;
  return {
    ...state,
    present,
    past: canGroup ? state.past : [...state.past, state.present].slice(-EDITOR_HISTORY_LIMIT),
    future: [],
    lastEdit: direction && !sectionsChanged && Number.isFinite(time) ? { group, direction, time } : null,
  };
}

export function undoEdit(state) {
  if (!state.past.length) return state;
  return {
    ...state,
    present: state.past.at(-1),
    past: state.past.slice(0, -1),
    future: [state.present, ...state.future],
    lastEdit: null,
  };
}

export function redoEdit(state) {
  if (!state.future.length) return state;
  return {
    ...state,
    present: state.future[0],
    past: [...state.past, state.present].slice(-EDITOR_HISTORY_LIMIT),
    future: state.future.slice(1),
    lastEdit: null,
  };
}

function applyTextEdits(text, start, end, edits) {
  if (!edits.length) return { text, start, end };
  let result = "";
  let cursor = 0;
  for (const edit of edits) {
    result += text.slice(cursor, edit.index) + edit.insert;
    cursor = edit.index + edit.remove;
  }
  result += text.slice(cursor);
  const mapOffset = (offset) => {
    let shift = 0;
    for (const edit of edits) {
      if (offset < edit.index) break;
      if (edit.remove && offset <= edit.index + edit.remove) return edit.index + shift + edit.insert.length;
      shift += edit.insert.length - edit.remove;
    }
    return offset + shift;
  };
  return { text: result, start: mapOffset(start), end: mapOffset(end) };
}

/** Indent selected lines, or insert indentation at a caret. Outdent removes line prefixes. */
export function indentSelection(text, start, end, { outdent = false, indent = "    " } = {}) {
  ({ text, start, end } = selection(text, start, end));
  if (!outdent && start === end) {
    return { text: text.slice(0, start) + indent + text.slice(end), start: start + indent.length, end: start + indent.length };
  }
  const firstLine = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  // A range ending at the next line's start does not select that next line.
  const lastPosition = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const edits = [];
  let lineStart = firstLine;
  do {
    if (outdent) {
      const leading = text.slice(lineStart).match(/^(\t| +)/)?.[0] ?? "";
      const remove = leading[0] === "\t" ? 1 : Math.min(leading.length, Math.max(1, indent.length));
      if (remove) edits.push({ index: lineStart, remove, insert: "" });
    } else if (indent) {
      edits.push({ index: lineStart, remove: 0, insert: indent });
    }
    const newline = text.indexOf("\n", lineStart);
    if (newline === -1 || newline >= lastPosition) break;
    lineStart = newline + 1;
  } while (lineStart <= lastPosition);
  return applyTextEdits(text, start, end, edits);
}

/** Insert a newline carrying only the current line's whitespace before the caret. */
export function insertLineBreak(text, start, end) {
  ({ text, start, end } = selection(text, start, end));
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const indentation = text.slice(lineStart, start).match(/^[\t ]*/)[0];
  const inserted = `\n${indentation}`;
  const caret = start + inserted.length;
  return { text: text.slice(0, start) + inserted + text.slice(end), start: caret, end: caret };
}

/* ------------------------------------------------------------------ *
 * Copy sections: <copy-sec> ... </copy-sec>
 *
 * The tags live inside the file content itself, so saving, JSON export,
 * JSON import, cloud backups and copies all keep them with no extra storage.
 * A tag must be alone on its line. It may sit inside a line comment so the
 * file stays valid code:  // <copy-sec>   # <copy-sec>   <!-- <copy-sec> -->
 * ------------------------------------------------------------------ */
const COPY_TAG = /^([ \t]*)((?:\/\/|#|--|;|%|\/\*|<!--)[ \t]*)?<(\/?)copy-sec>(?:[ \t]*(\*\/|-->))?[ \t]*$/;
const COMMENT_END = { "/*": "*/", "<!--": "-->" };

/** Pairs each closing tag with the nearest opening tag above it. Sections never nest. */
export function parseCopySections(text = "") {
  const lines = normalizeLineEndings(text).split("\n");
  const sections = [];
  const orphans = [];
  let open = null;
  lines.forEach((line, index) => {
    const match = COPY_TAG.exec(line);
    if (!match) return;
    if (!match[3]) {
      if (open !== null) orphans.push(open);
      open = index;
    } else if (open === null) {
      orphans.push(index);
    } else {
      sections.push({ start: open, end: index, code: lines.slice(open + 1, index).join("\n") });
      open = null;
    }
  });
  if (open !== null) orphans.push(open);
  return { sections, orphans: orphans.sort((a, b) => a - b) };
}

/** The code a section's copy button copies: everything between the two tag lines. */
export function copySectionText(section) {
  return section.code;
}

/** Remove the tag lines of complete sections, e.g. when copying a whole file. */
export function stripCopySectionTags(text = "") {
  const normalized = normalizeLineEndings(text);
  const { sections } = parseCopySections(normalized);
  if (!sections.length) return String(text);
  const drop = new Set(sections.flatMap((section) => [section.start, section.end]));
  return normalized.split("\n").filter((_, index) => !drop.has(index)).join("\n");
}

/**
 * Call right after the user typed ">". If the caret now ends an opening tag that
 * stands alone on its line, return the text with a blank line and a closing tag added.
 * Returns null (do nothing) when the user is clearly wrapping existing code instead:
 * code directly below the tag, or a closing tag below that already pairs with it.
 */
export function completeCopySection(text, start, end) {
  ({ text, start, end } = selection(text, start, end));
  if (start !== end || text[start - 1] !== ">") return null;
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", start);
  if (lineEnd === -1) lineEnd = text.length;
  const match = COPY_TAG.exec(text.slice(lineStart, start));
  if (!match || match[3] || text.slice(start, lineEnd).trim() !== "") return null;
  const nextLine = lineEnd < text.length ? text.slice(lineEnd + 1).split("\n", 1)[0] : "";
  if (nextLine.trim() !== "") return null;
  const lineIndex = text.slice(0, lineStart).split("\n").length - 1;
  if (parseCopySections(text).sections.some((section) => section.start === lineIndex)) return null;
  const [, indent, lead = "", , suffix] = match;
  const closeComment = suffix ?? COMMENT_END[lead.trim()] ?? "";
  const openerTail = suffix === undefined && closeComment ? ` ${closeComment}` : "";
  const closer = `${indent}${lead}</copy-sec>${closeComment ? ` ${closeComment}` : ""}`;
  const caret = start + openerTail.length + 1 + indent.length;
  return { text: `${text.slice(0, start)}${openerTail}\n${indent}\n${closer}${text.slice(lineEnd)}`, start: caret, end: caret };
}

/**
 * Shortcut helper. With a selection: wraps the selected lines in a copy section.
 * On a blank line: turns it into an empty section. On a code line: adds an empty
 * section below it. The caret lands inside an empty section, or after a wrapped one.
 */
export function insertCopySection(text, start, end) {
  ({ text, start, end } = selection(text, start, end));
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const ranged = end > start;
  const lastPosition = ranged && text[end - 1] === "\n" ? end - 1 : end;
  let lineEnd = text.indexOf("\n", lastPosition);
  if (lineEnd === -1) lineEnd = text.length;
  const block = text.slice(lineStart, lineEnd);
  const indent = block.match(/^[\t ]*/)[0];
  const open = `${indent}<copy-sec>`;
  const close = `${indent}</copy-sec>`;
  if (ranged && block.trim() !== "") {
    const wrapped = `${open}\n${block}\n${close}`;
    const caret = lineStart + wrapped.length;
    return { text: text.slice(0, lineStart) + wrapped + text.slice(lineEnd), start: caret, end: caret };
  }
  const empty = `${open}\n${indent}\n${close}`;
  const insertAt = block.trim() === "" ? lineStart : lineEnd;
  const prefix = block.trim() === "" ? "" : "\n";
  const caret = insertAt + prefix.length + open.length + 1 + indent.length;
  const replaced = block.trim() === "" ? lineEnd : lineEnd;
  return { text: text.slice(0, insertAt) + prefix + empty + text.slice(replaced), start: caret, end: caret };
}

/* ------------------------------------------------------------------ *
 * Tagless copy sections: line ranges [start, end]
 * No <copy-sec> tags inside the file content.
 * ------------------------------------------------------------------ */

export function findChangeRange(oldText = "", newText = "") {
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start, oldEnd, newEnd };
}

export function sanitizeSections(sections = [], totalLines = 0) {
  if (!Array.isArray(sections)) return [];
  const valid = [];
  for (const s of sections) {
    if (!s || !Number.isInteger(s.start) || !Number.isInteger(s.end)) continue;
    const start = Math.max(0, s.start);
    const end = Math.max(start, s.end);
    if (totalLines > 0 && start >= totalLines) continue;
    valid.push({ start, end: totalLines > 0 ? Math.min(totalLines - 1, end) : end });
  }
  valid.sort((a, b) => a.start - b.start);
  const result = [];
  for (const s of valid) {
    if (result.length === 0) {
      result.push(s);
    } else {
      const last = result[result.length - 1];
      if (s.start <= last.end) {
        last.end = Math.max(last.end, s.end);
      } else {
        result.push(s);
      }
    }
  }
  return result;
}

export function adjustSectionsOnEdit(sections = [], oldText = "", newText = "") {
  if (!Array.isArray(sections) || sections.length === 0) return [];
  if (oldText === newText) return sections;

  const { start, oldEnd, newEnd } = findChangeRange(oldText, newText);

  const changeStartLine = oldText.slice(0, start).split("\n").length - 1;
  const removedText = oldText.slice(start, oldEnd);
  const changeOldEndLine = changeStartLine + (removedText.split("\n").length - 1);
  const linesRemoved = changeOldEndLine - changeStartLine;

  const insertedText = newText.slice(start, newEnd);
  const linesInserted = insertedText.split("\n").length - 1;
  const lineDelta = linesInserted - linesRemoved;

  const nextSections = [];
  for (const s of sections) {
    const sStart = s.start;
    const sEnd = s.end;

    // 1. Edit strictly after this section
    if (changeStartLine > sEnd) {
      nextSections.push({ start: sStart, end: sEnd });
      continue;
    }

    // 2. Edit strictly before this section
    if (changeOldEndLine < sStart) {
      const nextStart = sStart + lineDelta;
      const nextEnd = sEnd + lineDelta;
      if (nextStart >= 0 && nextEnd >= nextStart) {
        nextSections.push({ start: nextStart, end: nextEnd });
      }
      continue;
    }

    // 3. Edit envelopes the whole section (it was deleted)
    if (changeStartLine <= sStart && changeOldEndLine >= sEnd) {
      continue;
    }

    // 4. Edit is strictly inside the section
    if (changeStartLine >= sStart && changeOldEndLine <= sEnd) {
      const nextEnd = sEnd + lineDelta;
      if (nextEnd >= sStart) {
        nextSections.push({ start: sStart, end: nextEnd });
      }
      continue;
    }

    // 5. Edit overlaps start of section
    if (changeStartLine < sStart && changeOldEndLine >= sStart) {
      const nextStart = changeStartLine + linesInserted;
      const nextEnd = sEnd + lineDelta;
      if (nextStart <= nextEnd) {
        nextSections.push({ start: nextStart, end: nextEnd });
      }
      continue;
    }

    // 6. Edit overlaps end of section
    if (changeStartLine <= sEnd && changeOldEndLine > sEnd) {
      const nextEnd = changeStartLine;
      if (sStart <= nextEnd) {
        nextSections.push({ start: sStart, end: nextEnd });
      }
      continue;
    }
  }

  return sanitizeSections(nextSections, newText.split("\n").length);
}

export function isRangeIntersectingSections(sections = [], firstLine, lastLine) {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  return sections.some((s) => !(lastLine < s.start || firstLine > s.end));
}

export function createTaglessCopySection(text = "", start = 0, end = start, sections = []) {
  const normalized = normalizeLineEndings(text);
  const bound = (offset) => Math.min(normalized.length, Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  const from = Math.min(bound(start), bound(end));
  const to = Math.max(bound(start), bound(end));
  const lines = normalized.split("\n");

  const firstLine = normalized.slice(0, from).split("\n").length - 1;
  let lastLine = firstLine;
  if (to > from) {
    const endOffset = (to > from && normalized[to - 1] === "\n") ? to - 1 : to;
    lastLine = normalized.slice(0, endOffset).split("\n").length - 1;
  }

  // If selection intersects any existing section (inside, outside, or spanning), do not create
  if (isRangeIntersectingSections(sections, firstLine, lastLine)) {
    return null;
  }

  if (to > from) {
    let nextText = normalized;
    if (lastLine === lines.length - 1) {
      nextText += "\n";
    }
    const newSection = { start: firstLine, end: lastLine };
    const nextSections = sanitizeSections([...sections, newSection], nextText.split("\n").length);
    return { text: nextText, start: from, end: to, sections: nextSections };
  }

  // Caret on a single line
  const currentLineText = lines[firstLine] ?? "";
  if (currentLineText === "") {
    let nextText = normalized;
    if (firstLine === lines.length - 1) {
      nextText += "\n";
    }
    const newSection = { start: firstLine, end: firstLine };
    const nextSections = sanitizeSections([...sections, newSection], nextText.split("\n").length);
    const lineStart = normalized.slice(0, from).lastIndexOf("\n");
    const caret = lineStart === -1 ? 0 : lineStart + 1;
    return { text: nextText, start: caret, end: caret, sections: nextSections };
  } else {
    const newlinePos = normalized.indexOf("\n", from);
    const insertAt = newlinePos === -1 ? normalized.length : newlinePos;
    const isAtEof = newlinePos === -1;
    const inserted = isAtEof ? "\n\n" : "\n";
    const nextText = normalized.slice(0, insertAt) + inserted + normalized.slice(insertAt);
    const sectionLine = firstLine + 1;
    const newSection = { start: sectionLine, end: sectionLine };
    const nextSections = sanitizeSections([...sections, newSection], nextText.split("\n").length);
    const caret = insertAt + 1;
    return { text: nextText, start: caret, end: caret, sections: nextSections };
  }
}

export function handleEnterInsideSection(text = "", start = 0, end = start, sections = []) {
  const normalized = normalizeLineEndings(text);
  const bound = (offset) => Math.min(normalized.length, Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  const from = Math.min(bound(start), bound(end));
  const cursorLine = normalized.slice(0, from).split("\n").length - 1;

  const sectionIndex = sections.findIndex((s) => cursorLine >= s.start && cursorLine <= s.end);
  const lineBreak = insertLineBreak(normalized, start, end);
  let nextText = lineBreak.text;
  const nextStart = lineBreak.start;
  const nextEnd = lineBreak.end;

  if (sectionIndex === -1) {
    const nextSections = sections.map((s) => s.start > cursorLine ? { start: s.start + 1, end: s.end + 1 } : s);
    return { text: nextText, start: nextStart, end: nextEnd, sections: nextSections };
  }

  const targetSection = sections[sectionIndex];
  const expandedEnd = targetSection.end + 1;

  const nextSections = sections.map((s, idx) => {
    if (idx === sectionIndex) return { start: s.start, end: expandedEnd };
    if (s.start > cursorLine) return { start: s.start + 1, end: s.end + 1 };
    return s;
  });

  const nextLines = nextText.split("\n");
  if (expandedEnd === nextLines.length - 1) {
    nextText += "\n";
  }

  return { text: nextText, start: nextStart, end: nextEnd, sections: sanitizeSections(nextSections, nextText.split("\n").length) };
}

export function handleArrowDownAtSectionEnd(text = "", start = 0, end = start, sections = []) {
  const normalized = normalizeLineEndings(text);
  const bound = (offset) => Math.min(normalized.length, Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  const from = Math.min(bound(start), bound(end));
  const lines = normalized.split("\n");
  const cursorLine = normalized.slice(0, from).split("\n").length - 1;

  const section = sections.find((s) => s.end === cursorLine);
  if (!section) return null;

  if (section.end === lines.length - 1) {
    const nextText = normalized + "\n";
    const nextCaret = nextText.length;
    return { text: nextText, start: nextCaret, end: nextCaret, sections };
  }

  return null;
}

export function getSectionCode(text = "", section) {
  if (!section) return "";
  const lines = normalizeLineEndings(text).split("\n");
  if (section.start >= lines.length) return "";
  const end = Math.min(lines.length - 1, section.end);
  return lines.slice(section.start, end + 1).join("\n");
}
