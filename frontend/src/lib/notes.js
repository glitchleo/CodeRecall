export const MAX_NOTE_LENGTH = 4000;
export const NOTES_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];
export const DEFAULT_NOTES_FONT_SIZE = 16;
export const MAX_LINK_LENGTH = 1000;
export const MAX_LINK_ID_LENGTH = 200;

// A note reference is a run with `link` (the file's path, kept for portability) and an
// optional `linkId` (the file's id, which survives renames and moves).
const CONTROL = /[\u0000-\u001f\u007f]/u;
const validLink = value => typeof value === 'string' && value.length > 0 && value.length <= MAX_LINK_LENGTH && !CONTROL.test(value);
const validLinkId = value => typeof value === 'string' && value.length > 0 && value.length <= MAX_LINK_ID_LENGTH && !CONTROL.test(value);

export function validNoteText(value) {
  return typeof value === 'string' && value.length <= MAX_NOTE_LENGTH
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

/** The saved document contains text and a small set of marks, never HTML. */
export function validateDescriptionFormat(format, description) {
  if (!format || typeof format !== 'object' || Array.isArray(format)
    || Object.keys(format).some(key => key !== 'version' && key !== 'runs')
    || format.version !== 1 || !Array.isArray(format.runs) || format.runs.length > MAX_NOTE_LENGTH) return false;
  for (const run of format.runs) {
    if (!run || typeof run !== 'object' || Array.isArray(run)
      || Object.keys(run).some(key => !['text', 'bold', 'italic', 'underline', 'fontSize', 'link', 'linkId'].includes(key))
      || !validNoteText(run.text) || !run.text.length) return false;
    if (['bold', 'italic', 'underline'].some(key => key in run && typeof run[key] !== 'boolean')) return false;
    if ('fontSize' in run && !NOTES_FONT_SIZES.includes(run.fontSize)) return false;
    if ('link' in run && !validLink(run.link)) return false;
    if ('linkId' in run && (!('link' in run) || !validLinkId(run.linkId))) return false;
  }
  return validNoteText(description) && format.runs.map(run => run.text).join('') === description;
}

export function normalizeNoteRuns(runs) {
  const normalized = [];
  for (const run of runs) {
    if (!run.text) continue;
    const marks = {
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.underline ? { underline: true } : {}),
      ...(NOTES_FONT_SIZES.includes(run.fontSize) && run.fontSize !== DEFAULT_NOTES_FONT_SIZE ? { fontSize: run.fontSize } : {}),
      ...(validLink(run.link) ? { link: run.link, ...(validLinkId(run.linkId) ? { linkId: run.linkId } : {}) } : {}),
    };
    const last = normalized.at(-1);
    // References are never merged with their neighbours, so each stays its own chip.
    if (last && !last.link && !marks.link && ['bold', 'italic', 'underline', 'fontSize'].every(key => last[key] === marks[key])) last.text += run.text;
    else normalized.push({ text: run.text, ...marks });
  }
  return normalized;
}

export function normalizeNotes(value = {}) {
  const description = typeof value.description === 'string' ? value.description : '';
  const runs = validateDescriptionFormat(value.descriptionFormat, description)
    ? normalizeNoteRuns(value.descriptionFormat.runs)
    : description ? [{ text: description }] : [];
  return { description, descriptionFormat: { version: 1, runs } };
}

export const notesFromItem = item => normalizeNotes(item);
export const equalNotes = (a, b) => JSON.stringify(normalizeNotes(a)) === JSON.stringify(normalizeNotes(b));