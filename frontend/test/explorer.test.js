import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOT_LABEL, FILE_KINDS, getItemType, getItemSize, buildSizeMap,
  sortItems, formatSize, formatDateTime, makeFileName,
} from "../src/lib/explorer.js";

const timestamp = "2026-10-12T09:00:00.000Z";
const item = (id, name, type = "file", parentId = null, extra = {}) => ({
  id, name, type, parentId, createdAt: timestamp, updatedAt: timestamp, starred: false, ...extra,
});
const ids = (nodes) => nodes.map((node) => node.id);

test("file types come from names while folders and existing text files stay compatible", () => {
  assert.equal(ROOT_LABEL, "D:");
  assert.equal(getItemType(item("folder", "Scripts.py", "folder")), "File folder");
  assert.equal(getItemType(item("python", "main.PY")), "Python file");
  assert.equal(getItemType(item("javascript", "app.Js")), "JavaScript file");
  assert.equal(getItemType(item("text", "Getting started.txt")), "Text document");
  assert.equal(getItemType(item("generic", "README")), "File");
  assert.equal(getItemType(item("generic", "script.py.backup")), "File");
});

test("creation uses the chosen file kind, trims names, and preserves an existing extension's case", () => {
  assert.deepEqual(FILE_KINDS.map((kind) => kind.id), ["python", "javascript"]);
  for (const kind of FILE_KINDS) {
    assert.equal(makeFileName("  ", kind), kind.defaultName);
    assert.equal(makeFileName(undefined, kind.id), kind.defaultName);
    assert.equal(makeFileName("  main  ", kind.id), `main${kind.extension}`);
    assert.equal(makeFileName(`  MAIN${kind.extension.toUpperCase()}  `, kind), `MAIN${kind.extension.toUpperCase()}`);
  }
  assert.equal(makeFileName("app.test", "javascript"), "app.test.js");
});

test("sizes count UTF-8 bytes, allow explicit future sizes, and total nested folder descendants once", () => {
  const nodes = [
    item("outer", "Outer", "folder"),
    item("inner", "Inner", "folder", "outer"),
    item("empty", "empty.py", "file", "inner"),
    item("unicode", "unicode.js", "file", "inner", { content: "aé😀" }),
    item("stored", "stored.py", "file", "outer", { sizeBytes: 2048, content: "ignored" }),
    item("invalid", "invalid.py", "file", null, { sizeBytes: -1, content: "ab" }),
    item("infinite", "infinite.py", "file", null, { sizeBytes: Infinity, content: "c" }),
    item("zero", "zero.py", "file", null, { sizeBytes: 0, content: "ignored" }),
    item("empty-folder", "Empty", "folder"),
  ];
  const sizes = buildSizeMap(nodes);
  assert.equal(sizes.get("empty"), 0);
  assert.equal(sizes.get("unicode"), 7);
  assert.equal(sizes.get("inner"), 7);
  assert.equal(sizes.get("outer"), 2055);
  assert.equal(sizes.get("empty-folder"), 0);
  assert.equal(sizes.get("invalid"), 2);
  assert.equal(sizes.get("infinite"), 1);
  assert.equal(sizes.get("zero"), 0);
  assert.equal(getItemSize(nodes, "outer"), 2055);
  assert.equal(getItemSize(nodes, null), 2058);
  assert.equal(getItemSize(nodes, "missing"), 0);
});

test("folder size calculation supports deep trees without recursive stack limits", () => {
  const nodes = Array.from({ length: 12_000 }, (_, index) => item(`folder-${index}`, `Folder ${index}`, "folder", index === 0 ? null : `folder-${index - 1}`));
  nodes.push(item("file", "main.py", "file", "folder-11999", { sizeBytes: 9 }));
  assert.equal(buildSizeMap(nodes).get("folder-0"), 9);
});

test("name sorting uses natural numbers in either direction and keeps folders first without mutation", () => {
  const nodes = Object.freeze([
    item("file10", "file10.py"), item("folder10", "Folder 10", "folder"),
    item("file2", "File2.py"), item("folder2", "folder 2", "folder"),
    item("file1", "file1.py"),
  ].map(Object.freeze));
  assert.deepEqual(ids(sortItems(nodes, nodes, { key: "name", direction: "asc" })), ["folder2", "folder10", "file1", "file2", "file10"]);
  assert.deepEqual(ids(sortItems(nodes, nodes, { key: "name", direction: "desc" })), ["folder10", "folder2", "file10", "file2", "file1"]);
  assert.deepEqual(ids(nodes), ["file10", "folder10", "file2", "folder2", "file1"]);
});

for (const key of ["createdAt", "updatedAt"]) {
  test(`${key} sorting compares instants rather than timestamp strings in both directions`, () => {
    const nodes = [
      item("later", "Alpha.py", "file", null, { [key]: "2026-01-01T00:30:00-05:00" }),
      item("earlier", "Zulu.py", "file", null, { [key]: "2026-01-01T02:00:00+02:00" }),
      item("folder", "Folder", "folder", null, { [key]: "2026-12-01T00:00:00Z" }),
    ];
    assert.deepEqual(ids(sortItems(nodes, nodes, { key, direction: "asc" })), ["folder", "earlier", "later"]);
    assert.deepEqual(ids(sortItems(nodes, nodes, { key, direction: "desc" })), ["folder", "later", "earlier"]);
  });
}

test("type sorting uses displayed labels and gives matching types deterministic natural name ties", () => {
  const nodes = [
    item("python10", "script10.py"), item("text", "notes.txt"),
    item("javascript", "app.js"), item("folder", "Zebra", "folder"),
    item("python2", "Script2.py"), item("generic", "README"),
  ];
  assert.deepEqual(ids(sortItems(nodes, nodes, { key: "type", direction: "asc" })), ["folder", "generic", "javascript", "python2", "python10", "text"]);
  assert.deepEqual(ids(sortItems(nodes, nodes, { key: "type", direction: "desc" })), ["folder", "text", "python2", "python10", "javascript", "generic"]);
});

test("size sorting compares byte counts, totals folders, and keeps name ties stable in both directions", () => {
  const nodes = [
    item("large-folder", "Large", "folder"), item("small-folder", "Small", "folder"),
    item("large-child", "child.py", "file", "large-folder", { sizeBytes: 1024 }),
    item("small-child", "child.js", "file", "small-folder", { sizeBytes: 1 }),
    item("large", "a.js", "file", null, { sizeBytes: 100 }),
    item("small", "z.py", "file", null, { sizeBytes: 9 }),
    item("empty-b", "B.py"), item("empty-a", "a.py"),
  ];
  const rootItems = nodes.filter((node) => node.parentId === null);
  assert.deepEqual(ids(sortItems(nodes, rootItems, { key: "size", direction: "asc" })), ["small-folder", "large-folder", "empty-a", "empty-b", "small", "large"]);
  assert.deepEqual(ids(sortItems(nodes, rootItems, { key: "size", direction: "desc" })), ["large-folder", "small-folder", "large", "small", "empty-a", "empty-b"]);
});

test("equal timestamp values use natural name ties independent of direction", () => {
  const nodes = [item("ten", "file10.py"), item("two", "file2.py")];
  for (const direction of ["asc", "desc"]) {
    assert.deepEqual(ids(sortItems(nodes, nodes, { key: "createdAt", direction })), ["two", "ten"]);
  }
});

test("metadata formatting shows byte units and the actual local date and time", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(12), "12 B");
  assert.equal(formatSize(1024), "1 KB");
  assert.equal(formatSize(1024 ** 2), "1 MB");
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  assert.equal(formatDateTime(timestamp), formatter.format(new Date(timestamp)));
  assert.equal(formatDateTime("invalid"), "—");
});
