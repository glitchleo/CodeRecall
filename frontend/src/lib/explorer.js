/** Display helpers for the explorer. The persisted library node shape stays unchanged. */
export const ROOT_LABEL = "D:";

export const FILE_KINDS = Object.freeze([
  Object.freeze({ id: "python", label: "Python file", extension: ".py", defaultName: "New Python file.py" }),
  Object.freeze({ id: "javascript", label: "JavaScript file", extension: ".js", defaultName: "New JavaScript file.js" }),
]);

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
const sizeFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const textEncoder = new TextEncoder();

export function getItemType(item) {
  if (item.type === "folder") return "File folder";
  const name = item.name.toLocaleLowerCase("en-US");
  if (name.endsWith(".py")) return "Python file";
  if (name.endsWith(".js")) return "JavaScript file";
  if (name.endsWith(".txt")) return "Text document";
  return "File";
}

function fileSize(item) {
  if (typeof item.sizeBytes === "number" && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0) {
    return item.sizeBytes;
  }
  return typeof item.content === "string" ? textEncoder.encode(item.content).byteLength : 0;
}

/** Compute each folder once, from its leaves upward, without a recursive depth limit. */
export function buildSizeMap(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sizes = new Map();
  const childrenRemaining = new Map();
  for (const node of nodes) {
    sizes.set(node.id, node.type === "folder" ? 0 : fileSize(node));
    if (node.type === "folder") childrenRemaining.set(node.id, 0);
  }
  for (const node of nodes) {
    if (childrenRemaining.has(node.parentId)) {
      childrenRemaining.set(node.parentId, childrenRemaining.get(node.parentId) + 1);
    }
  }
  const ready = nodes.filter((node) => !childrenRemaining.get(node.id));
  for (let index = 0; index < ready.length; index += 1) {
    const node = ready[index];
    const parent = byId.get(node.parentId);
    if (parent?.type !== "folder") continue;
    sizes.set(parent.id, sizes.get(parent.id) + sizes.get(node.id));
    const remaining = childrenRemaining.get(parent.id) - 1;
    childrenRemaining.set(parent.id, remaining);
    if (remaining === 0) ready.push(parent);
  }
  sizes.set(null, nodes.reduce((total, node) => node.parentId === null ? total + sizes.get(node.id) : total, 0));
  return sizes;
}

export function getItemSize(nodes, id) {
  return buildSizeMap(nodes).get(id) ?? 0;
}

function compareName(left, right) {
  return nameCollator.compare(left.name, right.name)
    || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** Keep folders first in both directions, matching the explorer's details view. */
export function sortItems(nodes, items, { key = "name", direction = "asc" } = {}) {
  const multiplier = direction === "desc" ? -1 : 1;
  const sizes = key === "size" ? buildSizeMap(nodes) : null;
  return [...items].sort((left, right) => {
    if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
    let comparison;
    if (key === "createdAt" || key === "updatedAt") {
      comparison = Date.parse(left[key]) - Date.parse(right[key]);
    } else if (key === "type") {
      comparison = nameCollator.compare(getItemType(left), getItemType(right));
    } else if (key === "size") {
      comparison = (sizes.get(left.id) ?? 0) - (sizes.get(right.id) ?? 0);
    } else {
      comparison = nameCollator.compare(left.name, right.name);
    }
    return comparison * multiplier || compareName(left, right);
  });
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
  return `${sizeFormatter.format(bytes / 1024 ** unit)} ${units[unit]}`;
}

export function formatDateTime(value) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : "—";
}

/** Creation adds the chosen extension; renaming is handled by the library model. */
export function makeFileName(value, kind) {
  const fileKind = FILE_KINDS.find((candidate) => candidate.id === (typeof kind === "string" ? kind : kind?.id)) ?? FILE_KINDS[0];
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return fileKind.defaultName;
  return name.toLocaleLowerCase("en-US").endsWith(fileKind.extension) ? name : `${name}${fileKind.extension}`;
}
