import test from "node:test";
import assert from "node:assert/strict";
import {
  EDITOR_HISTORY_LIMIT, createEditorState, recordEdit, undoEdit, redoEdit,
  selectEditorRange, indentSelection, insertLineBreak, normalizeLineEndings,
} from "../src/lib/editor.js";

const snapshot = (text, start = text.length, end = start) => ({ text, start, end });
const edit = (state, text, start = text.length, end = start, options) => recordEdit(state, snapshot(text, start, end), options);

test("undo and redo restore text with the selection before and after a replacement", () => {
  let state = selectEditorRange(createEditorState("first second"), 6, 12);
  state = edit(state, "first next", 10);
  assert.deepEqual(undoEdit(state).present, snapshot("first second", 6, 12));
  assert.deepEqual(redoEdit(undoEdit(state)).present, snapshot("first next", 10));
  assert.equal(undoEdit(createEditorState()).present.text, "");
  assert.equal(redoEdit(createEditorState()).present.text, "");
});

test("caret movements create no undo entries, preserve redo, and clamp selection offsets", () => {
  const original = createEditorState("abc");
  const moved = selectEditorRange(original, -5, 99);
  assert.deepEqual(moved.present, snapshot("abc", 0, 3));
  assert.equal(moved.past.length, 0);
  assert.deepEqual(original.present, snapshot("abc", 0));
  const undone = undoEdit(edit(original, "abcd"));
  const selected = selectEditorRange(undone, 2, 1);
  assert.deepEqual(selected.present, snapshot("abc", 1, 2));
  assert.equal(selected.future.length, 1);
  assert.equal(redoEdit(selected).present.text, "abcd");
  assert.equal(recordEdit(selected, snapshot("abc", 2)).past.length, 0);
});

test("a new edit after undo discards the old future without mutating previous history", () => {
  const first = edit(createEditorState(), "a");
  const second = edit(first, "ab");
  const branch = edit(undoEdit(second), "ac");
  assert.equal(branch.future.length, 0);
  assert.equal(undoEdit(branch).present.text, "a");
  assert.equal(redoEdit(branch).present.text, "ac");
  assert.equal(second.present.text, "ab");
  assert.equal(second.past.length, 2);
});

test("continuous typing groups within 600 ms; a pause, caret movement, or explicit edit separates undo", () => {
  let state = createEditorState();
  state = edit(state, "h", 1, 1, { group: "typing", time: 0 });
  state = edit(state, "he", 2, 2, { group: "typing", time: 600 });
  assert.equal(state.past.length, 1);
  assert.equal(undoEdit(state).present.text, "");
  state = edit(state, "hey", 3, 3, { group: "typing", time: 1201 });
  assert.equal(state.past.length, 2);
  state = selectEditorRange(state, 1);
  state = edit(state, "h!ey", 2, 2, { group: "typing", time: 1202 });
  assert.equal(state.past.length, 3);
  state = edit(state, "h!?ey", 3, 3, { group: null, time: 1203 });
  assert.equal(state.past.length, 4);
});

test("backward and forward deletion group individually, with direction changes separating undo", () => {
  let state = selectEditorRange(createEditorState("abcd"), 4);
  state = edit(state, "abc", 3, 3, { group: "delete", time: 0 });
  state = edit(state, "ab", 2, 2, { group: "delete", time: 50 });
  assert.equal(state.past.length, 1);
  assert.deepEqual(undoEdit(state).present, snapshot("abcd", 4));
  state = selectEditorRange(createEditorState("abcd"), 1);
  state = edit(state, "acd", 1, 1, { group: "delete", time: 0 });
  state = edit(state, "ad", 1, 1, { group: "delete", time: 50 });
  assert.equal(state.past.length, 1);
  state = edit(state, "d", 0, 0, { group: "delete", time: 100 });
  assert.equal(state.past.length, 2);
});

test("replacement, multiline insertion, and discontinuous input cannot merge into a typing group", () => {
  let state = selectEditorRange(createEditorState("abc"), 0, 3);
  state = edit(state, "x", 1, 1, { group: "typing", time: 0 });
  state = edit(state, "xy", 2, 2, { group: "typing", time: 10 });
  assert.equal(state.past.length, 2);
  state = edit(state, "xy\n", 3, 3, { group: "typing", time: 20 });
  state = edit(state, "xy\nz", 4, 4, { group: "typing", time: 30 });
  assert.equal(state.past.length, 4);
  state = edit(state, "Qxy\nz", 1, 1, { group: "typing", time: 40 });
  assert.equal(state.past.length, 5);
});

test("history is bounded while undoing and redoing all retained edits remains consistent", () => {
  let state = createEditorState();
  for (let i = 0; i < EDITOR_HISTORY_LIMIT + 10; i++) state = edit(state, String(i));
  assert.equal(state.past.length, EDITOR_HISTORY_LIMIT);
  for (let i = 0; i < EDITOR_HISTORY_LIMIT; i++) state = undoEdit(state);
  assert.equal(state.present.text, "9");
  assert.equal(state.future.length, EDITOR_HISTORY_LIMIT);
  for (let i = 0; i < EDITOR_HISTORY_LIMIT; i++) state = redoEdit(state);
  assert.equal(state.present.text, String(EDITOR_HISTORY_LIMIT + 9));
  assert.equal(state.past.length, EDITOR_HISTORY_LIMIT);
});

test("Tab inserts spaces at a caret and multiline indentation preserves the selected source", () => {
  assert.deepEqual(indentSelection("abc", 1, 1), snapshot("a    bc", 5));
  const text = "one\ntwo\nthree";
  const result = indentSelection(text, 1, 6);
  assert.deepEqual(result, snapshot("    one\n    two\nthree", 5, 14));
  assert.equal(result.text.slice(result.start, result.end), "ne\n    tw");
  assert.deepEqual(indentSelection("one\ntwo", 0, 4), snapshot("    one\ntwo", 4, 8));
  assert.deepEqual(indentSelection("\nnext", 0, 1), snapshot("    \nnext", 4, 5));
});

test("Shift+Tab removes up to four leading spaces or one tab on each selected line", () => {
  const text = "    one\n  two\n\tthree\nfour";
  assert.deepEqual(indentSelection(text, 0, text.length, { outdent: true }), snapshot("one\ntwo\nthree\nfour", 0, text.length - 7));
  assert.deepEqual(indentSelection("    abc", 2, 2, { outdent: true }), snapshot("abc", 0));
  assert.deepEqual(indentSelection("    abc", 6, 6, { outdent: true }), snapshot("abc", 2));
  assert.deepEqual(indentSelection("abc", 1, 1, { outdent: true }), snapshot("abc", 1));
  assert.deepEqual(indentSelection("    a\n    b", 0, 6, { outdent: true }), snapshot("a\n    b", 0, 2));
  assert.deepEqual(indentSelection("\n    b", 0, 1, { outdent: true }), snapshot("\n    b", 0, 1));
});

test("line break replaces the selection and carries current-line spaces or tabs", () => {
  assert.deepEqual(insertLineBreak("    call()", 10, 10), snapshot("    call()\n    ", 15));
  assert.deepEqual(insertLineBreak("\tfirst tail", 6, 11), snapshot("\tfirst\n\t", 8));
  assert.deepEqual(insertLineBreak("    abc", 2, 2), snapshot("  \n    abc", 5));
  assert.deepEqual(insertLineBreak("a\nb", 0, 3), snapshot("\n", 1));
  assert.deepEqual(insertLineBreak("\n  next", 0, 0), snapshot("\n\n  next", 1));
});

test("Unicode offsets follow textarea UTF-16 indexing and normalization handles mixed newlines", () => {
  const text = "😀 café";
  let state = selectEditorRange(createEditorState(text), 2);
  state = edit(state, "😀! café", 3);
  assert.deepEqual(undoEdit(state).present, snapshot(text, 2));
  assert.deepEqual(indentSelection(text, 2, 2), snapshot("😀     café", 6));
  assert.equal(normalizeLineEndings("a\r\nb\rc\nd"), "a\nb\nc\nd");
});
