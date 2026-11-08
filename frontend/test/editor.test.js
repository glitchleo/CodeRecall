import test from "node:test";
import assert from "node:assert/strict";
import {
  EDITOR_HISTORY_LIMIT, createEditorState, recordEdit, undoEdit, redoEdit,
  selectEditorRange, indentSelection, insertLineBreak, normalizeLineEndings,
  createTaglessCopySection, handleEnterInsideSection, handleArrowDownAtSectionEnd,
  adjustSectionsOnEdit, isRangeIntersectingSections, getSectionCode,
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

test("tagless copy sections: create on empty line initializes line below", () => {
  const result = createTaglessCopySection("", 0, 0, []);
  assert.ok(result);
  assert.equal(result.text, "\n");
  assert.deepEqual(result.sections, [{ start: 0, end: 0 }]);
  assert.equal(result.start, 0);
  assert.equal(result.end, 0);

  // Deleting the line deletes the copy section as well
  const afterDelete = adjustSectionsOnEdit(result.sections, "\n", "");
  assert.deepEqual(afterDelete, []);
});

test("tagless copy sections: selecting multiple lines creates a section covering all selected lines", () => {
  const text = "const a = 1;\nconst b = 2;\nconst c = 3;";
  // Select lines 0 and 1
  const from = 0;
  const to = 25; // covers first two lines
  const result = createTaglessCopySection(text, from, to, []);
  assert.ok(result);
  assert.deepEqual(result.sections, [{ start: 0, end: 1 }]);
  assert.equal(getSectionCode(result.text, result.sections[0]), "const a = 1;\nconst b = 2;");

  // If section ends at EOF, a line is initialized below
  const eofResult = createTaglessCopySection(text, 13, text.length, []);
  assert.ok(eofResult);
  assert.equal(eofResult.text, text + "\n");
  assert.deepEqual(eofResult.sections, [{ start: 1, end: 2 }]);
});

test("tagless copy sections: cannot create section when cursor or selection intersects existing section", () => {
  const text = "line0\nline1\nline2\nline3\nline4\nline5";
  const sections = [{ start: 2, end: 3 }];

  // Caret inside section (line 2)
  const line2Offset = text.indexOf("line2") + 2;
  assert.equal(createTaglessCopySection(text, line2Offset, line2Offset, sections), null);

  // Selection inside section
  const line3Offset = text.indexOf("line3") + 3;
  assert.equal(createTaglessCopySection(text, line2Offset, line3Offset, sections), null);

  // Selection partially inside and partially outside (line 1 to line 2)
  const line1Offset = text.indexOf("line1");
  assert.equal(createTaglessCopySection(text, line1Offset, line2Offset, sections), null);

  // Selection spanning over section (line 1 to line 4)
  const line4Offset = text.indexOf("line4");
  assert.equal(createTaglessCopySection(text, line1Offset, line4Offset, sections), null);

  // Selection completely outside (line 0) succeeds
  assert.ok(createTaglessCopySection(text, 0, 5, sections));
});

test("tagless copy sections: enter inside section expands it and ensures line below", () => {
  const text = "const a = 1;\nconst b = 2;\n";
  const sections = [{ start: 0, end: 1 }];

  // Press enter in the middle of line 0
  const enterAtStart = handleEnterInsideSection(text, 6, 6, sections);
  assert.deepEqual(enterAtStart.sections, [{ start: 0, end: 2 }]);
  assert.equal(enterAtStart.text, "const \na = 1;\nconst b = 2;\n");

  // Press enter on the last line of section (line 2)
  const lastLinePos = enterAtStart.text.indexOf("const b");
  const enterAtLast = handleEnterInsideSection(enterAtStart.text, lastLinePos + 7, lastLinePos + 7, enterAtStart.sections);
  assert.deepEqual(enterAtLast.sections, [{ start: 0, end: 3 }]);
  // Line 3 is in section, line 4 is initialized below
  assert.ok(enterAtLast.text.split("\n").length >= 5);
});

test("tagless copy sections: arrow down at section end at EOF initializes a line below", () => {
  const text = "sectionLine";
  const sections = [{ start: 0, end: 0 }];
  const downResult = handleArrowDownAtSectionEnd(text, 5, 5, sections);
  assert.ok(downResult);
  assert.equal(downResult.text, "sectionLine\n");
  assert.equal(downResult.start, downResult.text.length);
});

test("tagless copy sections: adjustSectionsOnEdit tracks edits, shrinks, and deletes sections", () => {
  const text = "line0\nline1\nline2\nline3\nline4\n";
  const sections = [{ start: 1, end: 3 }];

  // Typing inside section retains section
  const withTyping = "line0\nline1-edited\nline2\nline3\nline4\n";
  assert.deepEqual(adjustSectionsOnEdit(sections, text, withTyping), [{ start: 1, end: 3 }]);

  // Deleting a line inside section shrinks section
  const withLineRemoved = "line0\nline1\nline3\nline4\n";
  assert.deepEqual(adjustSectionsOnEdit(sections, text, withLineRemoved), [{ start: 1, end: 2 }]);

  // Deleting all lines of section removes section
  const allSectionRemoved = "line0\nline4\n";
  assert.deepEqual(adjustSectionsOnEdit(sections, text, allSectionRemoved), []);

  // Adding lines before section shifts section down
  const linesBefore = "new1\nnew2\n" + text;
  assert.deepEqual(adjustSectionsOnEdit(sections, text, linesBefore), [{ start: 3, end: 5 }]);
});
