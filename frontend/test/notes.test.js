import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNotes, normalizeNoteRuns, notesFromItem, equalNotes, validateDescriptionFormat } from '../src/lib/notes.js';
import { updateFileDocument, updateItemMetadata, copyItems, validateStoredNodes } from '../src/lib/library.js';
import { snapshotLibrary } from '../src/lib/cloud.js';

const file = { id: 'file', name: 'sample.py', type: 'file', parentId: null, starred: false, createdAt: '2026-10-12T09:00:00.000Z', updatedAt: '2026-10-12T09:00:00.000Z', content: 'print(1)' };
const rich = { description: 'How this works\nAn example', descriptionFormat: { version: 1, runs: [{ text: 'How this works', bold: true, fontSize: 24 }, { text: '\nAn example', italic: true, underline: true }] } };

test('legacy plain descriptions become safe notes and matching adjacent marks merge', () => {
  assert.deepEqual(notesFromItem({ description: 'Plain text' }), { description: 'Plain text', descriptionFormat: { version: 1, runs: [{ text: 'Plain text' }] } });
  assert.deepEqual(notesFromItem({}), { description: '', descriptionFormat: { version: 1, runs: [] } });
  assert.deepEqual(normalizeNoteRuns([{ text: 'a', bold: true }, { text: 'b', bold: true, italic: false }, { text: '' }, { text: 'c', fontSize: 16 }]), [{ text: 'ab', bold: true }, { text: 'c' }]);
  assert.equal(equalNotes({ description: 'Plain text' }, notesFromItem({ description: 'Plain text' })), true);
  assert.deepEqual(normalizeNotes({ description: '<script>safe text</script>', descriptionFormat: '<script>bad</script>' }).descriptionFormat.runs, [{ text: '<script>safe text</script>' }]);
});

test('rich formatting validates exact plain text and rejects HTML, foreign properties, invalid sizes, or excessive text', () => {
  assert.equal(validateDescriptionFormat(rich.descriptionFormat, rich.description), true);
  for (const format of [null, [], '<b>html</b>', { version: 2, runs: [] }, { version: 1, runs: [], html: '<b>' },
    { version: 1, runs: [{ text: 'wrong' }] }, { version: 1, runs: [{ text: rich.description, bold: 'true' }] },
    { version: 1, runs: [{ text: rich.description, fontSize: 200 }] }, { version: 1, runs: [{ text: rich.description, style: 'url(x)' }] },
    { version: 1, runs: [{ text: '' }, { text: rich.description }] }]) assert.equal(validateDescriptionFormat(format, rich.description), false);
  assert.equal(validateDescriptionFormat({ version: 1, runs: [{ text: 'x'.repeat(4001) }] }, 'x'.repeat(4001)), false);
});

test('code and notes save atomically, preserve unrelated metadata and survive copies and cloud roundtrips', () => {
  const nodes = Object.freeze([Object.freeze({ ...file, tagIds: ['example'], iconId: 'file_type_python' })]);
  const next = updateFileDocument(nodes, 'file', 'print("é")', rich);
  assert.equal(next[0].sizeBytes, 11);
  assert.equal(next[0].description, rich.description);
  assert.deepEqual(next[0].descriptionFormat, rich.descriptionFormat);
  assert.deepEqual(next[0].tagIds, ['example']);
  assert.equal(nodes[0].description, undefined);
  assert.equal(validateStoredNodes(next), true);
  assert.equal(updateFileDocument(next, 'file', next[0].content, rich), next);
  const copied = copyItems(next, ['file']);
  assert.deepEqual(copied.at(-1).descriptionFormat, rich.descriptionFormat);
  const snapshot = snapshotLibrary({ version: 2, nodes: copied, tags: [{ id: 'example', name: 'Example' }] });
  assert.deepEqual(snapshot.nodes.at(-1).descriptionFormat, rich.descriptionFormat);
  assert.throws(() => updateFileDocument(nodes, 'file', 'changed', { description: rich.description, descriptionFormat: { version: 1, runs: [] } }), /valid text/i);
  assert.equal(nodes[0].content, 'print(1)');
  assert.throws(() => updateFileDocument([{ ...file, type: 'folder' }], 'file', '', rich), /choose a file/i);
});

test('metadata saves formatting-only changes and plain description replacements drop stale marks', () => {
  const original = [{ ...file, description: 'Explain' }];
  const formatOnly = updateItemMetadata(original, 'file', { description: 'Explain', descriptionFormat: { version: 1, runs: [{ text: 'Explain', bold: true }] } });
  assert.equal(formatOnly[0].descriptionFormat.runs[0].bold, true);
  assert.notEqual(formatOnly, original);
  assert.equal(updateItemMetadata(formatOnly, 'file', notesFromItem(formatOnly[0])), formatOnly);
  const changed = updateItemMetadata(formatOnly, 'file', { description: 'New explanation' });
  assert.equal('descriptionFormat' in changed[0], false);
  assert.equal(validateStoredNodes(changed), true);
  assert.equal(validateStoredNodes([{ ...file, ...rich, description: 'Different text' }]), false);
  assert.equal(validateStoredNodes([{ ...file, type: 'folder', ...rich, content: undefined }]), false);
});
