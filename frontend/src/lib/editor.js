/** Textarea positions are UTF-16 offsets, matching selectionStart/selectionEnd. */
export const EDITOR_HISTORY_LIMIT = 200;
const GROUP_DELAY = 600;

export function normalizeLineEndings(text = "") {
  return String(text).replace(/\r\n?/g, "\n");
}

function selection(text, start = 0, end = start) {
  const bound = (offset) => Math.min(text.length, Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  const from = bound(start);
  const to = bound(end);
  return { text, start: Math.min(from, to), end: Math.max(from, to) };
}

export function createEditorState(text = "") {
  return { present: selection(String(text)), past: [], future: [] };
}

/** Selection changes never create history entries or discard redo history. */
export function selectEditorRange(state, start, end = start) {
  const present = selection(state.present.text, start, end);
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
  const present = selection(String(snapshot.text), snapshot.start, snapshot.end);
  if (present.text === state.present.text) return selectEditorRange(state, present.start, present.end);
  const direction = editDirection(state.present, present, group);
  const canGroup = direction !== null && Number.isFinite(time) && state.future.length === 0
    && state.lastEdit?.group === group && state.lastEdit?.direction === direction
    && time >= state.lastEdit.time && time - state.lastEdit.time <= GROUP_DELAY;
  return {
    ...state,
    present,
    past: canGroup ? state.past : [...state.past, state.present].slice(-EDITOR_HISTORY_LIMIT),
    future: [],
    lastEdit: direction && Number.isFinite(time) ? { group, direction, time } : null,
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