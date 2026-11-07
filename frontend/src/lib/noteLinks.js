/** Links from file notes to other library files. Nodes look like { id, type, name, parentId }. */
export { MAX_LINK_LENGTH } from "./notes.js";
const key = (name) => String(name).normalize("NFC").toLocaleLowerCase("en-US");

/** "D:/a/b.js", "D: / a / b.js", "\a\b.js" and quoted Windows paths all work. */
export function splitLibraryPath(input) {
  const parts = String(input ?? "").trim().replace(/^["']+|["']+$/g, "").split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length && /^[a-z]:$/i.test(parts[0])) parts.shift();
  return parts;
}

export function pathOfNode(nodes, id) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names = [];
  const seen = new Set();
  for (let node = byId.get(id); node && !seen.has(node.id); node = byId.get(node.parentId)) {
    seen.add(node.id);
    names.unshift(node.name);
  }
  return names.length ? ["D:", ...names].join("/") : "";
}

/**
 * input: a path string or { path, id }. The id wins while the file exists (it survives
 * renames and moves); the path is the fallback after JSON import, which creates new ids.
 * Returns { id, name, path } for a FILE, otherwise null.
 */
export function resolveNoteLink(nodes, input) {
  const link = typeof input === "string" ? { path: input } : input || {};
  const byId = link.id ? nodes.find((node) => node.id === link.id) : null;
  let found = byId?.type === "file" ? byId : null;
  if (!found && link.path) {
    const parts = splitLibraryPath(link.path);
    if (parts.length) {
      const children = new Map(nodes.map((node) => [`${node.parentId ?? ""}\u0000${key(node.name)}`, node]));
      let current = null;
      for (const part of parts) {
        current = children.get(`${current?.id ?? ""}\u0000${key(part)}`);
        if (!current) break;
      }
      if (current?.type === "file") found = current;
    }
  }
  return found ? { id: found.id, name: found.name, path: pathOfNode(nodes, found.id) } : null;
}