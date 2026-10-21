import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanTagName, validateTags, createTag, assignFileTags, decodeLibrary,
  encodeLibrary, getFileTags, matchesFileSearch, matchesTagFilter, assignItemTags, getItemTags,
} from "../src/lib/tags.js";
import {
  ROOT_ID, copyItems, deleteItems, moveItems, renameItem, updateFileContent, validateStoredNodes,
} from "../src/lib/library.js";

const timestamp = "2026-10-12T09:00:00.000Z";
const item = (id, name, type = "file", parentId = ROOT_ID, extra = {}) => ({
  id, name, type, parentId, createdAt: timestamp, updatedAt: timestamp, starred: false, ...extra,
});
const catalog = Object.freeze([
  Object.freeze({ id: "algorithms", name: "Algorithms" }),
  Object.freeze({ id: "python", name: "Python" }),
  Object.freeze({ id: "unicode", name: "Shënime 中文" }),
]);
const freeze = (nodes) => Object.freeze(nodes.map((node) => Object.freeze({
  ...node, ...(node.tagIds ? { tagIds: Object.freeze([...node.tagIds]) } : {}),
})));
const byId = (nodes, id) => nodes.find((node) => node.id === id);

test("custom tags clean whitespace, preserve Unicode, and have stable IDs independent of their names", () => {
  const existing = Object.freeze([]);
  const first = createTag(existing, "  Shënime   中文  ");
  assert.equal(first.tag.name, "Shënime 中文");
  assert.ok(first.tag.id);
  assert.notEqual(first.tag.id, first.tag.name);
  assert.deepEqual(existing, []);
  assert.equal(first.tags[0], first.tag);
  const second = createTag(first.tags, "Python / web");
  assert.equal(second.tags.length, 2);
  assert.notEqual(second.tag.id, first.tag.id);
  assert.equal(second.tags[0], first.tag);
  assert.equal(validateTags(second.tags), true);
  assert.equal(cleanTagName("e\u0301"), "é");
  assert.equal(cleanTagName("😀".repeat(40)), "😀".repeat(40));
});

test("tag creation rejects duplicate names, blank names, controls, invalid catalogs, and overly long names", () => {
  assert.throws(() => createTag(catalog, "  pYtHoN  "), /already exists/i);
  const accented = createTag([], "café");
  assert.throws(() => createTag(accented.tags, "CAFE\u0301"), /already exists/i);
  for (const name of ["", "   ", null, undefined, 1, {}, [], "bad\nname", "bad\u0000name", "bad\tname", "a".repeat(41)]) {
    assert.throws(() => createTag([], name));
  }
  assert.throws(() => createTag([{ id: "", name: "Broken" }], "Other"), /invalid/i);
});

test("tag catalog validation rejects malformed entries, duplicate IDs and noncanonical names", () => {
  assert.equal(validateTags([]), true);
  assert.equal(validateTags(catalog), true);
  for (const invalid of [
    null, {}, "tags", [null], [[]], [{ id: " ", name: "Blank ID" }],
    [{ id: 1, name: "Number ID" }], [{ id: "a", name: "  Spaces " }],
    [{ id: "a", name: "Two  spaces" }], [{ id: "a", name: "bad\nname" }],
    [{ id: "a", name: "x".repeat(41) }], [{ id: "a" }],
    [{ id: "a", name: "One" }, { id: "a", name: "Two" }],
    [{ id: "a", name: "One" }, { id: "b", name: "ONE" }],
  ]) assert.equal(validateTags(invalid), false, JSON.stringify(invalid));
});

test("assigning and removing tags is immutable, deduplicates selections, and preserves saved code", () => {
  const nodes = freeze([
    item("file", "example.py", "file", ROOT_ID, { content: "print('é')\n", sizeBytes: 12, starred: true }),
    item("other", "other.js"),
  ]);
  const selected = ["python", "algorithms", "python"];
  const tagged = assignFileTags(nodes, "file", selected, catalog);
  const file = byId(tagged, "file");
  assert.deepEqual(file.tagIds, ["python", "algorithms"]);
  assert.deepEqual(selected, ["python", "algorithms", "python"]);
  assert.notEqual(file.tagIds, selected);
  assert.equal(file.content, nodes[0].content);
  assert.equal(file.sizeBytes, nodes[0].sizeBytes);
  assert.equal(file.starred, true);
  assert.notEqual(file.updatedAt, timestamp);
  assert.equal(file.createdAt, timestamp);
  assert.equal(tagged[1], nodes[1]);
  assert.equal("tagIds" in nodes[0], false);
  assert.equal(assignFileTags(tagged, "file", ["algorithms", "python"], catalog), tagged);
  const cleared = assignFileTags(tagged, "file", [], catalog);
  assert.deepEqual(cleared[0].tagIds, []);
  assert.deepEqual(tagged[0].tagIds, ["python", "algorithms"]);
  assert.equal(assignFileTags(cleared, "file", [], catalog), cleared);
  assert.equal(validateStoredNodes(tagged), true);
});

test("assigning tags rejects missing items, unknown IDs, and malformed selections before mutation", () => {
  const nodes = freeze([item("file", "example.py"), item("folder", "Folder", "folder")]);
  const before = JSON.stringify(nodes);
  assert.throws(() => assignFileTags(nodes, "missing", [], catalog), /no longer exists/i);
  assert.throws(() => assignFileTags(nodes, ROOT_ID, [], catalog), /no longer exists/i);
  assert.throws(() => assignFileTags(nodes, "file", ["python", "unknown"], catalog), /no longer exists/i);
  assert.throws(() => assignFileTags(nodes, "file", [], null), /invalid/i);
  for (const ids of [null, "python", {}, [null], [""], [" "], [1]]) {
    assert.throws(() => assignFileTags(nodes, "file", ids, catalog), /valid tags/i);
  }
  assert.equal(JSON.stringify(nodes), before);
});

test("legacy storage migrates atomically to a versioned envelope without changing code, metadata, or empty files", () => {
  const nodes = freeze([
    item("folder", "Snippets", "folder"),
    item("file", "example.py", "file", "folder", { content: "print('中文 😀')\n", sizeBytes: 21 }),
    item("legacy", "empty.js", "file", "folder"),
  ]);
  const before = JSON.stringify(nodes);
  const migrated = decodeLibrary(nodes);
  assert.deepEqual(migrated, { version: 2, nodes, tags: [] });
  assert.equal(migrated.nodes, nodes);
  assert.equal(JSON.stringify(nodes), before);
  assert.equal("content" in migrated.nodes[2], false);
  const saved = JSON.parse(JSON.stringify(encodeLibrary(migrated.nodes, migrated.tags)));
  assert.deepEqual(decodeLibrary(saved), migrated);
  assert.deepEqual(decodeLibrary([]), { version: 2, nodes: [], tags: [] });
});

test("versioned storage persists catalog and assignments together and accepts unused tags", () => {
  const nodes = freeze([item("file", "example.py", "file", ROOT_ID, { tagIds: ["python"], content: "print(42)" })]);
  const envelope = encodeLibrary(nodes, catalog);
  assert.equal(envelope.nodes, nodes);
  assert.equal(envelope.tags, catalog);
  assert.deepEqual(decodeLibrary(JSON.parse(JSON.stringify(envelope))), envelope);
  const deleted = deleteItems(nodes, ["file"]);
  assert.deepEqual(encodeLibrary(deleted, catalog), { version: 2, nodes: [], tags: catalog });
});

test("stored tag validation rejects orphan IDs, invalid selections, and unsupported envelopes", () => {
  const file = item("file", "example.py");
  for (const tagIds of [null, undefined, {}, "python", [1], [""], [" "], ["python", "python"]]) {
    const nodes = [{ ...file, tagIds }];
    assert.equal(validateStoredNodes(nodes), false);
    assert.equal(decodeLibrary({ version: 2, nodes, tags: catalog }), null);
  }
  assert.equal(validateStoredNodes([{ ...file, tagIds: [] }]), true);
  assert.equal(validateStoredNodes([{ ...file, tagIds: ["python"] }]), true);
  assert.equal(validateStoredNodes([item("folder", "Folder", "folder", ROOT_ID, { tagIds: [] })]), true);
  for (const invalid of [
    null, {}, "[]", 1, { version: 1, nodes: [file], tags: [] },
    { version: 3, nodes: [file], tags: [] }, { version: 2, nodes: [file] },
    { version: 2, nodes: {}, tags: [] }, { version: 2, nodes: [file], tags: null },
    { version: 2, nodes: [{ ...file, tagIds: ["unknown"] }], tags: catalog },
    [{ ...file, tagIds: ["python"] }],
  ]) assert.equal(decodeLibrary(invalid), null, JSON.stringify(invalid));
  assert.throws(() => encodeLibrary([{ ...file, tagIds: ["missing"] }], catalog), /invalid/i);
});

test("copy, move, rename, save, and deletion retain each file's tags and independent assignments", () => {
  const nodes = freeze([
    item("folder", "Snippets", "folder"), item("destination", "Destination", "folder"),
    item("file", "example.py", "file", "folder", { tagIds: ["python", "algorithms"], content: "print(42)" }),
  ]);
  const copied = copyItems(nodes, ["folder"], "destination");
  const copiedFile = copied.slice(nodes.length).find((node) => node.type === "file");
  assert.deepEqual(copiedFile.tagIds, ["python", "algorithms"]);
  const reassigned = assignFileTags(copied, copiedFile.id, ["unicode"], catalog);
  assert.deepEqual(byId(reassigned, "file").tagIds, ["python", "algorithms"]);
  assert.deepEqual(byId(copied, copiedFile.id).tagIds, ["python", "algorithms"]);
  assert.deepEqual(byId(reassigned, copiedFile.id).tagIds, ["unicode"]);
  const edited = updateFileContent(reassigned, copiedFile.id, "print('changed')");
  const renamed = renameItem(edited, copiedFile.id, "changed.py");
  const moved = moveItems(renamed, [copiedFile.id], ROOT_ID);
  assert.deepEqual(byId(moved, copiedFile.id).tagIds, ["unicode"]);
  assert.equal(byId(moved, copiedFile.id).content, "print('changed')");
  assert.equal(byId(moved, copiedFile.id).parentId, ROOT_ID);
  const deleted = deleteItems(moved, ["folder"]);
  assert.ok(byId(deleted, copiedFile.id));
  assert.deepEqual(encodeLibrary(deleted, catalog).tags, catalog);
});

test("search finds file names or custom tag names case insensitively, with # for tag-only searches", () => {
  const file = item("file", "search.py", "file", ROOT_ID, { tagIds: ["algorithms", "unicode"] });
  for (const query of ["search", "SEARCH.PY", " AlgoRITHm ", "ënime", "中文", "#algorithms", " # SHËNIME ", "#", ""]) {
    assert.equal(matchesFileSearch(file, query, catalog), true, query);
  }
  for (const query of ["python", "#search.py", "#python", "unrelated"]) {
    assert.equal(matchesFileSearch(file, query, catalog), false, query);
  }
  assert.equal(matchesFileSearch(item("folder", "Algorithms", "folder"), "algorithm", catalog), true);
  assert.equal(matchesFileSearch(item("folder", "Algorithms", "folder"), "#algorithm", catalog), false);
  assert.equal(matchesFileSearch(item("untagged", "empty.py"), "#", catalog), false);
});

test("resolved tags ignore stale references and multiple selected filters require every tag", () => {
  const file = item("file", "example.py", "file", ROOT_ID, { tagIds: ["python", "algorithms", "unknown"] });
  assert.deepEqual(getFileTags(file, catalog).map((tag) => tag.id), ["algorithms", "python"]);
  assert.deepEqual(getFileTags(item("empty", "empty.py"), catalog), []);
  assert.deepEqual(getFileTags(null, catalog), []);
  assert.deepEqual(getFileTags(item("folder", "Folder", "folder"), catalog), []);
  assert.equal(matchesTagFilter(file, []), true);
  assert.equal(matchesTagFilter(file, ["python"]), true);
  assert.equal(matchesTagFilter(file, ["python", "algorithms"]), true);
  assert.equal(matchesTagFilter(file, ["python", "unicode"]), false);
  assert.equal(matchesTagFilter(item("empty", "empty.py"), ["python"]), false);
  assert.equal(matchesTagFilter(item("folder", "Folder", "folder"), []), true);
  assert.equal(matchesTagFilter(item("folder", "Folder", "folder"), ["python"]), false);
});

test("folder tags share the catalog, persist in version 2, and keep compatibility helpers working", () => {
  const nodes = freeze([
    item("folder", "Math", "folder", ROOT_ID, { description: "Arithmetic helpers", iconId: "folder_type_math" }),
    item("file", "addition.py", "file", "folder", { content: "def add(a, b): return a + b" }),
  ]);
  const tagged = assignItemTags(nodes, "folder", ["algorithms", "python"], catalog);
  assert.deepEqual(getItemTags(tagged[0], catalog).map((tag) => tag.id), ["algorithms", "python"]);
  assert.deepEqual(getFileTags(tagged[0], catalog), getItemTags(tagged[0], catalog));
  assert.equal(matchesFileSearch(tagged[0], "helpers algorithms", catalog), true);
  assert.equal(matchesFileSearch(tagged[0], "#python", catalog), true);
  assert.equal(matchesTagFilter(tagged[0], ["algorithms", "python"]), true);
  const saved = encodeLibrary(tagged, catalog);
  assert.equal(saved.version, 2);
  assert.deepEqual(decodeLibrary(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(saved.nodes[1].content, nodes[1].content);
  assert.equal(saved.nodes[0].description, "Arithmetic helpers");
  assert.equal(saved.nodes[0].iconId, "folder_type_math");
  assert.deepEqual(assignFileTags(tagged, "folder", [], catalog)[0].tagIds, []);
  assert.equal(decodeLibrary({ version: 2, nodes: [{ ...nodes[0], tagIds: ["missing"] }], tags: catalog }), null);
});
