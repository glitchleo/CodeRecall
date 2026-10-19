/** The library is a flat tree. `null` represents the library root. */
export const ROOT_ID = null;

const TYPES = new Set(["folder", "file"]);
const keyForName = (name) => name.toLocaleLowerCase("en-US");

function cleanName(value) {
  if (typeof value !== "string") throw new Error("Enter a name.");
  const name = value.trim();
  if (!name || name === "." || name === "..") throw new Error("Enter a valid name.");
  if (/[\\/\p{Cc}]/u.test(name)) throw new Error("Names cannot contain slashes or control characters.");
  if (name.length > 255) throw new Error("Names must be 255 characters or fewer.");
  return name;
}

function requireItem(nodes, id) {
  if (id === ROOT_ID) throw new Error("The library root cannot be changed.");
  const item = nodes.find((node) => node.id === id);
  if (!item) throw new Error("This item no longer exists.");
  return item;
}

function requireParent(nodes, parentId) {
  if (parentId === ROOT_ID) return;
  if (requireItem(nodes, parentId).type !== "folder") throw new Error("Choose a folder as the destination.");
}

function makeId(existingIds) {
  let id;
  do {
    id = globalThis.crypto?.randomUUID?.() ?? `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

function uniqueName(requestedName, type, occupiedNames) {
  const name = cleanName(requestedName);
  if (!occupiedNames.has(keyForName(name))) return name;
  const dot = type === "file" ? name.lastIndexOf(".") : -1;
  const hasExtension = dot > 0;
  const extension = hasExtension ? name.slice(dot) : "";
  const base = hasExtension ? name.slice(0, dot) : name;
  let number = 2;
  let candidate;
  do {
    const suffix = ` (${number++})`;
    candidate = `${base.slice(0, 255 - extension.length - suffix.length)}${suffix}${extension}`;
  } while (occupiedNames.has(keyForName(candidate)));
  return candidate;
}

/** Children are returned in insertion order; callers choose their own sorting. */
export function getChildren(nodes, parentId = ROOT_ID) {
  return nodes.filter((node) => node.parentId === parentId);
}

/** Return folder ancestors from the top level through the item's parent, excluding the item. */
export function getAncestors(nodes, id) {
  if (id === ROOT_ID) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let item = requireItem(nodes, id);
  const ancestors = [];
  const visited = new Set([id]);
  while (item.parentId !== ROOT_ID) {
    item = byId.get(item.parentId);
    if (!item || visited.has(item.id)) throw new Error("The library contains an invalid folder hierarchy.");
    visited.add(item.id);
    ancestors.unshift(item);
  }
  return ancestors;
}

/** Strict ancestry: an item is never its own descendant. */
export function isDescendant(nodes, candidateId, ancestorId) {
  if (candidateId === ROOT_ID || candidateId === ancestorId) return false;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let item = byId.get(candidateId);
  const visited = new Set();
  while (item && !visited.has(item.id)) {
    visited.add(item.id);
    if (item.parentId === ancestorId) return true;
    item = byId.get(item.parentId);
  }
  return false;
}

/** Remove duplicate selections and descendants of selected folders; reject stale IDs. */
export function getTopLevelIds(nodes, ids) {
  const selected = [...new Set(ids)];
  selected.forEach((id) => requireItem(nodes, id));
  const selectedSet = new Set(selected);
  return selected.filter((id) => !getAncestors(nodes, id).some((ancestor) => selectedSet.has(ancestor.id)));
}

/** All mutation helpers are immutable and return the complete next nodes array. */
export function createItem(nodes, { parentId = ROOT_ID, type, name } = {}) {
  if (!TYPES.has(type)) throw new Error("Choose a folder or a text file.");
  requireParent(nodes, parentId);
  const occupied = new Set(getChildren(nodes, parentId).map((node) => keyForName(node.name)));
  const nextName = uniqueName(name ?? (type === "folder" ? "New folder" : "Untitled.txt"), type, occupied);
  const timestamp = new Date().toISOString();
  return [...nodes, {
    id: makeId(new Set(nodes.map((node) => node.id))),
    name: nextName,
    type,
    parentId,
    createdAt: timestamp,
    updatedAt: timestamp,
    starred: false,
  }];
}

export function renameItem(nodes, id, name) {
  const item = requireItem(nodes, id);
  const nextName = cleanName(name);
  if (getChildren(nodes, item.parentId).some((sibling) => sibling.id !== id && keyForName(sibling.name) === keyForName(nextName))) {
    throw new Error("An item with this name already exists in this folder.");
  }
  if (nextName === item.name) return [...nodes];
  const timestamp = new Date().toISOString();
  return nodes.map((node) => node.id === id ? { ...node, name: nextName, updatedAt: timestamp } : node);
}

function validateTransfer(nodes, ids, parentId) {
  requireParent(nodes, parentId);
  const selectedIds = getTopLevelIds(nodes, ids);
  for (const id of selectedIds) {
    const item = requireItem(nodes, id);
    if (item.type === "folder" && (parentId === id || isDescendant(nodes, parentId, id))) {
      throw new Error("A folder cannot be placed inside itself or one of its subfolders.");
    }
  }
  return selectedIds;
}

export function moveItems(nodes, ids, parentId = ROOT_ID) {
  const selectedIds = validateTransfer(nodes, ids, parentId);
  // Items already in the destination keep their names, even if also selected.
  const occupied = new Set(getChildren(nodes, parentId).map((node) => keyForName(node.name)));
  const changes = new Map();
  const timestamp = new Date().toISOString();
  for (const id of selectedIds) {
    const item = requireItem(nodes, id);
    if (item.parentId === parentId) continue;
    const name = uniqueName(item.name, item.type, occupied);
    occupied.add(keyForName(name));
    if (item.parentId !== parentId || item.name !== name) changes.set(id, { ...item, parentId, name, updatedAt: timestamp });
  }
  return nodes.map((node) => changes.get(node.id) ?? node);
}

export function copyItems(nodes, ids, parentId = ROOT_ID) {
  const selectedIds = validateTransfer(nodes, ids, parentId);
  const occupied = new Set(getChildren(nodes, parentId).map((node) => keyForName(node.name)));
  const existingIds = new Set(nodes.map((node) => node.id));
  const copies = [];
  const timestamp = new Date().toISOString();
  const childrenByParent = new Map();
  for (const node of nodes) {
    if (!childrenByParent.has(node.parentId)) childrenByParent.set(node.parentId, []);
    childrenByParent.get(node.parentId).push(node);
  }
  const copyTree = (item, destination, name = item.name) => {
    const copy = { ...item, id: makeId(existingIds), name, parentId: destination, createdAt: timestamp, updatedAt: timestamp };
    copies.push(copy);
    for (const child of childrenByParent.get(item.id) ?? []) copyTree(child, copy.id);
  };
  for (const id of selectedIds) {
    const item = requireItem(nodes, id);
    const name = uniqueName(item.name, item.type, occupied);
    occupied.add(keyForName(name));
    copyTree(item, parentId, name);
  }
  return [...nodes, ...copies];
}

export function deleteItems(nodes, ids) {
  const selectedIds = getTopLevelIds(nodes, ids);
  const removed = new Set(selectedIds);
  for (const node of nodes) {
    if (selectedIds.some((id) => isDescendant(nodes, node.id, id))) removed.add(node.id);
  }
  return nodes.filter((node) => !removed.has(node.id));
}

export function toggleStar(nodes, id) {
  requireItem(nodes, id);
  return nodes.map((node) => node.id === id ? { ...node, starred: !node.starred } : node);
}

/** Validate persisted data before using it: shape, names, unique IDs, parents, and acyclic ancestry. */
export function validateStoredNodes(value) {
  if (!Array.isArray(value)) return false;
  try {
    const byId = new Map();
    const siblingNames = new Map();
    for (const node of value) {
      if (!node || typeof node !== "object" || Array.isArray(node)) return false;
      if (typeof node.id !== "string" || !node.id.trim() || byId.has(node.id)) return false;
      if (!TYPES.has(node.type) || cleanName(node.name) !== node.name || typeof node.starred !== "boolean") return false;
      if (node.parentId !== ROOT_ID && typeof node.parentId !== "string") return false;
      if (![node.createdAt, node.updatedAt].every((date) => typeof date === "string" && Number.isFinite(Date.parse(date)))) return false;
      const names = siblingNames.get(node.parentId) ?? new Set();
      if (names.has(keyForName(node.name))) return false;
      names.add(keyForName(node.name));
      siblingNames.set(node.parentId, names);
      byId.set(node.id, node);
    }
    for (const node of value) {
      const visited = new Set([node.id]);
      let parentId = node.parentId;
      while (parentId !== ROOT_ID) {
        const parent = byId.get(parentId);
        if (!parent || parent.type !== "folder" || visited.has(parentId)) return false;
        visited.add(parentId);
        parentId = parent.parentId;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function createInitialNodes() {
  const createdAt = "2026-10-12T09:00:00.000Z";
  const entries = [
    ["projects", "Projects", "folder", null, true],
    ["notes", "Notes", "folder", null, true],
    ["resources", "Resources", "folder", null, false],
    ["archive", "Archive", "folder", null, false],
    ["getting-started", "Getting started.txt", "file", null, false],
    ["ideas", "Ideas.txt", "file", null, true],
    ["coderecall", "CodeRecall", "folder", "projects", true],
    ["website", "Personal website", "folder", "projects", false],
    ["project-readme", "Readme.txt", "file", "coderecall", false],
    ["project-tasks", "Next steps.txt", "file", "coderecall", false],
    ["website-plan", "Website plan.txt", "file", "website", false],
    ["daily", "Daily notes", "folder", "notes", false],
    ["reading", "Reading list.txt", "file", "notes", true],
    ["daily-note", "Monday.txt", "file", "daily", false],
    ["references", "References", "folder", "resources", false],
    ["useful-links", "Useful links.txt", "file", "resources", false],
    ["design-notes", "Design notes.txt", "file", "references", false],
    ["old-notes", "Old notes.txt", "file", "archive", false],
  ];
  return entries.map(([id, name, type, parentId, starred], index) => ({
    id, name, type, parentId, starred, createdAt,
    updatedAt: new Date(Date.parse(createdAt) + index * 3_600_000).toISOString(),
  }));
}
