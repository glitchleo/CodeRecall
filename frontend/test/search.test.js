import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, getSearchTerms, searchLibrary } from "../src/lib/search.js";

const timestamp = "2026-10-12T09:00:00.000Z";
const item = (id, name, type = "file", parentId = null, extra = {}) => Object.freeze({
  id, name, type, parentId, starred: false, createdAt: timestamp, updatedAt: timestamp, ...extra,
});
const tags = Object.freeze([
  { id: "algorithms", name: "Algorithms" }, { id: "python", name: "Python" },
  { id: "numbers", name: "Number operations" },
]);
const nodes = Object.freeze([
  item("math", "Math", "folder", null, { description: "Reusable arithmetic snippets", tagIds: ["algorithms"] }),
  item("addition", "addition.py", "file", "math", { description: "Sum two numbers", tagIds: ["python"] }),
  item("advanced", "Advanced", "folder", "math"),
  item("matrix", "matrix.py", "file", "advanced", { description: "Multiply rows and columns", tagIds: ["numbers"] }),
  item("other", "Other", "folder"),
  item("math-file", "math.js"),
  item("readme", "Readme.txt", "file", "other", { description: "Application guide" }),
  item("cafe", "caféTools.js", "file", "other", { description: "Format accented labels" }),
]);
const search = (query, options = {}) => searchLibrary(nodes, tags, { query, ...options });
const ids = (results) => results.map(({ item: result }) => result.id);

test("word order, repeated terms and capitalization never change search scores or order", () => {
  assert.deepEqual(search("math addition"), search("addition math"));
  assert.deepEqual(search("math addition"), search("  ADDITION math math "));
  assert.equal(search("math addition")[0].item.id, "addition");
  assert.deepEqual(search("math addition")[0].matchedBy, ["name", "folder name"]);
  assert.deepEqual(getSearchTerms("caféTools CAFÉ tools"), ["cafe", "tools"]);
  assert.equal(search("cafe tools")[0].item.id, "cafe");
});

test("a broad folder name ranks its folder above matching files and contextual descendants", () => {
  const results = search("math");
  assert.equal(results[0].item.id, "math");
  assert.ok(results[0].score > results.find(({ item: result }) => result.id === "math-file").score);
  assert.ok(ids(results).includes("addition"));
  assert.ok(ids(results).includes("matrix"));
  assert.ok(!ids(results).includes("readme"));
});

test("all query words must match but can span names, descriptions and inherited folder tags", () => {
  assert.equal(search("algorithms sum python")[0].item.id, "addition");
  assert.ok(search("arithmetic rows").some(({ item: result }) => result.id === "matrix"));
  assert.deepEqual(search("addition missingword"), []);
  assert.deepEqual(search("guide python"), []);
  assert.equal(search("#algorithms python")[0].item.id, "addition");
  assert.deepEqual(search("#addition"), []);
});

test("folders propagate matching descendants and previews rank a nested result before unrelated children", () => {
  const results = search("columns");
  assert.deepEqual(ids(results), ["matrix", "advanced", "math"]);
  assert.deepEqual(results[1].matchedBy, ["descendants"]);
  const preview = search("columns", { folderId: "math", directOnly: true });
  assert.deepEqual(ids(preview), ["advanced", "addition"]);
  assert.ok(preview[0].score > 0);
  assert.equal(preview[1].score, 0);
  assert.deepEqual(ids(search("columns", { folderId: "advanced", directOnly: true })), ["matrix"]);
});

test("folder navigation keeps nonmatches visible while a global search filters the selected scope", () => {
  assert.deepEqual(ids(search("")), ["math", "other", "math-file"]);
  assert.deepEqual(ids(search("", { folderId: "math" })), ["advanced", "addition"]);
  assert.deepEqual(ids(search("math", { folderId: "math" })), ["advanced", "addition", "matrix"]);
  assert.deepEqual(ids(search("unmatched", { folderId: "math", directOnly: true })), ["advanced", "addition"]);
  assert.deepEqual(search("math", { folderId: "other" }), []);
  assert.deepEqual(search("math", { folderId: "missing" }), []);
  assert.deepEqual(search("math", { folderId: "addition" }), []);
});

test("selected tag filters require every tag across the item and its ancestor folders", () => {
  const results = search("", { tagIds: ["algorithms", "python"] });
  assert.deepEqual(ids(results), ["addition", "math"]);
  assert.deepEqual(ids(search("sum", { tagIds: ["algorithms", "numbers"] })), []);
  assert.deepEqual(ids(search("", { folderId: "math", directOnly: true, tagIds: ["python"] })), ["addition", "advanced"]);
  assert.deepEqual(search("", { tagIds: ["unknown"] }), []);
});

test("search leaves immutable nodes and tag catalogs intact and supports deep trees without recursion", () => {
  const before = JSON.stringify({ nodes, tags });
  search("math addition");
  assert.equal(JSON.stringify({ nodes, tags }), before);
  const deep = [];
  for (let index = 0; index < 1500; index += 1) {
    deep.push(item(`folder-${index}`, `Level ${index}`, "folder", index === 0 ? null : `folder-${index - 1}`));
  }
  deep.push(item("needle", "needle.py", "file", "folder-1499"));
  assert.equal(searchLibrary(deep, [], { query: "needle" })[0].item.id, "needle");
});

test("one shared index preserves wrapper ranking and scope while reusing ranked children for previews", () => {
  for (const options of [{ query: "" }, { query: "math addition" }, { query: "columns" },
    { query: "", tagIds: ["python"] }, { query: "#algorithms", tagIds: ["numbers"] }]) {
    const index = buildSearchIndex(nodes, tags, options);
    for (const folderId of [null, "math", "advanced", "other", "missing", "addition"]) {
      assert.deepEqual(index.search({ folderId }), searchLibrary(nodes, tags, { ...options, folderId }));
      assert.deepEqual(index.search({ folderId, directOnly: true }), searchLibrary(nodes, tags, { ...options, folderId, directOnly: true }));
      assert.deepEqual(index.getChildren(folderId), index.search({ folderId, directOnly: true }));
    }
  }
  const index = buildSearchIndex(nodes, tags, { query: "columns" });
  assert.deepEqual(ids(index.getChildren("math")), ["advanced", "addition"]);
  const preview = index.getChildren("math");
  preview.reverse();
  assert.deepEqual(ids(index.getChildren("math")), ["advanced", "addition"]);
  assert.equal(index.search()[0].item.id, "matrix");
  assert.equal(index.search({ folderId: "advanced" })[0].item.id, "matrix");
});
