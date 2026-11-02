import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPORT_FORMAT, MAX_IMPORT_BYTES, MAX_IMPORT_DEPTH, MAX_IMPORT_ITEMS,
  parseImportText, planLibraryImport,
} from '../src/lib/import.js';
import { decodeLibrary } from '../src/lib/tags.js';

const timestamp = '2026-10-12T09:00:00.000Z';
const file = (id, name, parentId = null, extra = {}) => ({ id, name, type: 'file', parentId, createdAt: timestamp, updatedAt: timestamp, starred: false, content: '', sizeBytes: 0, ...extra });
const folder = (id, name, parentId = null, extra = {}) => ({ id, name, type: 'folder', parentId, createdAt: timestamp, updatedAt: timestamp, starred: false, ...extra });
const library = (nodes = [], tags = []) => ({ version: 2, nodes, tags });
const payload = (items, extra = {}) => ({ format: IMPORT_FORMAT, version: 1, items, ...extra });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('AI trees import nested names, exact code, notes, tags, and UTF-8 sizes without touching source', () => {
  const current = freeze(library([folder('destination', 'Projects')]));
  const source = freeze(payload([{ type: 'folder', name: 'Java examples', description: 'Language practice', tags: ['Java'], children: [
    { type: 'file', name: 'Hello.java', content: 'String value = "😀 café";\r\n', notes: 'A welcome example\nKeep the newline.', tags: [' java ', 'Examples'] },
    { type: 'folder', name: 'Empty' },
  ] }]));
  const before = JSON.stringify({ current, source });
  const plan = planLibraryImport(current, source, 'destination');
  assert.equal(plan.baseLibrary, current);
  assert.equal(JSON.stringify({ current, source }), before);
  assert.deepEqual(plan.summary, { filesAdded: 1, filesUpdated: 0, foldersAdded: 2, foldersUpdated: 0, tagsAdded: 2, tagsReused: 0, unchanged: 0 });
  const importedFolder = plan.library.nodes.find(node => node.name === 'Java examples');
  const importedFile = plan.library.nodes.find(node => node.name === 'Hello.java');
  assert.equal(importedFolder.parentId, 'destination');
  assert.equal(importedFile.parentId, importedFolder.id);
  assert.equal(importedFile.content, source.items[0].children[0].content);
  assert.equal(importedFile.sizeBytes, new TextEncoder().encode(importedFile.content).byteLength);
  assert.equal(importedFile.description, source.items[0].children[0].notes);
  assert.equal(plan.library.tags.length, 2);
  assert.deepEqual(plan.changes.map(change => change.path), ['Projects / Java examples', 'Projects / Java examples / Hello.java', 'Projects / Java examples / Empty']);
  assert.equal(plan.importedIds.length, 3);
  assert.ok(decodeLibrary(plan.library));
});

test('tags reuse existing names regardless of case, normalized accents, and spaces', () => {
  const current = library([], [{ id: 'python', name: 'Python' }, { id: 'cafe', name: 'Café' }]);
  const plan = planLibraryImport(current, payload([
    { type: 'file', name: 'one.py', content: '', tags: ['  PYTHON  ', 'CAFE\u0301', 'New   tag', 'new TAG', 'python'] },
    { type: 'file', name: 'two.py', content: '', tags: ['Python', 'NEW TAG'] },
  ]));
  assert.deepEqual(plan.library.tags.map(tag => tag.name), ['Python', 'Café', 'New tag']);
  assert.deepEqual(plan.library.nodes[0].tagIds, ['python', 'cafe', plan.library.tags[2].id]);
  assert.deepEqual(plan.library.nodes[1].tagIds, ['python', plan.library.tags[2].id]);
  assert.equal(plan.summary.tagsReused, 2);
  assert.equal(plan.summary.tagsAdded, 1);
});

test('same paths update code and explicit metadata while preserving local identities and omitted details', () => {
  const rich = { version: 1, runs: [{ text: 'Local explanation', bold: true }] };
  const current = freeze(library([
    folder('examples', 'Examples', null, { description: 'Keep folder notes', tagIds: ['old'] }),
    file('sample', 'sample.py', 'examples', { content: 'old', sizeBytes: 3, description: 'Local explanation', descriptionFormat: rich, tagIds: ['old'], iconId: 'file_type_python', starred: true }),
    file('untouched', 'leave.js', 'examples', { content: 'untouched', sizeBytes: 9 }),
  ], [{ id: 'old', name: 'Old tag' }]));
  const plan = planLibraryImport(current, payload([{ type: 'folder', name: 'EXAMPLES', children: [
    { type: 'file', name: 'SAMPLE.PY', content: 'new', iconId: 'default_file', starred: false },
  ] }]));
  const updated = plan.library.nodes.find(node => node.id === 'sample');
  assert.equal(updated.name, 'sample.py');
  assert.equal(updated.content, 'new');
  assert.equal(updated.createdAt, timestamp);
  assert.equal(updated.starred, true);
  assert.equal(updated.iconId, 'file_type_python');
  assert.equal(updated.description, 'Local explanation');
  assert.deepEqual(updated.descriptionFormat, rich);
  assert.deepEqual(updated.tagIds, ['old']);
  assert.equal(plan.library.nodes[0], current.nodes[0]);
  assert.equal(plan.library.nodes[2], current.nodes[2]);
  assert.equal(plan.summary.filesUpdated, 1);
  assert.equal(plan.summary.unchanged, 1);
  const cleared = planLibraryImport(plan.library, payload([{ type: 'folder', name: 'Examples', tags: [], children: [
    { type: 'file', name: 'sample.py', content: 'new', description: 'New notes', tags: [] },
  ] }]));
  assert.deepEqual(cleared.library.nodes[0].tagIds, []);
  assert.deepEqual(cleared.library.nodes[1].tagIds, []);
  assert.equal('descriptionFormat' in cleared.library.nodes[1], false);
  assert.equal(cleared.summary.foldersUpdated, 1);
});

test('rich descriptions remain valid and formatting-only changes are previewed as updates', () => {
  const description = 'A title\nMore detail';
  const descriptionFormat = { version: 1, runs: [{ text: 'A title', bold: true, fontSize: 24 }, { text: '\nMore detail', italic: true, underline: true }] };
  const current = library([file('sample', 'sample.py', null, { description })]);
  const plan = planLibraryImport(current, payload([{ type: 'file', name: 'sample.py', content: '', description, descriptionFormat }]));
  assert.equal(plan.summary.filesUpdated, 1);
  assert.deepEqual(plan.library.nodes[0].descriptionFormat, descriptionFormat);
  assert.notEqual(plan.library.nodes[0].descriptionFormat, descriptionFormat);
  assert.ok(decodeLibrary(plan.library));
  const omitted = planLibraryImport(plan.library, payload([{ type: 'file', name: 'sample.py', content: '' }]));
  assert.equal(omitted.hasChanges, false);
  assert.deepEqual(omitted.library.nodes[0].descriptionFormat, descriptionFormat);
  const plainReset = planLibraryImport(plan.library, payload([{ type: 'file', name: 'sample.py', content: '', description }]));
  assert.equal(plainReset.summary.filesUpdated, 1);
  assert.equal('descriptionFormat' in plainReset.library.nodes[0], false);
  assert.equal(plainReset.library.nodes[0].description, description);
});

test('reimporting a document is idempotent and leaves timestamps unchanged', () => {
  const source = payload([{ type: 'folder', name: 'Examples', tags: ['Python'], children: [{ type: 'file', name: 'sample.py', content: 'print(1)\n', description: 'Example', tags: ['PYTHON'] }] }]);
  const first = planLibraryImport(library(), source);
  const second = planLibraryImport(first.library, source);
  assert.equal(second.hasChanges, false);
  assert.equal(second.library, first.library);
  assert.equal(second.summary.unchanged, 2);
  assert.equal(second.summary.tagsAdded, 0);
  assert.equal(second.summary.tagsReused, 1);
  assert.deepEqual(second.library.nodes, first.library.nodes);
  assert.deepEqual(second.changes.map(change => change.action), ['unchanged', 'unchanged']);
});

test('file and folder path conflicts reject the whole plan without changing existing data', () => {
  const current = freeze(library([folder('examples', 'Examples'), file('conflict', 'blocked.py', 'examples')]));
  const before = JSON.stringify(current);
  assert.throws(() => planLibraryImport(current, payload([
    { type: 'file', name: 'otherwise-valid.py', content: 'do not partially save', tags: ['New tag'] },
    { type: 'folder', name: 'Examples', children: [{ type: 'folder', name: 'blocked.py', children: [] }] },
  ])), /Examples \/ blocked.py: A file already uses this name/);
  assert.equal(JSON.stringify(current), before);
  assert.throws(() => planLibraryImport(current, payload([{ type: 'file', name: 'Examples', content: '' }])), /A folder already uses this name/);
});

test('JSON parsing accepts a BOM and native backups, preserving new icons and matching tags by names', () => {
  const current = library([], [{ id: 'local-python', name: 'Python' }]);
  const backup = library([
    folder('old-folder-id', 'Examples', null, { iconId: 'folder_type_src', starred: true, tagIds: ['python-upper'] }),
    file('old-file-id', 'sample.py', 'old-folder-id', { content: 'print("😀")', description: 'A note', descriptionFormat: { version: 1, runs: [{ text: 'A note', bold: true }] }, iconId: 'file_type_python', tagIds: ['python-lower', 'python-upper'] }),
  ], [{ id: 'python-upper', name: 'PYTHON' }, { id: 'python-lower', name: 'python' }, { id: 'unused', name: 'Unused' }]);
  const parsed = parseImportText('\uFEFF' + JSON.stringify(backup));
  assert.equal(parsed.format, IMPORT_FORMAT);
  const plan = planLibraryImport(current, parsed);
  const importedFolder = plan.library.nodes.find(node => node.type === 'folder');
  const importedFile = plan.library.nodes.find(node => node.type === 'file');
  assert.notEqual(importedFolder.id, 'old-folder-id');
  assert.notEqual(importedFile.id, 'old-file-id');
  assert.equal(importedFolder.starred, true);
  assert.equal(importedFolder.iconId, 'folder_type_src');
  assert.equal(importedFile.iconId, 'file_type_python');
  assert.deepEqual(importedFile.descriptionFormat, backup.nodes[1].descriptionFormat);
  assert.deepEqual(importedFile.tagIds, ['local-python']);
  assert.deepEqual(plan.library.tags.map(tag => tag.name), ['Python', 'Unused']);
  assert.ok(decodeLibrary(plan.library));
});

test('malformed JSON, schema fields, missing code, invalid tags, and unsafe names are rejected', () => {
  assert.throws(() => parseImportText('{not JSON}'), /not valid JSON/i);
  assert.throws(() => parseImportText('[]'), /CodeRecall import/i);
  for (const entry of [
    { type: 'file', name: 'missing.py' },
    { type: 'file', name: 'number.py', content: 1 },
    { type: 'file', name: '../escape.py', content: '' },
    { type: 'folder', name: '..' },
    { type: 'file', name: 'bad\u0000.py', content: '' },
    { type: 'file', name: 'a.py', content: '', tags: 'Python' },
    { type: 'file', name: 'a.py', content: '', tags: ['bad\nname'] },
    { type: 'file', name: 'a.py', content: '', tags: ['a'.repeat(41)] },
    { type: 'file', name: 'a.py', content: '', description: 'x'.repeat(4001) },
    { type: 'file', name: 'a.py', content: '', notes: 'x', description: 'x' },
    { type: 'file', name: 'a.py', content: '', description: 'x', descriptionFormat: { version: 1, runs: [{ text: 'mismatch' }] } },
    { type: 'file', name: 'a.py', content: '', code: 'wrong field' },
    { type: 'folder', name: 'Folder', children: {} },
    { type: 'folder', name: 'Folder', content: '' },
    { type: 'file', name: 'a.py', content: '', iconId: '../bad.svg' },
  ]) assert.throws(() => parseImportText(JSON.stringify(payload([entry]))), undefined, JSON.stringify(entry));
  assert.throws(() => parseImportText(JSON.stringify(payload([{ type: 'file', name: 'a.py', content: '' }], { mystery: true }))), /Unsupported field "mystery"/);
  assert.throws(() => parseImportText(JSON.stringify(payload([{ type: 'file', name: 'a.py', content: '' }, { type: 'file', name: 'A.PY', content: '' }]))), /Two items in the same folder/);
  assert.throws(() => parseImportText(JSON.stringify(payload([]))), /at least one file or folder/);
});

test('bad destinations and broken native references cannot produce an import plan', () => {
  const source = payload([{ type: 'file', name: 'a.py', content: '' }]);
  assert.throws(() => planLibraryImport(library([file('file', 'file.py')]), source, 'file'), /destination folder/);
  assert.throws(() => planLibraryImport(library(), source, 'missing'), /destination folder/);
  assert.throws(() => planLibraryImport({ version: 2, nodes: [], tags: [{ id: 'x', name: 'X' }, { id: 'y', name: 'x' }] }, source), /current library is invalid/);
  assert.throws(() => parseImportText(JSON.stringify(library([file('file', 'file.py', null, { tagIds: ['missing'] })]))), /tag reference missing/);
  assert.throws(() => parseImportText(JSON.stringify(library([file('file', 'file.py')], [{ id: 'duplicate', name: 'One' }, { id: 'duplicate', name: 'Two' }]))), /duplicate tag IDs/);
  assert.throws(() => parseImportText(JSON.stringify(library([folder('cycle', 'Cycle', 'cycle')]))), /invalid files, folders, or tags/);
});

test('import limits bound bytes, nested trees, and total items before any library mutation', () => {
  assert.throws(() => parseImportText(' '.repeat(MAX_IMPORT_BYTES + 1)), /4 MiB/);
  let tree = { type: 'file', name: 'leaf.py', content: '' };
  for (let index = 0; index <= MAX_IMPORT_DEPTH; index++) tree = { type: 'folder', name: `level-${index}`, children: [tree] };
  assert.throws(() => planLibraryImport(library(), payload([tree])), /nesting cannot exceed/);
  const items = Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, index) => ({ type: 'file', name: `${index}.py`, content: '' }));
  assert.throws(() => planLibraryImport(library(), payload(items)), /more than 5,000/);
  const cyclic = { type: 'folder', name: 'Cycle', children: [] };
  cyclic.children.push(cyclic);
  assert.throws(() => planLibraryImport(library(), payload([cyclic])), /circular references/);
});
