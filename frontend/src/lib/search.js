/** Intent search uses metadata and folder context; query word order never affects ranking. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function normalize(value) {
  return String(value ?? "")
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, "$1 $2")
    .normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");
}

export function getSearchTerms(query) {
  return [...new Set(normalize(query).match(/[\p{L}\p{N}]+/gu) ?? [])].sort();
}

function field(value, kind) {
  const text = normalize(value);
  return { text, words: text.match(/[\p{L}\p{N}]+/gu) ?? [], kind };
}

const WEIGHTS = {
  name: [120, 95, 55], tags: [110, 85, 50], description: [45, 32, 18],
  "folder name": [40, 30, 16], "folder tags": [38, 28, 15], "folder description": [14, 10, 5],
};

function termMatch(term, current) {
  const weights = WEIGHTS[current.kind];
  if (current.words.includes(term)) return weights[0];
  if (current.words.some((word) => word.startsWith(term))) return weights[1];
  return current.text.includes(term) ? weights[2] : 0;
}

function compareResults(left, right) {
  return right.score - left.score
    || (left.item.type !== right.item.type ? (left.item.type === "folder" ? -1 : 1) : 0)
    || collator.compare(left.item.name, right.item.name)
    || (left.item.id < right.item.id ? -1 : left.item.id > right.item.id ? 1 : 0);
}

/** Score the library once per query; reuse the index for navigation and every card preview. */
export function buildSearchIndex(nodes, tags, { query = "", tagIds = [] } = {}) {
  const rawQuery = typeof query === "string" ? query.trim() : "";
  const tagOnly = rawQuery.startsWith("#");
  const terms = getSearchTerms(tagOnly ? rawQuery.slice(1) : rawQuery);
  const selectedTags = new Set(Array.isArray(tagIds) ? tagIds : []);
  const hasSearch = terms.length > 0 || tagOnly || selectedTags.size > 0;
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
  const children = new Map();
  for (const item of nodes) {
    if (!children.has(item.parentId)) children.set(item.parentId, []);
    children.get(item.parentId).push(item);
  }

  // A breadth-first traversal shares each folder's context with all its children.
  // It also gives a reverse order for propagating descendant matches without recursion.
  const ordered = [...(children.get(null) ?? [])];
  const state = new Map();
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    const parent = state.get(item.parentId);
    const ownTags = item.tagIds ?? [];
    const ownFields = [
      ...(!tagOnly ? [field(item.name, "name"), field(item.description, "description")] : []),
      ...ownTags.filter((id) => tagNames.has(id)).map((id) => field(tagNames.get(id), "tags")),
    ];
    const parentFields = parent?.inheritedFields ?? [];
    const effectiveTags = new Set([...(parent?.effectiveTags ?? []), ...ownTags]);
    const directWeights = terms.map((term) => Math.max(0, ...ownFields.map((current) => termMatch(term, current))));
    const inheritedWeights = terms.map((term) => Math.max(0, ...parentFields.map((current) => termMatch(term, current))));
    const weights = terms.map((_, termIndex) => Math.max(directWeights[termIndex], inheritedWeights[termIndex]));
    const filtersMatch = [...selectedTags].every((id) => effectiveTags.has(id));
    const textMatch = weights.every((weight) => weight > 0) && (!tagOnly || terms.length > 0 || effectiveTags.size > 0);
    const matched = filtersMatch && textMatch;
    const matchedBy = new Set();
    if (matched) {
      for (const current of [...ownFields, ...parentFields]) {
        if (terms.some((term) => termMatch(term, current) > 0)) matchedBy.add(current.kind);
      }
      if (selectedTags.size || (tagOnly && terms.length === 0)) matchedBy.add("tags");
    }
    let score = matched ? weights.reduce((sum, weight) => sum + weight, 0) || 1 : 0;
    if (matched && terms.length > 0) {
      const name = item.type === "file" ? item.name.replace(/\.[^.]+$/u, "") : item.name;
      const nameTerms = getSearchTerms(name);
      if (!tagOnly && nameTerms.length === terms.length && terms.every((term) => nameTerms.includes(term))) score += 240;
      if (item.type === "folder" && directWeights.every((weight) => weight > 0)) score += 120;
    }
    const inheritedFields = item.type === "folder" ? [
      ...parentFields,
      ...ownFields.map((current) => ({ ...current, kind: `folder ${current.kind}` })),
    ] : parentFields;
    state.set(item.id, { item, score, matchedBy: [...matchedBy], inheritedFields, effectiveTags });
    if (item.type === "folder") ordered.push(...(children.get(item.id) ?? []));
  }

  // A folder is a useful result when it leads to a match, but the matching file
  // stays above a folder that matches only through that file.
  if (hasSearch) {
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const current = state.get(ordered[index].id);
      const parent = state.get(current.item.parentId);
      if (!parent || current.score <= 0) continue;
      const descendantScore = current.score * 0.78;
      if (descendantScore > parent.score) {
        parent.score = descendantScore;
        parent.matchedBy = ["descendants"];
      }
    }
  }
  const ranked = [...state.values()].map(({ item, score, matchedBy }) => ({ item, score, matchedBy })).sort(compareResults);
  const rankedChildren = new Map();
  for (const result of ranked) {
    if (!rankedChildren.has(result.item.parentId)) rankedChildren.set(result.item.parentId, []);
    rankedChildren.get(result.item.parentId).push(result);
  }
  const matches = ranked.filter(({ score }) => score > 0);
  const validFolder = (id) => id === null || byId.get(id)?.type === "folder";
  return {
    /** All direct children, with matching children first. Safe to slice for card previews. */
    getChildren(folderId = null) {
      return validFolder(folderId) ? [...(rankedChildren.get(folderId) ?? [])] : [];
    },
    /** Empty searches browse direct children; active searches find descendants in scope. */
    search({ folderId = null, directOnly = false } = {}) {
      if (!validFolder(folderId)) return [];
      if (directOnly || !hasSearch) return [...(rankedChildren.get(folderId) ?? [])];
      if (folderId === null) return [...matches];
      const descendants = new Set();
      const pending = [...(children.get(folderId) ?? [])];
      for (let index = 0; index < pending.length; index += 1) {
        const current = pending[index];
        descendants.add(current.id);
        if (current.type === "folder") pending.push(...(children.get(current.id) ?? []));
      }
      return matches.filter(({ item }) => descendants.has(item.id));
    },
  };
}

/**
 * Search by all query terms across item metadata and ancestor folders. Selected
 * tags also inherit from folders. directOnly keeps nonmatches visible for browsing.
 * For multiple views or card previews, buildSearchIndex avoids repeated scoring.
 */
export function searchLibrary(nodes, tags, { query = "", folderId = null, tagIds = [], directOnly = false } = {}) {
  return buildSearchIndex(nodes, tags, { query, tagIds }).search({ folderId, directOnly });
}
