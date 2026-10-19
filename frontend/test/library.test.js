import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOT_ID, createInitialNodes, createItem, renameItem, moveItems, copyItems,
  deleteItems, toggleStar, getChildren, getAncestors, isDescendant,
  getTopLevelIds, validateStoredNodes, updateFileContent,
} from "../src/lib/library.js";

const byId = (nodes, id) => nodes.find((node) => node.id === id);
const timestamp = "2026-10-12T09:00:00.000Z";
const item = (id, name, type = "folder", parentId = ROOT_ID) => ({
  id, name, type, parentId, createdAt: timestamp, updatedAt: timestamp, starred: false,
});
const freeze = (nodes) => Object.freeze(nodes.map((node) => Object.freeze(node)));

test("initial library is valid, fresh per call, and supports root-to-parent breadcrumbs", () => {
  const nodes = createInitialNodes();
  assert.equal(validateStoredNodes(nodes), true);
  assert.deepEqual(getChildren(nodes).filter((node) => node.type === "folder").map((node) => node.name), ["Projects", "Notes", "Resources", "Archive"]);
  assert.deepEqual(getAncestors(nodes, "project-readme").map((node) => node.id), ["projects", "coderecall"]);
  assert.deepEqual(getAncestors(nodes, ROOT_ID), []);
  assert.equal(isDescendant(nodes, "project-readme", "projects"), true);
  assert.equal(isDescendant(nodes, "projects", "projects"), false);
  assert.equal(isDescendant(nodes, "projects", "coderecall"), false);
  nodes[0].name = "Changed";
  assert.equal(createInitialNodes()[0].name, "Projects");
});

test("creation permits arbitrary folder nesting and empty text files with unique sibling names", () => {
  const nodes = freeze([item("folder", "Notes"), item("file", "Draft.txt", "file", "folder")]);
  const withFolder = createItem(nodes, { parentId: "folder", type: "folder", name: "Research" });
  const folder = withFolder.at(-1);
  const withFile = createItem(withFolder, { parentId: folder.id, type: "file" });
  assert.equal(withFile.at(-1).name, "Untitled.txt");
  assert.equal(withFile.at(-1).parentId, folder.id);
  assert.equal(withFile.at(-1).content, "");
  assert.equal(withFile.at(-1).sizeBytes, 0);
  assert.equal("content" in folder, false);
  const duplicate = createItem(nodes, { parentId: "folder", type: "file", name: "draft.TXT" });
  assert.equal(duplicate.at(-1).name, "draft (2).TXT");
  assert.equal(nodes.length, 2);
  assert.equal(validateStoredNodes(withFile), true);
  assert.throws(() => createItem(nodes, { parentId: "file", type: "folder" }), /destination/i);
  assert.throws(() => createItem(nodes, { parentId: "missing", type: "file" }), /no longer exists/i);
  assert.throws(() => createItem(nodes, { type: "unsupported" }), /folder or a text file/i);
});

test("rename trims names, allows case changes, and rejects invalid or conflicting names", () => {
  const nodes = freeze([item("first", "First"), item("second", "Second")]);
  assert.equal(byId(renameItem(nodes, "first", "  FIRST  "), "first").name, "FIRST");
  for (const invalid of ["", "   ", ".", "..", "a/b", "a\\b", "bad\nname", "bad\u0000name", "x".repeat(256), null]) {
    assert.throws(() => renameItem(nodes, "first", invalid));
    assert.throws(() => createItem(nodes, { type: "file", name: invalid === null ? "a/b" : invalid }));
  }
  assert.throws(() => renameItem(nodes, "first", "SECOND"), /already exists/i);
  assert.equal(nodes[0].name, "First");
  assert.throws(() => renameItem(nodes, ROOT_ID, "Root"), /root/i);
});

test("moving folders keeps descendants attached and resolves collisions across multiple selections", () => {
  const nodes = freeze([
    item("source-a", "Source A"), item("source-b", "Source B"), item("destination", "Destination"),
    item("first", "Draft.txt", "file", "source-a"), item("second", "draft.txt", "file", "source-b"),
    item("existing", "DRAFT.txt", "file", "destination"),
    item("nested", "Nested", "folder", "source-a"), item("leaf", "Leaf.txt", "file", "nested"),
  ]);
  const moved = moveItems(nodes, ["first", "second"], "destination");
  assert.equal(byId(moved, "first").name, "Draft (2).txt");
  assert.equal(byId(moved, "second").name, "draft (3).txt");
  assert.equal(byId(moved, "first").parentId, "destination");
  const folderMoved = moveItems(moved, ["nested", "leaf", "nested"], "destination");
  assert.equal(byId(folderMoved, "nested").parentId, "destination");
  assert.equal(byId(folderMoved, "leaf").parentId, "nested");
  assert.equal(byId(nodes, "first").parentId, "source-a");
  assert.equal(validateStoredNodes(folderMoved), true);
});

test("moving within the same parent preserves names, including multi item selections", () => {
  const nodes = freeze([item("a", "Same.txt", "file"), item("b", "Other.txt", "file")]);
  assert.deepEqual(moveItems(nodes, ["a", "b"], ROOT_ID), nodes);
  const withIncoming = [...nodes, item("source", "Source"), item("incoming", "Same.txt", "file", "source")];
  const moved = moveItems(withIncoming, ["incoming", "a"], ROOT_ID);
  assert.equal(byId(moved, "a").name, "Same.txt");
  assert.equal(byId(moved, "incoming").name, "Same (2).txt");
});

test("copying a tree creates independent IDs, preserves structure, and deduplicates selected descendants", () => {
  const nodes = freeze([
    item("project", "Project"), item("folder", "Research", "folder", "project"),
    item("file", "Notes.txt", "file", "folder"), item("destination", "Destination"),
  ]);
  const copied = copyItems(nodes, ["project", "folder", "file", "project"], "destination");
  assert.equal(copied.length, nodes.length + 3);
  const copyRoot = getChildren(copied, "destination")[0];
  const copyFolder = getChildren(copied, copyRoot.id)[0];
  const copyFile = getChildren(copied, copyFolder.id)[0];
  assert.equal(copyRoot.name, "Project");
  assert.equal(copyFolder.name, "Research");
  assert.equal(copyFile.name, "Notes.txt");
  assert.equal(new Set(copied.map((node) => node.id)).size, copied.length);
  assert.equal(validateStoredNodes(copied), true);
  const copiedAgain = copyItems(copied, ["project"], ROOT_ID);
  assert.equal(getChildren(copiedAgain).at(-1).name, "Project (2)");
  assert.equal(nodes.length, 4);
});

test("transfer rejects self, descendant, nonfolder, root, and stale selections atomically", () => {
  const nodes = freeze([
    item("parent", "Parent"), item("child", "Child", "folder", "parent"),
    item("leaf", "Notes.txt", "file", "child"), item("other", "Other"),
  ]);
  const before = JSON.stringify(nodes);
  for (const transfer of [moveItems, copyItems]) {
    assert.throws(() => transfer(nodes, ["parent"], "parent"), /inside itself/i);
    assert.throws(() => transfer(nodes, ["other", "parent"], "child"), /inside itself/i);
    assert.throws(() => transfer(nodes, ["other"], "leaf"), /destination/i);
    assert.throws(() => transfer(nodes, ["other", "missing"], ROOT_ID), /no longer exists/i);
    assert.throws(() => transfer(nodes, [ROOT_ID], "other"), /root/i);
    assert.equal(JSON.stringify(nodes), before);
  }
});

test("deletion removes entire trees once and retains unrelated items", () => {
  const nodes = freeze(createInitialNodes());
  assert.deepEqual(getTopLevelIds(nodes, ["projects", "project-readme", "coderecall", "projects", "notes"]), ["projects", "notes"]);
  const deleted = deleteItems(nodes, ["projects", "coderecall", "project-readme"]);
  assert.equal(byId(deleted, "projects"), undefined);
  assert.equal(byId(deleted, "project-readme"), undefined);
  assert.equal(byId(deleted, "website-plan"), undefined);
  assert.ok(byId(deleted, "notes"));
  assert.equal(validateStoredNodes(deleted), true);
  assert.equal(validateStoredNodes(deleteItems(nodes, getChildren(nodes).map((node) => node.id))), true);
  assert.throws(() => deleteItems(nodes, [ROOT_ID]), /root/i);
});

test("star toggles immutably", () => {
  const nodes = freeze([item("file", "Notes.txt", "file")]);
  const starred = toggleStar(nodes, "file");
  assert.equal(starred[0].starred, true);
  assert.equal(nodes[0].starred, false);
  assert.equal(toggleStar(starred, "file")[0].starred, false);
  assert.throws(() => toggleStar(nodes, ROOT_ID), /root/i);
});

test("editing file content updates UTF-8 size and modified time without changing metadata or other nodes", () => {
  const nodes = freeze([
    item("folder", "Snippets"),
    { ...item("file", "hello.py", "file", "folder"), starred: true },
    item("other", "other.js", "file"),
  ]);
  const before = Date.now();
  const updated = updateFileContent(nodes, "file", "aé😀\n");
  const after = Date.now();
  const file = byId(updated, "file");
  assert.notEqual(updated, nodes);
  assert.notEqual(file, byId(nodes, "file"));
  assert.equal(updated[0], nodes[0]);
  assert.equal(updated[2], nodes[2]);
  assert.equal(file.content, "aé😀\n");
  assert.equal(file.sizeBytes, 8);
  assert.ok(Date.parse(file.updatedAt) >= before && Date.parse(file.updatedAt) <= after);
  assert.deepEqual(
    { ...file, content: undefined, sizeBytes: undefined, updatedAt: timestamp },
    { ...nodes[1], content: undefined, sizeBytes: undefined },
  );
  assert.equal("content" in nodes[1], false);
  assert.equal(validateStoredNodes(updated), true);
});

test("unchanged content retains the snapshot and timestamp, including legacy empty files", () => {
  const legacy = freeze([item("file", "empty.js", "file")]);
  assert.equal(updateFileContent(legacy, "file", ""), legacy);
  const current = freeze([{ ...item("file", "text.js", "file"), content: "hello", sizeBytes: 5 }]);
  assert.equal(updateFileContent(current, "file", "hello"), current);
  assert.equal(current[0].updatedAt, timestamp);
  const empty = updateFileContent(current, "file", "");
  assert.equal(empty[0].content, "");
  assert.equal(empty[0].sizeBytes, 0);
});

test("editing rejects non-files, missing IDs, and non-string content without mutation", () => {
  const nodes = freeze([item("folder", "Folder"), item("file", "file.py", "file")]);
  assert.throws(() => updateFileContent(nodes, ROOT_ID, "text"), /root/i);
  assert.throws(() => updateFileContent(nodes, "missing", "text"), /no longer exists/i);
  assert.throws(() => updateFileContent(nodes, "folder", "text"), /choose a file/i);
  for (const content of [undefined, null, 42, {}, [], new String("text")]) {
    assert.throws(() => updateFileContent(nodes, "file", content), /must be text/i);
  }
  assert.equal("content" in nodes[1], false);
});

test("copied snippet trees keep their content and can be edited independently through library operations", () => {
  const nodes = freeze([
    item("folder", "Snippets"), item("destination", "Destination"),
    { ...item("file", "hello.py", "file", "folder"), content: "print('Hi')\n", sizeBytes: 12 },
  ]);
  const copied = copyItems(nodes, ["folder"], "destination");
  const copyFolder = getChildren(copied, "destination")[0];
  const copyFile = getChildren(copied, copyFolder.id)[0];
  assert.equal(copyFile.content, nodes[2].content);
  assert.equal(copyFile.sizeBytes, nodes[2].sizeBytes);
  const edited = updateFileContent(copied, copyFile.id, "print('Changed')\n");
  assert.equal(byId(edited, "file").content, "print('Hi')\n");
  assert.equal(byId(copied, copyFile.id).content, "print('Hi')\n");
  const renamed = renameItem(edited, copyFile.id, "changed.py");
  const moved = moveItems(renamed, [copyFile.id], ROOT_ID);
  assert.equal(byId(moved, copyFile.id).content, "print('Changed')\n");
  assert.equal(byId(moved, copyFile.id).sizeBytes, 17);
  assert.equal(byId(moved, copyFile.id).parentId, ROOT_ID);
  const deleted = deleteItems(moved, [copyFile.id]);
  assert.equal(byId(deleted, copyFile.id), undefined);
  assert.equal(byId(moved, copyFile.id).content, "print('Changed')\n");
  assert.equal(validateStoredNodes(moved), true);
});

test("stored files accept legacy snapshots and validate optional content and size fields", () => {
  const legacy = item("file", "legacy.py", "file");
  assert.equal(validateStoredNodes([legacy]), true);
  assert.equal(validateStoredNodes([{ ...legacy, content: "" }]), true);
  assert.equal(validateStoredNodes([{ ...legacy, content: "é", sizeBytes: 2 }]), true);
  assert.equal(validateStoredNodes([{ ...legacy, sizeBytes: 0 }]), true);
  for (const content of [undefined, null, 0, [], {}, false]) {
    assert.equal(validateStoredNodes([{ ...legacy, content }]), false);
  }
  for (const sizeBytes of [undefined, null, "1", -1, 0.5, Infinity, NaN]) {
    assert.equal(validateStoredNodes([{ ...legacy, sizeBytes }]), false);
  }
  assert.equal(validateStoredNodes([{ ...item("folder", "Folder"), content: "" }]), false);
});

test("stored data validation rejects corrupt shapes, orphaned trees, collisions, and cycles", () => {
  const valid = [item("parent", "Parent"), item("child", "Child", "folder", "parent")];
  assert.equal(validateStoredNodes([]), true);
  for (const invalid of [
    null, {}, [null], ["folder"],
    [item("duplicate", "One"), item("duplicate", "Two")],
    [item("a", "Same"), item("b", "SAME")],
    [item("orphan", "Orphan", "folder", "missing")],
    [item("self", "Self", "folder", "self")],
    [item("a", "A", "folder", "b"), item("b", "B", "folder", "a")],
    [item("file", "File.txt", "file"), item("child", "Child", "folder", "file")],
    [{ ...valid[0], id: "" }], [{ ...valid[0], parentId: undefined }],
    [{ ...valid[0], starred: "yes" }], [{ ...valid[0], type: "link" }],
    [{ ...valid[0], name: "  Name  " }], [{ ...valid[0], name: "bad/name" }],
    [{ ...valid[0], createdAt: "invalid" }], [{ ...valid[0], updatedAt: 123 }],
  ]) assert.equal(validateStoredNodes(invalid), false, JSON.stringify(invalid));
  assert.equal(validateStoredNodes(valid), true);
});
