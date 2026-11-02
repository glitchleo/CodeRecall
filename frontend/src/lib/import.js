import { validateStoredNodes } from './library.js';
import { cleanTagName, decodeLibrary, encodeLibrary } from './tags.js';
import { normalizeNotes, validNoteText, validateDescriptionFormat } from './notes.js';

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 5000;
export const MAX_IMPORT_DEPTH = 64;
export const IMPORT_FORMAT = 'coderecall-import';

const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nameKey = name => name.toLocaleLowerCase('en-US');
const tagKey = name => name.normalize('NFC').toLocaleLowerCase('en-US');
const encoder = new TextEncoder();

function fail(message, path = '') {
  throw new Error(path ? `${path}: ${message}` : message);
}

function checkBytes(value) {
  let json;
  try { json = typeof value === 'string' ? value : JSON.stringify(value); }
  catch { fail('The import must be a JSON document without circular references.'); }
  if (typeof json !== 'string') fail('Choose a valid JSON import file.');
  if (encoder.encode(json).byteLength > MAX_IMPORT_BYTES) fail('The JSON import exceeds the 4 MiB limit.');
}

function checkFields(value, allowed, path) {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) fail(`Unsupported field "${unknown}". Use the CodeRecall JSON import format.`, path);
}

function cleanItemName(value, path) {
  if (typeof value !== 'string') fail('Enter a file or folder name.', path);
  const name = value.trim();
  if (!name || name === '.' || name === '..' || /[\\/\p{Cc}]/u.test(name) || name.length > 255) {
    fail('Names must be 1–255 characters, with no slashes or control characters.', path);
  }
  return name;
}

function cleanTagNames(value, path) {
  if (!Array.isArray(value)) fail('Tags must be a list of tag names.', path);
  const unique = new Map();
  for (const requested of value) {
    let name;
    try { name = cleanTagName(requested); }
    catch (error) { fail(error.message, path); }
    if (!unique.has(tagKey(name))) unique.set(tagKey(name), name);
  }
  return [...unique.values()];
}

function normalizePortable(value) {
  if (!object(value) || value.format !== IMPORT_FORMAT || value.version !== 1) {
    fail('Use a CodeRecall import with format "coderecall-import" and version 1, or a version 2 library backup.');
  }
  checkFields(value, ['format', 'version', 'items', 'tags'], 'Import');
  if (!Array.isArray(value.items) || !value.items.length) fail('The import must contain at least one file or folder in items.');
  let count = 0;
  const visit = (items, parentPath, depth) => {
    if (depth > MAX_IMPORT_DEPTH) fail(`Folder nesting cannot exceed ${MAX_IMPORT_DEPTH} levels.`, parentPath);
    const siblings = new Set();
    return items.map((entry, index) => {
      if (++count > MAX_IMPORT_ITEMS) fail(`The import cannot contain more than ${MAX_IMPORT_ITEMS.toLocaleString('en-US')} files and folders.`);
      const location = parentPath ? `${parentPath} / item ${index + 1}` : `Item ${index + 1}`;
      if (!object(entry) || !['file', 'folder'].includes(entry.type)) fail('Each item needs type "file" or "folder".', location);
      const name = cleanItemName(entry.name, location);
      const path = parentPath ? `${parentPath} / ${name}` : name;
      if (siblings.has(nameKey(name))) fail('Two items in the same folder have this name. Names are matched without capitalization.', path);
      siblings.add(nameKey(name));
      const common = ['type', 'name', 'description', 'notes', 'tags', 'iconId', 'starred'];
      checkFields(entry, [...common, ...(entry.type === 'folder' ? ['children'] : ['content', 'descriptionFormat'])], path);
      const next = { type: entry.type, name };
      if (owns(entry, 'description') && owns(entry, 'notes')) fail('Use description or notes, not both.', path);
      if (owns(entry, 'description') || owns(entry, 'notes')) {
        const description = owns(entry, 'description') ? entry.description : entry.notes;
        if (!validNoteText(description)) fail('Notes must be text of at most 4,000 characters, without control characters.', path);
        next.description = description;
      }
      if (owns(entry, 'descriptionFormat')) {
        if (!owns(next, 'description') || !validateDescriptionFormat(entry.descriptionFormat, next.description)) {
          fail('Description formatting must contain valid text runs matching the description.', path);
        }
        next.descriptionFormat = normalizeNotes({ description: next.description, descriptionFormat: entry.descriptionFormat }).descriptionFormat;
      }
      if (owns(entry, 'tags')) next.tags = cleanTagNames(entry.tags, path);
      if (owns(entry, 'iconId')) {
        if (typeof entry.iconId !== 'string' || (entry.iconId !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(entry.iconId))) fail('Choose a valid icon catalog ID.', path);
        next.iconId = entry.iconId;
      }
      if (owns(entry, 'starred')) {
        if (typeof entry.starred !== 'boolean') fail('Starred must be true or false.', path);
        next.starred = entry.starred;
      }
      if (entry.type === 'file') {
        if (!owns(entry, 'content') || typeof entry.content !== 'string') fail('Files require a content string, including "" for an empty file.', path);
        next.content = entry.content;
      } else {
        if (owns(entry, 'children') && !Array.isArray(entry.children)) fail('Folder children must be a list of files and folders.', path);
        next.children = visit(entry.children ?? [], path, depth + 1);
      }
      return next;
    });
  };
  return {
    format: IMPORT_FORMAT, version: 1,
    items: visit(value.items, '', 0),
    ...(owns(value, 'tags') ? { tags: cleanTagNames(value.tags, 'Import') } : {}),
  };
}

function fromNativeBackup(value) {
  if (!object(value) || value.version !== 2 || !validateStoredNodes(value.nodes) || !Array.isArray(value.tags)) {
    fail('This library backup contains invalid files, folders, or tags.');
  }
  if (value.nodes.length > MAX_IMPORT_ITEMS) fail(`The import cannot contain more than ${MAX_IMPORT_ITEMS.toLocaleString('en-US')} files and folders.`);
  const catalog = new Map();
  for (const tag of value.tags) {
    if (!object(tag) || typeof tag.id !== 'string' || !tag.id.trim() || catalog.has(tag.id)) fail('The backup contains invalid or duplicate tag IDs.');
    let name;
    try { name = cleanTagName(tag.name); }
    catch (error) { fail(error.message, 'Backup tags'); }
    catalog.set(tag.id, name);
  }
  const children = new Map();
  for (const node of value.nodes) {
    if ((node.tagIds ?? []).some(id => !catalog.has(id))) fail('The backup contains a tag reference missing from its catalog.', node.name);
    const group = children.get(node.parentId) ?? [];
    group.push(node);
    children.set(node.parentId, group);
  }
  const visit = (parentId, depth) => {
    if (depth > MAX_IMPORT_DEPTH) fail(`Folder nesting cannot exceed ${MAX_IMPORT_DEPTH} levels.`);
    return (children.get(parentId) ?? []).map(node => ({
      type: node.type, name: node.name,
      ...(owns(node, 'description') ? { description: node.description } : {}),
      ...(owns(node, 'descriptionFormat') ? { descriptionFormat: node.descriptionFormat } : {}),
      tags: (node.tagIds ?? []).map(id => catalog.get(id)),
      ...(owns(node, 'iconId') ? { iconId: node.iconId } : {}),
      starred: node.starred,
      ...(node.type === 'file' ? { content: node.content ?? '' } : { children: visit(node.id, depth + 1) }),
    }));
  };
  return normalizePortable({ format: IMPORT_FORMAT, version: 1, items: visit(null, 0), tags: [...catalog.values()] });
}

function normalizePayload(value) {
  checkBytes(value);
  return object(value) && value.version === 2 ? fromNativeBackup(value) : normalizePortable(value);
}

/** Both AI-friendly trees and local version 2 backups become the same import plan. */
export function parseImportText(text) {
  if (typeof text !== 'string') fail('Choose a JSON text file.');
  checkBytes(text);
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch { fail('This file is not valid JSON. Check quotes, commas, and escaped line breaks.'); }
  return normalizePayload(parsed);
}

function makeId(ids, prefix) {
  let id;
  do { id = globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  while (ids.has(id));
  ids.add(id);
  return id;
}

/** A pure preview: nothing in the current library or payload is mutated. */
export function planLibraryImport(library, payload, parentId = null) {
  const current = decodeLibrary(library);
  if (!current) fail('The current library is invalid. Restore a valid library before importing.');
  const incoming = normalizePayload(payload);
  const byId = new Map(current.nodes.map(node => [node.id, node]));
  if (parentId !== null && byId.get(parentId)?.type !== 'folder') fail('Choose an existing destination folder.');
  const destination = [];
  for (let ancestor = byId.get(parentId); ancestor; ancestor = byId.get(ancestor.parentId)) destination.unshift(ancestor.name);
  const nodes = [...current.nodes];
  const nodeIndexes = new Map(nodes.map((node, index) => [node.id, index]));
  const siblingMaps = new Map();
  for (const node of nodes) {
    if (!siblingMaps.has(node.parentId)) siblingMaps.set(node.parentId, new Map());
    siblingMaps.get(node.parentId).set(nameKey(node.name), node);
  }
  const tags = [...current.tags];
  const originalTags = new Map(tags.map(tag => [tagKey(tag.name), tag]));
  const tagNames = new Map(originalTags);
  const usedTagNames = new Set();
  const nodeIds = new Set(nodes.map(node => node.id));
  const tagIds = new Set(tags.map(tag => tag.id));
  const summary = { filesAdded: 0, filesUpdated: 0, foldersAdded: 0, foldersUpdated: 0, tagsAdded: 0, tagsReused: 0, unchanged: 0 };
  const changes = [];
  const importedIds = [];
  const timestamp = new Date().toISOString();

  const resolveTags = names => names.map(name => {
    const key = tagKey(name);
    let tag = tagNames.get(key);
    if (!tag) {
      tag = { id: makeId(tagIds, 'tag'), name };
      tags.push(tag);
      tagNames.set(key, tag);
      summary.tagsAdded += 1;
    } else if (!usedTagNames.has(key) && originalTags.has(key)) summary.tagsReused += 1;
    usedTagNames.add(key);
    return tag.id;
  });
  resolveTags(incoming.tags ?? []);
  const visit = (entries, destinationId, parts) => {
    if (!siblingMaps.has(destinationId)) siblingMaps.set(destinationId, new Map());
    const siblings = siblingMaps.get(destinationId);
    for (const entry of entries) {
      const pathParts = [...parts, entry.name];
      const path = pathParts.join(' / ');
      const existing = siblings.get(nameKey(entry.name));
      if (existing && existing.type !== entry.type) fail(`A ${existing.type} already uses this name. Rename the incoming item or choose another destination.`, path);
      const assignments = owns(entry, 'tags') ? resolveTags(entry.tags) : undefined;
      let node;
      let action;
      if (!existing) {
        node = {
          id: makeId(nodeIds, 'item'), type: entry.type, name: entry.name, parentId: destinationId,
          createdAt: timestamp, updatedAt: timestamp, starred: entry.starred ?? false,
          ...(entry.type === 'file' ? { content: entry.content, sizeBytes: encoder.encode(entry.content).byteLength } : {}),
          ...(owns(entry, 'description') ? { description: entry.description } : {}),
          ...(owns(entry, 'descriptionFormat') ? { descriptionFormat: entry.descriptionFormat } : {}),
          ...(owns(entry, 'iconId') ? { iconId: entry.iconId } : {}),
          ...(assignments ? { tagIds: assignments } : {}),
        };
        nodeIndexes.set(node.id, nodes.length);
        nodes.push(node);
        action = 'add';
        summary[entry.type === 'file' ? 'filesAdded' : 'foldersAdded'] += 1;
      } else {
        const patch = {};
        if (entry.type === 'file') {
          if ((existing.content ?? '') !== entry.content) patch.content = entry.content;
          const sizeBytes = encoder.encode(entry.content).byteLength;
          if ((existing.sizeBytes ?? 0) !== sizeBytes) patch.sizeBytes = sizeBytes;
        }
        if (owns(entry, 'description')) {
          if ((existing.description ?? '') !== entry.description) patch.description = entry.description;
          if (owns(entry, 'descriptionFormat')) {
            if (JSON.stringify(existing.descriptionFormat) !== JSON.stringify(entry.descriptionFormat)) patch.descriptionFormat = entry.descriptionFormat;
          } else if (owns(existing, 'descriptionFormat')) patch.descriptionFormat = undefined;
        }
        if (assignments && (assignments.length !== (existing.tagIds ?? []).length || assignments.some(id => !existing.tagIds?.includes(id)))) patch.tagIds = assignments;
        if (Object.keys(patch).length) {
          node = { ...existing, ...patch, updatedAt: timestamp };
          if (node.descriptionFormat === undefined) delete node.descriptionFormat;
          nodes[nodeIndexes.get(existing.id)] = node;
          action = 'update';
          summary[entry.type === 'file' ? 'filesUpdated' : 'foldersUpdated'] += 1;
        } else {
          node = existing;
          action = 'unchanged';
          summary.unchanged += 1;
        }
      }
      siblings.set(nameKey(entry.name), node);
      importedIds.push(node.id);
      changes.push({ path, type: entry.type, action });
      if (entry.type === 'folder') visit(entry.children, node.id, pathParts);
    }
  };
  visit(incoming.items, parentId, destination);
  const hasChanges = summary.filesAdded + summary.filesUpdated + summary.foldersAdded + summary.foldersUpdated + summary.tagsAdded > 0;
  return {
    baseLibrary: library,
    library: hasChanges ? encodeLibrary(nodes, tags) : Array.isArray(library) ? current : library,
    summary, changes, importedIds, hasChanges,
  };
}
