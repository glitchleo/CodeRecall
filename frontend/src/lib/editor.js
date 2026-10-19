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
