import { validateStoredNodes } from "./library.js";

const nameKey = (name) => name.normalize("NFC").toLocaleLowerCase("en-US");
const validId = (id) => typeof id === "string" && Boolean(id.trim());

/** Tags are user names, separate from their stable IDs and file names. */
export function cleanTagName(value) {
  if (typeof value !== "string") throw new Error("Enter a tag name.");
  if (/\p{Cc}/u.test(value)) throw new Error("Tag names cannot contain control characters.");
  const name = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!name) throw new Error("Enter a tag name.");
  if (Array.from(name).length > 40) throw new Error("Tag names must be 40 characters or fewer.");
  return name;
}

export function validateTags(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  const names = new Set();
  try {
    for (const tag of value) {
      if (!tag || typeof tag !== "object" || Array.isArray(tag)) return false;
      if (!validId(tag.id) || ids.has(tag.id)) return false;
      if (cleanTagName(tag.name) !== tag.name || names.has(nameKey(tag.name))) return false;
      ids.add(tag.id);
      names.add(nameKey(tag.name));
    }
    return true;
  } catch {
    return false;
  }
}

/** A new catalog and tag are returned together so callers can commit atomically. */
export function createTag(tags, requestedName) {
  if (!validateTags(tags)) throw new Error("The tag list is invalid.");
  const name = cleanTagName(requestedName);
  if (tags.some((tag) => nameKey(tag.name) === nameKey(name))) throw new Error("A tag with this name already exists.");
  const ids = new Set(tags.map((tag) => tag.id));
  let id;
  do {
    id = globalThis.crypto?.randomUUID?.() ?? `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  } while (ids.has(id));
  const tag = { id, name };
  return { tags: [...tags, tag], tag };
}

/** Replace one file's tag selection; each selected ID must exist in the catalog. */
export function assignFileTags(nodes, fileId, selectedIds, tags) {
  const file = nodes.find((node) => node.id === fileId);
  if (!file) throw new Error("This file no longer exists.");
  if (file.type !== "file") throw new Error("Choose a file to tag.");
  if (!validateTags(tags)) throw new Error("The tag list is invalid.");
  if (!Array.isArray(selectedIds) || !selectedIds.every(validId)) throw new Error("Choose valid tags.");
  const registered = new Set(tags.map((tag) => tag.id));
  const tagIds = [...new Set(selectedIds)];
  if (tagIds.some((id) => !registered.has(id))) throw new Error("One of these tags no longer exists.");
  const existingIds = file.tagIds ?? [];
  if (tagIds.length === existingIds.length && existingIds.every((id) => tagIds.includes(id))) return nodes;
  const updatedAt = new Date().toISOString();
  return nodes.map((node) => node.id === fileId ? { ...node, tagIds, updatedAt } : node);
}

/** Resolve only registered tags; display remains safe when given a stale file. */
export function getFileTags(file, tags) {
  if (file?.type !== "file" || !file.tagIds?.length) return [];
  const selected = new Set(file.tagIds);
  return tags.filter((tag) => selected.has(tag.id));
}

/** A leading # searches tags only. Ordinary searches include names and tags. */
export function matchesFileSearch(node, query, tags) {
  const raw = typeof query === "string" ? query.trim() : "";
  if (!raw) return true;
  const tagOnly = raw.startsWith("#");
  const search = nameKey(tagOnly ? raw.slice(1).trim() : raw);
  if (!tagOnly && nameKey(node.name).includes(search)) return true;
  const fileTags = getFileTags(node, tags);
  return fileTags.some((tag) => nameKey(tag.name).includes(search));
}

/** Multiple active filters require every tag; folders remain visible with no filter. */
export function matchesTagFilter(node, selectedIds) {
  if (!selectedIds.length) return true;
  if (node.type !== "file") return false;
  const assigned = new Set(node.tagIds ?? []);
  return selectedIds.every((id) => assigned.has(id));
}

/** Migrate legacy arrays without changing any code; reject broken tag references. */
export function decodeLibrary(value) {
  if (Array.isArray(value)) {
    if (!validateStoredNodes(value) || value.some((node) => node.tagIds?.length)) return null;
    return { version: 2, nodes: value, tags: [] };
  }
  if (!value || typeof value !== "object" || value.version !== 2) return null;
  if (!validateStoredNodes(value.nodes) || !validateTags(value.tags)) return null;
  const registered = new Set(value.tags.map((tag) => tag.id));
  if (value.nodes.some((node) => (node.tagIds ?? []).some((id) => !registered.has(id)))) return null;
  return { version: 2, nodes: value.nodes, tags: value.tags };
}

/** Store the tree and its tag catalog in a single localStorage write. */
export function encodeLibrary(nodes, tags) {
  const library = decodeLibrary({ version: 2, nodes, tags });
  if (!library) throw new Error("The library data is invalid.");
  return library;
}
