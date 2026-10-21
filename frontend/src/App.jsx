import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createInitialNodes, createItem, renameItem, moveItems, copyItems, deleteItems, toggleStar, getChildren, getAncestors, isDescendant, updateFileContent, updateItemMetadata } from './lib/library.js';
import { FILE_KINDS, ROOT_LABEL, getItemType, buildSizeMap, sortItems, formatSize, formatDateTime, makeFileName } from './lib/explorer.js';
import CodeEditor from './CodeEditor.jsx';
import TagPicker, { TagBadges } from './TagPicker.jsx';
import { createTag, assignFileTags, decodeLibrary, encodeLibrary, getFileTags, matchesFileSearch, matchesTagFilter } from './lib/tags.js';
import ItemIcon from './ItemIcon.jsx';
import SearchMode, { SearchIcon } from './SearchMode.jsx';
import MetadataPanel from './MetadataPanel.jsx';
const CloudLibrary = lazy(() => import('./CloudLibrary.jsx'));

const STORAGE_KEY = 'coderecall.library.v1';
const PREFERENCES_KEY = 'coderecall.explorer.preferences.v1';
// Root descriptors stay separate from folders so additional roots can be introduced later.
const ROOTS = [{ id: 'primary', label: ROOT_LABEL, parentId: null }];
const COLUMNS = [
  ['name', 'Name', 'name-cell'],
  ['updatedAt', 'Date modified', 'date-cell'],
  ['createdAt', 'Date created', 'date-cell'],
  ['type', 'Type', 'type-cell'],
  ['size', 'Size', 'size-cell'],
];

function Icon({ name, size = 17, ...props }) {
  const paths = {
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    drive: <><path d="M4 5h16l2 12H2L4 5Zm-2 12v4h20v-4M6 18.5h.01M9 18.5h.01M7 8h10" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    down: <path d="m7 10 5 5 5-5" />,
    up: <path d="m7 14 5-5 5 5" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    forward: <path d="M4 12h16m-6-6 6 6-6 6" />,
    parent: <path d="M12 21V4m-6 6 6-6 6 6" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
    pin: <><path d="m16 3 5 5-4 2-3 6-2-2-7 7M10 12l-2-2 6-3Z" /><path d="m10 12 4 4" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8 8 12 12M8 16 20 4" /></>,
    paste: <><rect x="5" y="5" width="14" height="16" rx="2" /><rect x="9" y="2" width="6" height="5" rx="1" /></>,
    edit: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M12 3v18M8 3h8M8 21h8M6 10v4M18 10v4" /></>,
    move: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M3 12h11m-4-4 4 4-4 4" />,
    trash: <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    sort: <path d="M8 4v16m-4-4 4 4 4-4M15 5h5M15 10h4M15 15h3" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    details: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M15 4v16M18 8h1M18 12h1M18 16h1" /></>,
    undo: <path d="M4 10h10a6 6 0 0 1 0 12M9 5l-5 5 5 5" />,
    tag: <><path d="M3 3h8l10 10-8 8L3 11Z" /><circle cx="7" cy="7" r="1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.file}</svg>;
}

function MenuItem({ icon, children, shortcut, checked, danger, ...props }) {
  return <button role="menuitem" className={danger ? 'danger-menu-item' : undefined} {...props}><Icon name={checked ? 'check' : icon || 'file'} size={16} /><span>{children}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>;
}

function loadLibrary() {
  try {
    const saved = decodeLibrary(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (saved) return saved;
  } catch { /* Browser storage is optional. */ }
  return encodeLibrary(createInitialNodes(), []);
}

function loadPreferences() {
  const fallback = { sort: { key: 'name', direction: 'asc' }, density: 'normal', mode: 'find' };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
    return {
      sort: COLUMNS.some(([key]) => key === saved?.sort?.key) && ['asc', 'desc'].includes(saved.sort.direction) ? saved.sort : fallback.sort,
      density: ['dense', 'normal', 'comfortable'].includes(saved?.density) ? saved.density : fallback.density,
      mode: ['find', 'explorer'].includes(saved?.mode) ? saved.mode : fallback.mode,
    };
  } catch { return fallback; }
}

export default function App() {
  const [library, setLibrary] = useState(loadLibrary);
  const { nodes, tags } = library;
  const [tagFilter, setTagFilter] = useState([]);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [history, setHistory] = useState({ entries: [null], index: 0 });
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [clipboard, setClipboard] = useState(null);
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [destination, setDestination] = useState(null);
  const [toast, setToast] = useState(null);
  const [undo, setUndo] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const [dropTarget, setDropTarget] = useState(undefined);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editorFileId, setEditorFileId] = useState(null);
  const editorRef = useRef(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathValue, setPathValue] = useState('');
  const searchRef = useRef(null);
  const pathRef = useRef(null);
  const nameRef = useRef(null);
  const menuRef = useRef(null);
  const menuTrigger = useRef(null);
  const toastTimer = useRef(null);
  const selectionAnchor = useRef(null);
  const rowRefs = useRef(new Map());
  const historyId = history.entries[history.index];
  const folderId = nodes.some(n => n.id === historyId && n.type === 'folder') ? historyId : null;
  const folder = nodes.find(n => n.id === folderId);
  const breadcrumb = folder ? [...getAncestors(nodes, folderId), folder] : [];
  const currentPath = `${ROOT_LABEL}\\${breadcrumb.map(n => n.name).join('\\')}`;
  const searching = Boolean(query.trim()) || tagFilter.length > 0;
  const sourceItems = searching
    ? nodes.filter(n => matchesFileSearch(n, query, tags) && matchesTagFilter(n, tagFilter) && (folderId === null || isDescendant(nodes, n.id, folderId)))
    : getChildren(nodes, folderId);
  const items = sortItems(nodes, sourceItems, preferences.sort);
  const sizes = buildSizeMap(nodes);
  const selectedNodes = nodes.filter(n => selected.includes(n.id));
  const selectedFolders = selectedNodes.filter(n => n.type === 'folder');
  const starredFolders = nodes.filter(n => n.type === 'folder' && n.starred).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const detail = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const editorFile = nodes.find(node => node.id === editorFileId && node.type === 'file');
  const editorPath = editorFile ? `${ROOT_LABEL}\\${[...getAncestors(nodes, editorFile.id), editorFile].map(node => node.name).join('\\')}` : '';
  const canCreate = preferences.mode === 'find' || !searching;
  const hasSelection = selectedNodes.length > 0;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [library]);

  useEffect(() => {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Keep session preferences. */ }
  }, [preferences]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!dialog) return;
    setError('');
    const frame = requestAnimationFrame(() => {
      const input = nameRef.current;
      if (input) {
        input.focus();
        const dot = input.value.lastIndexOf('.');
        input.setSelectionRange(0, dialog.itemType === 'folder' || dialog.item?.type === 'folder' || dot < 1 ? input.value.length : dot);
      } else document.querySelector('.modal button')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [dialog]);

  useEffect(() => {
    if (editingPath) { pathRef.current?.focus(); pathRef.current?.select(); }
  }, [editingPath]);

  useEffect(() => {
    if (!menu) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector('button:not(:disabled)')?.focus());
    const dismiss = event => {
      const isToolbarTrigger = ['new', 'sort', 'view', 'more'].includes(menu.kind) && menuTrigger.current?.contains(event.target);
      if (!menuRef.current?.contains(event.target) && !isToolbarTrigger) setMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', dismiss);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', dismiss); };
  }, [menu]);

  function notify(message, canUndo = false) {
    clearTimeout(toastTimer.current); setToast({ message, canUndo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  function changeNodes(next, message) {
    setUndo(nodes); setNodes(next);
    if (message) notify(message, true);
  }

  function setNodes(next) {
    setLibrary(previous => ({ ...previous, nodes: typeof next === 'function' ? next(previous.nodes) : next }));
  }

  function persistTagChange(nextNodes, nextTags) {
    try {
      const next = encodeLibrary(nextNodes, nextTags);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLibrary(next); setStorageError(false); setUndo(null);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: `Could not save tags. ${err.message}` };
    }
  }

  function toggleFileTag(fileId, tagId) {
    try {
      const file = nodes.find(node => node.id === fileId);
      if (!file) throw new Error('This item no longer exists.');
      const current = file.tagIds || [];
      const ids = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId];
      return persistTagChange(assignFileTags(nodes, fileId, ids, tags), tags);
    } catch (err) { return { ok: false, message: err.message }; }
  }

  function createCustomTag(name, fileId = null) {
    try {
      const result = createTag(tags, name);
      let nextNodes = nodes;
      if (fileId !== null) {
        const file = nodes.find(node => node.id === fileId);
        if (!file) throw new Error('This item no longer exists.');
        nextNodes = assignFileTags(nodes, fileId, [...(file.tagIds || []), result.tag.id], result.tags);
      }
      const saved = persistTagChange(nextNodes, result.tags);
      if (saved.ok && fileId === null) { setTagFilter(previous => [...previous, result.tag.id]); setSelected([]); }
      return saved;
    } catch (err) { return { ok: false, message: err.message }; }
  }

  function toggleTagFilter(tagId) {
    setTagFilter(previous => previous.includes(tagId) ? previous.filter(id => id !== tagId) : [...previous, tagId]);
    setSelected([]); selectionAnchor.current = null;
    return { ok: true };
  }

  function saveMetadata(id, patch) {
    try {
      const next = encodeLibrary(updateItemMetadata(nodes, id, patch), tags);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLibrary(next); setStorageError(false); setUndo(null);
      return { ok: true };
    } catch (err) { return { ok: false, message: `Could not save details. ${err.message}` }; }
  }

  async function copyCode(item) {
    try { await navigator.clipboard.writeText(item.content || ''); notify(`Code copied from ${item.name}.`); }
    catch { notify('Clipboard unavailable. Open the code and select it to copy.'); }
  }

  function loadCloudLibrary(next) {
    if (editorFile) throw new Error('Save and close the editor before replacing your library.');
    const validated = decodeLibrary(next);
    if (!validated) throw new Error('The downloaded library is invalid.');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    setLibrary(validated); setHistory({ entries: [null], index: 0 });
    setSelected([]); setQuery(''); setTagFilter([]); setUndo(null); setClipboard(null); setStorageError(false);
    notify('Cloud library loaded on this device.');
  }

  function undoChange() {
    if (!undo) return;
    setNodes(undo); setUndo(null); setSelected([]); setMenu(null);
    notify('Last change undone.');
  }

  function clearTransientState() {
    if (preferences.mode !== 'find') { setQuery(''); setTagFilter([]); }
    setSelected([]); setMenu(null); setEditingPath(false); setSidebarOpen(false); selectionAnchor.current = null;
  }

  function navigate(id = null) {
    if (editorFile) {
      editorRef.current?.requestClose(() => { setEditorFileId(null); performNavigate(id); });
      return;
    }
    performNavigate(id);
  }

  function performNavigate(id = null) {
    if (id !== folderId) setHistory(previous => ({ entries: [...previous.entries.slice(0, previous.index + 1), id], index: previous.index + 1 }));
    clearTransientState();
  }

  function goHistory(delta) {
    setHistory(previous => ({ ...previous, index: Math.max(0, Math.min(previous.entries.length - 1, previous.index + delta)) }));
    clearTransientState();
  }

  function openItem(item) {
    if (item.type === 'folder') navigate(item.id);
    else { setSelected([item.id]); setEditorFileId(item.id); setToast(null); setMenu(null); }
  }

  function saveEditorContent(content) {
    try {
      const next = updateFileContent(nodes, editorFileId, content);
      // Confirm the write before reporting a save; keep the editor dirty if storage is full.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(encodeLibrary(next, tags)));
      setNodes(next); setStorageError(false);
      if (next !== nodes) setUndo(null);
      return { ok: true };
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.name === 'SecurityError') setStorageError(true);
      return { ok: false, message: `Could not save this file. ${err.message}` };
    }
  }

  function selectItem(event, id) {
    if (event.shiftKey && selectionAnchor.current && items.some(n => n.id === selectionAnchor.current)) {
      const start = items.findIndex(n => n.id === selectionAnchor.current);
      const end = items.findIndex(n => n.id === id);
      setSelected(items.slice(Math.min(start, end), Math.max(start, end) + 1).map(n => n.id));
    } else if (event.ctrlKey || event.metaKey) {
      setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
      selectionAnchor.current = id;
    } else { setSelected([id]); selectionAnchor.current = id; }
  }

  function clearSearch() { setQuery(''); setSelected([]); selectionAnchor.current = null; }

  function setSort(key, direction) {
    setPreferences(previous => ({ ...previous, sort: { key, direction: direction || (previous.sort.key === key && previous.sort.direction === 'asc' ? 'desc' : 'asc') } }));
    setMenu(null);
  }

  function beginCreate(kind) {
    if (!canCreate) return;
    const fileKind = FILE_KINDS.find(item => item.id === kind);
    setName(kind === 'folder' ? 'New folder' : fileKind.defaultName);
    setDialog({ type: 'create', itemType: kind === 'folder' ? 'folder' : 'file', fileKind }); setMenu(null);
  }

  function beginRename(item) { setName(item.name); setDialog({ type: 'rename', item }); setMenu(null); }

  function beginTransfer(mode, ids = selected) {
    if (!ids.length) return;
    setDestination(folderId); setDialog({ type: 'transfer', mode, ids }); setMenu(null);
  }

  function submitName(event) {
    event.preventDefault();
    try {
      if (!name.trim()) throw new Error('Enter a name.');
      const finalName = dialog.type === 'create' && dialog.fileKind ? makeFileName(name, dialog.fileKind) : name.trim();
      const next = dialog.type === 'create' ? createItem(nodes, { parentId: folderId, type: dialog.itemType, name: finalName }) : renameItem(nodes, dialog.item.id, finalName);
      changeNodes(next, dialog.type === 'create' ? `${dialog.itemType === 'folder' ? 'Folder' : 'File'} created.` : 'Item renamed.');
      if (dialog.type === 'create') {
        const created = next.find(n => !nodes.some(old => old.id === n.id));
        if (created) {
          setSelected([created.id]);
          if (created.type === 'file') {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(encodeLibrary(next, tags))); setStorageError(false); }
            catch { setStorageError(true); }
            setEditorFileId(created.id); setUndo(null); setToast(null);
          }
        }
      }
      setDialog(null);
    } catch (err) { setError(err.message); }
  }

  function transfer(mode, ids, target) {
    try {
      changeNodes(mode === 'move' ? moveItems(nodes, ids, target) : copyItems(nodes, ids, target), `${ids.length === 1 ? 'Item' : `${ids.length} items`} ${mode === 'move' ? 'moved' : 'copied'}.`);
      setSelected([]); setDialog(null); setMenu(null);
      if (mode === 'move') setClipboard(null);
    } catch (err) { if (dialog) setError(err.message); else notify(err.message); }
  }

  function rememberClipboard(mode, ids = selected) {
    if (!ids.length) return;
    setClipboard({ mode, ids }); setMenu(null);
    notify(`${ids.length === 1 ? 'Item' : `${ids.length} items`} ${mode === 'move' ? 'cut' : 'copied'}. Open a folder and paste.`);
  }

  function paste() { if (clipboard && canCreate) transfer(clipboard.mode, clipboard.ids, folderId); }

  function removeItems() {
    try {
      changeNodes(deleteItems(nodes, dialog.ids), `${dialog.ids.length === 1 ? 'Item' : `${dialog.ids.length} items`} deleted.`);
      setSelected([]); setDialog(null);
    } catch (err) { setError(err.message); }
  }

  function starFolder(item) {
    changeNodes(toggleStar(nodes, item.id), item.starred ? 'Folder removed from starred.' : 'Folder added to starred.'); setMenu(null);
  }

  function showMenu(event, ids = []) {
    if (editorFile) { event.preventDefault(); return; }
    event.preventDefault(); event.stopPropagation(); menuTrigger.current = event.currentTarget;
    const targetIds = ids.length && selected.includes(ids[0]) ? selected : ids;
    setSelected(targetIds);
    setMenu({ kind: ids.length ? 'item' : 'background', ids: targetIds,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 246)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - (ids.length ? 370 : 205))),
    });
  }

  function showToolbarMenu(event, kind) {
    const rect = event.currentTarget.getBoundingClientRect(); menuTrigger.current = event.currentTarget;
    setMenu(previous => previous?.kind === kind ? null : { kind, ids: selected, x: Math.max(8, Math.min(rect.left, window.innerWidth - 246)), y: rect.bottom + 5 });
  }

  function editPath() { setPathValue(currentPath); setEditingPath(true); }

  function submitPath(event) {
    event.preventDefault();
    const entered = pathValue.trim().replaceAll('/', '\\');
    if (!entered.toLowerCase().startsWith(ROOT_LABEL.toLowerCase())) { notify(`The available root is ${ROOT_LABEL}`); return; }
    const relative = entered.slice(ROOT_LABEL.length);
    if (relative && !relative.startsWith('\\')) { notify('Enter a valid folder path.'); return; }
    let parent = null;
    for (const part of relative.split('\\').filter(Boolean)) {
      const child = getChildren(nodes, parent).find(n => n.type === 'folder' && n.name.toLowerCase() === part.toLowerCase());
      if (!child) { notify(`Folder not found: ${part}`); return; }
      parent = child.id;
    }
    navigate(parent);
  }

  function dragStart(event, item) {
    const ids = selected.includes(item.id) ? selected : [item.id]; setSelected(ids);
    event.dataTransfer.setData('application/x-coderecall-items', JSON.stringify(ids));
    event.dataTransfer.effectAllowed = 'copyMove'; setMenu(null);
  }

  function drop(event, target) {
    event.preventDefault(); event.stopPropagation(); setDropTarget(undefined);
    try {
      const ids = JSON.parse(event.dataTransfer.getData('application/x-coderecall-items'));
      if (Array.isArray(ids) && ids.length) transfer(event.ctrlKey || event.altKey ? 'copy' : 'move', ids, target);
    } catch { notify('Drag a file or folder from this explorer.'); }
  }

  function dragOver(event, target) {
    if (!event.dataTransfer.types.includes('application/x-coderecall-items')) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = event.ctrlKey || event.altKey ? 'copy' : 'move'; setDropTarget(target);
  }

  function rowKeyDown(event, item, index) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); openItem(item); }
    if (event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectItem(event, item.id); }
    if (!event.altKey && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      const next = items[nextIndex];
      if (!event.ctrlKey && !event.metaKey) selectItem(event, next.id);
      rowRefs.current.get(next.id)?.focus();
    }
  }

  useEffect(() => {
    function handleKey(event) {
      if (editorFile) return;
      if (event.target instanceof Element && event.target.closest('[data-tag-picker], [data-metadata], [data-item-viewer], [data-cloud-library], [data-icon-picker]')) return;
      const editable = event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        if (menu) { setMenu(null); menuTrigger.current?.focus(); }
        else if (dialog) setDialog(null);
        else if (editingPath) setEditingPath(false);
        else if (searching) clearSearch();
        else setSelected([]);
        return;
      }
      if (dialog) return;
      if (mod && (key === 'f' || key === 'k')) { event.preventDefault(); searchRef.current?.focus(); return; }
      if (event.altKey && key === 'd') { event.preventDefault(); editPath(); return; }
      if (editable || menu) return;
      if (key === '/') { event.preventDefault(); searchRef.current?.focus(); }
      else if (mod && key === 'a') { event.preventDefault(); setSelected(items.map(n => n.id)); }
      else if (mod && key === 'c' && hasSelection) { event.preventDefault(); rememberClipboard('copy'); }
      else if (mod && key === 'x' && hasSelection) { event.preventDefault(); rememberClipboard('move'); }
      else if (mod && key === 'v' && clipboard && canCreate) { event.preventDefault(); paste(); }
      else if (mod && key === 'z' && undo) { event.preventDefault(); undoChange(); }
      else if (event.key === 'F2' && detail) { event.preventDefault(); beginRename(detail); }
      else if (event.key === 'Delete' && hasSelection) { event.preventDefault(); setDialog({ type: 'delete', ids: selected }); }
      else if (mod && event.shiftKey && key === 'n' && canCreate) { event.preventDefault(); beginCreate('folder'); }
      else if (!mod && !event.altKey && key === 'n' && canCreate) { event.preventDefault(); beginCreate('python'); }
      else if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); goHistory(-1); }
      else if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); goHistory(1); }
      else if (event.altKey && event.key === 'ArrowUp' && folder) { event.preventDefault(); navigate(folder.parentId); }
    }
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  });

  function renderNewMenu() {
    return <><MenuItem icon="folder" disabled={!canCreate} onClick={() => beginCreate('folder')}>Folder</MenuItem><div className="menu-rule" />{FILE_KINDS.map(kind => <MenuItem key={kind.id} disabled={!canCreate} onClick={() => beginCreate(kind.id)}>{kind.label}</MenuItem>)}</>;
  }

  const menuItems = menu?.ids.map(id => nodes.find(n => n.id === id)).filter(Boolean) || [];
  const transferFolders = [];
  function collectDestinations(parentId = null, depth = 0) {
    getChildren(nodes, parentId).filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
      const disabled = dialog?.ids?.some(id => id === item.id || isDescendant(nodes, item.id, id));
      transferFolders.push({ ...item, depth, disabled });
      if (!disabled) collectDestinations(item.id, depth + 1);
    });
  }
  if (dialog?.type === 'transfer') collectDestinations();

  return <div className={`app-shell view-${preferences.density} mode-${preferences.mode}${sidebarOpen ? ' sidebar-visible' : ''}`}>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className="sidebar" aria-label="Explorer navigation">
      <div className="sidebar-brand"><span className="brand-symbol">{'</>'}</span><span>CodeRecall</span><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button></div>
      <nav className="roots-section" aria-label="Roots">{ROOTS.map(root => <button key={root.id}
        className={`sidebar-link ${folderId === root.parentId && !searching ? 'active' : ''} ${dropTarget === root.parentId ? 'drop-target' : ''}`}
        onClick={() => navigate(root.parentId)} onDragOver={event => dragOver(event, root.parentId)} onDragLeave={() => setDropTarget(undefined)} onDrop={event => drop(event, root.parentId)}
        aria-current={folderId === root.parentId && !searching ? 'location' : undefined}><Icon name="drive" size={19} /><span>{root.label}</span>
      </button>)}</nav>
      <section className="starred-section" aria-label="Starred folders">
        <div className="sidebar-section-label"><Icon name="star" size={13} /><span>Starred folders</span></div>
        <div className="starred-list">
          {starredFolders.length === 0 && <p className="sidebar-empty">No starred folders</p>}
          {starredFolders.map(item => <div key={item.id} className={`starred-row ${folderId === item.id ? 'active' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`}
            onContextMenu={event => showMenu(event, [item.id])} onDragOver={event => dragOver(event, item.id)} onDragLeave={() => setDropTarget(undefined)} onDrop={event => drop(event, item.id)}>
            <button className="sidebar-link starred-folder-button" title={`${ROOT_LABEL}\\${[...getAncestors(nodes, item.id), item].map(n => n.name).join('\\')}`} aria-current={folderId === item.id ? 'location' : undefined} onClick={() => navigate(item.id)}><ItemIcon item={item} size={17} /><span>{item.name}</span></button>
            <button className="unstar-button icon-button" aria-label={`Unstar ${item.name}`} title={`Unstar ${item.name}`} disabled={Boolean(editorFile)} onClick={() => starFolder(item)}><Icon name="pin" size={13} /></button>
          </div>)}
        </div>
      </section>
    </aside>

    <main className="workspace" aria-label="File explorer">
      {editorFile ? <CodeEditor key={editorFile.id} ref={editorRef} file={editorFile} path={editorPath} persistenceError={storageError} onSave={saveEditorContent} onClose={() => setEditorFileId(null)} tags={tags} onToggleTag={id => toggleFileTag(editorFile.id, id)} onCreateTag={name => createCustomTag(name, editorFile.id)} /> : <>
      <header className="mode-bar"><button className="icon-button mobile-navigation-toggle" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}><Icon name="list" /></button><div className="mode-switch" aria-label="Library mode"><button className={preferences.mode === 'find' ? 'active' : ''} aria-pressed={preferences.mode === 'find'} onClick={() => setPreferences(previous => ({ ...previous, mode: 'find' }))}><SearchIcon name="grid" size={15} />Find code</button><button className={preferences.mode === 'explorer' ? 'active' : ''} aria-pressed={preferences.mode === 'explorer'} onClick={() => setPreferences(previous => ({ ...previous, mode: 'explorer' }))}><Icon name="list" size={15} />Explorer</button></div><Suspense fallback={<span className="cloud-loading">Account & backup</span>}><CloudLibrary library={library} onLoad={loadCloudLibrary} /></Suspense></header>
      {preferences.mode === 'find' ? <SearchMode nodes={nodes} tags={tags} query={query} onQuery={setQuery} searchRef={searchRef} tagFilter={tagFilter} onToggleFilter={toggleTagFilter} onCreateTag={createCustomTag} onClearFilters={() => setTagFilter([])} folderId={folderId} breadcrumb={breadcrumb} onNavigate={navigate} onBack={() => goHistory(-1)} canBack={history.index > 0} onEdit={openItem} onCreate={beginCreate} onCopy={copyCode} onSaveMetadata={saveMetadata} onToggleTag={toggleFileTag} storageError={storageError} /> : <>
      <div className="command-bar" role="toolbar" aria-label="File actions">
        <div className="command-group"><button className="toolbar-button" aria-label="New" aria-haspopup="menu" aria-expanded={menu?.kind === 'new'} onClick={event => showToolbarMenu(event, 'new')} disabled={!canCreate}><Icon name="plus" /><span>New</span><Icon name="down" size={11} /></button></div>
        <span className="toolbar-separator" />
        <div className="command-group">
          <button className="toolbar-button icon-only" title="Cut (Ctrl+X)" aria-label="Cut" disabled={!hasSelection} onClick={() => rememberClipboard('move')}><Icon name="cut" /></button>
          <button className="toolbar-button icon-only" title="Copy (Ctrl+C)" aria-label="Copy" disabled={!hasSelection} onClick={() => rememberClipboard('copy')}><Icon name="copy" /></button>
          <button className="toolbar-button icon-only" title="Paste (Ctrl+V)" aria-label="Paste" disabled={!clipboard || !canCreate} onClick={paste}><Icon name="paste" /></button>
          <button className="toolbar-button icon-only" title="Rename (F2)" aria-label="Rename" disabled={!detail} onClick={() => beginRename(detail)}><Icon name="edit" /></button>
          <button className="toolbar-button icon-only" title="Move to folder" aria-label="Move to folder" disabled={!hasSelection} onClick={() => beginTransfer('move')}><Icon name="move" /></button>
          <button className="toolbar-button icon-only" title="Delete (Del)" aria-label="Delete" disabled={!hasSelection} onClick={() => setDialog({ type: 'delete', ids: selected })}><Icon name="trash" /></button>
        </div>
        <span className="toolbar-separator" />
        <div className="command-group">
          <button className="toolbar-button" aria-haspopup="menu" aria-expanded={menu?.kind === 'sort'} onClick={event => showToolbarMenu(event, 'sort')}><Icon name="sort" /><span>Sort</span><Icon name="down" size={11} /></button>
          <button className="toolbar-button" aria-haspopup="menu" aria-expanded={menu?.kind === 'view'} onClick={event => showToolbarMenu(event, 'view')}><Icon name="list" /><span>View</span><Icon name="down" size={11} /></button>
          <TagPicker label="Filter tags" tags={tags} selectedIds={tagFilter} onToggle={toggleTagFilter} onCreate={name => createCustomTag(name)} />
          <button className="toolbar-button icon-only" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu?.kind === 'more'} onClick={event => showToolbarMenu(event, 'more')}><Icon name="more" /></button>
        </div>
        <span className="command-spacer" />
        <button className={`toolbar-button ${detailsOpen ? 'active' : ''}`} aria-label="Details" aria-pressed={detailsOpen} onClick={() => setDetailsOpen(value => !value)}><Icon name="details" /><span>Details</span></button>
      </div>

      <div className="location-bar">
        <div className="navigation-controls">
          <button className="icon-button" title="Back (Alt+Left)" aria-label="Go back" disabled={history.index === 0} onClick={() => goHistory(-1)}><Icon name="back" size={16} /></button>
          <button className="icon-button" title="Forward (Alt+Right)" aria-label="Go forward" disabled={history.index === history.entries.length - 1} onClick={() => goHistory(1)}><Icon name="forward" size={16} /></button>
          <button className="icon-button" title="Up (Alt+Up)" aria-label="Up one level" disabled={!folder} onClick={() => navigate(folder.parentId)}><Icon name="parent" size={16} /></button>
        </div>
        <div className="address-bar" title={currentPath}>{editingPath ? <form className="path-form" onSubmit={submitPath}><input ref={pathRef} className="path-input" aria-label="Folder path" value={pathValue} onChange={event => setPathValue(event.target.value)} onBlur={() => setEditingPath(false)} spellCheck={false} /></form> : <>
          <nav className="breadcrumbs" aria-label="Folder path"><button onClick={() => navigate()} onDragOver={event => dragOver(event, null)} onDrop={event => drop(event, null)}><Icon name="drive" size={16} /><span>{ROOT_LABEL}</span></button>{breadcrumb.map(item => <React.Fragment key={item.id}><Icon name="chevron" size={12} /><button onClick={() => navigate(item.id)} onDragOver={event => dragOver(event, item.id)} onDrop={event => drop(event, item.id)} aria-current={item.id === folderId ? 'location' : undefined}>{item.name}</button></React.Fragment>)}{searching && <><Icon name="chevron" size={12} /><span className="search-path-label">Search results</span></>}</nav>
          <button className="icon-button path-edit-button" title="Edit folder path (Alt+D)" aria-label="Edit folder path" onClick={editPath}><Icon name="down" size={12} /></button>
        </>}</div>
        <div className="search-box"><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); setSelected([]); selectionAnchor.current = null; }} placeholder={`Search ${folder?.name || ROOT_LABEL}`} aria-label="Search current folder" />{query ? <button className="icon-button" aria-label="Clear search" onClick={clearSearch}><Icon name="close" size={13} /></button> : <Icon name="search" size={15} />}</div>
      </div>

      {tagFilter.length > 0 && <div className="tag-filter-bar" aria-label="Active tag filters"><span>Matching all tags:</span><TagBadges tags={tags.filter(tag => tagFilter.includes(tag.id))} onRemove={toggleTagFilter} /><button className="tag-filter-clear" onClick={() => { setTagFilter([]); setSelected([]); }}>Clear tag filters</button></div>}
      <div className="content-area">
        <div className={`file-pane ${dropTarget === folderId ? 'pane-drop-target' : ''}`} onContextMenu={event => { if (!event.target.closest('button,input')) showMenu(event); }}
          onDragOver={event => canCreate && dragOver(event, folderId)} onDrop={event => canCreate && drop(event, folderId)} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(undefined); }}
          onClick={event => { if (!event.target.closest('.file-row,button')) setSelected([]); }}>
          <div className="file-list-scroll">
            <table className="file-table" aria-label="Files and folders">
              <colgroup><col className="col-select" /><col className="col-name" /><col className="col-modified" /><col className="col-created" /><col className="col-type" /><col className="col-size" /><col className="col-actions" /></colgroup>
              <thead><tr>
                <th className="checkbox-cell"><button className={`checkbox ${items.length > 0 && items.every(n => selected.includes(n.id)) ? 'checked' : ''}`} aria-label="Select all items" aria-pressed={items.length > 0 && items.every(n => selected.includes(n.id))} onClick={() => setSelected(items.every(n => selected.includes(n.id)) ? [] : items.map(n => n.id))}>{items.length > 0 && items.every(n => selected.includes(n.id)) && <Icon name="check" size={11} />}</button></th>
                {COLUMNS.map(([key, label, className]) => <th key={key} className={className} aria-sort={preferences.sort.key === key ? preferences.sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="column-sort" onClick={() => setSort(key)}>{label}{preferences.sort.key === key && <Icon name={preferences.sort.direction === 'asc' ? 'up' : 'down'} size={11} className="sort-indicator" />}</button></th>)}<th aria-label="Item actions" />
              </tr></thead>
              <tbody>{items.map((item, index) => <tr key={item.id} role="row" ref={element => { if (element) rowRefs.current.set(item.id, element); else rowRefs.current.delete(item.id); }}
                className={`file-row ${searching ? 'search-row' : ''} ${selected.includes(item.id) ? 'selected' : ''} ${clipboard?.mode === 'move' && clipboard.ids.includes(item.id) ? 'cut-item' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`}
                tabIndex={0} aria-label={`${item.name}, ${getItemType(item)}`} aria-selected={selected.includes(item.id)} draggable
                onClick={event => selectItem(event, item.id)} onDoubleClick={() => openItem(item)} onKeyDown={event => rowKeyDown(event, item, index)}
                onContextMenu={event => showMenu(event, [item.id])} onDragStart={event => dragStart(event, item)} onDragEnd={() => setDropTarget(undefined)}
                {...(item.type === 'folder' ? { onDragOver: event => dragOver(event, item.id), onDragLeave: () => setDropTarget(undefined), onDrop: event => drop(event, item.id) } : {})}>
                <td className="checkbox-cell"><button className={`checkbox ${selected.includes(item.id) ? 'checked' : ''}`} aria-label={`Select ${item.name}`} aria-pressed={selected.includes(item.id)} onClick={event => { event.stopPropagation(); selectItem({ shiftKey: event.shiftKey, ctrlKey: true }, item.id); }}>{selected.includes(item.id) && <Icon name="check" size={11} />}</button></td>
                <td className="name-cell"><div className="file-name"><ItemIcon item={item} /><span className="file-label" title={item.name}><span>{item.name}</span>{searching && <small className="file-parent">{`${ROOT_LABEL}\\${getAncestors(nodes, item.id).map(n => n.name).join('\\')}`}</small>}</span>{item.type === 'file' && getFileTags(item, tags).length > 0 && <span className="file-tag-count" title={getFileTags(item, tags).map(tag => tag.name).join(', ')} aria-label={`${getFileTags(item, tags).length} tags`}><Icon name="tag" size={12} />{getFileTags(item, tags).length}</span>}{item.type === 'folder' && item.starred && <Icon name="pin" className="file-star" size={12} />}</div></td>
                <td className="date-cell"><time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time></td>
                <td className="date-cell"><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></td>
                <td className="type-cell">{getItemType(item)}</td><td className="size-cell">{formatSize(sizes.get(item.id) || 0)}</td>
                <td><button className="icon-button row-more" title={`More options for ${item.name}`} aria-label={`More options for ${item.name}`} onClick={event => showMenu(event, [item.id])}><Icon name="more" size={16} /></button></td>
              </tr>)}</tbody>
            </table>
            {items.length === 0 && <div className="empty-directory">{searching ? 'No items match your search.' : 'This folder is empty.'}</div>}
          </div>
        </div>
        {detailsOpen && <aside className="details-panel" aria-label="Item details">
          <div className="details-heading"><span>Details</span><button className="icon-button" aria-label="Close details" onClick={() => setDetailsOpen(false)}><Icon name="close" size={16} /></button></div>
          {detail ? <><div className="details-file-icon"><ItemIcon item={detail} size={48} /></div><h2 className="detail-name">{detail.name}</h2><div className="detail-type">{getItemType(detail)}</div><MetadataPanel key={detail.id} item={detail} tags={tags} onSave={saveMetadata} onToggleTag={toggleFileTag} onCreateTag={createCustomTag} /><dl className="details-list"><dt>Location</dt><dd>{`${ROOT_LABEL}\\${getAncestors(nodes, detail.id).map(n => n.name).join('\\')}`}</dd><dt>Date created</dt><dd>{formatDateTime(detail.createdAt)}</dd><dt>Date modified</dt><dd>{formatDateTime(detail.updatedAt)}</dd><dt>Size</dt><dd>{formatSize(sizes.get(detail.id) || 0)}</dd>{detail.type === 'folder' && <><dt>Contains</dt><dd>{getChildren(nodes, detail.id).length} items</dd></>}</dl>{detail.type === 'file' && <button className="button secondary details-rename" onClick={() => openItem(detail)}>Edit file</button>}{detail.type === 'folder' && <button className="button secondary" onClick={() => starFolder(detail)}><Icon name="star" size={15} />{detail.starred ? 'Unstar folder' : 'Star folder'}</button>}</> : <p className="editor-note">{selectedNodes.length > 1 ? `${selectedNodes.length} items selected.` : 'Select an item to view its details.'}</p>}
        </aside>}
      </div>
      <footer className="status-bar"><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>{hasSelection && <><span className="status-separator" /><span>{selectedNodes.length} selected</span></>}<span className={`status-message ${storageError ? 'storage-warning' : ''}`}>{storageError ? 'Storage unavailable — changes saved for this session only' : 'Saved locally'}</span></footer>
      </>}
      </>}
    </main>

    {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} ref={menuRef} role="menu" aria-label={menu.kind === 'item' ? 'Item actions' : `${menu.kind} menu`} onKeyDown={event => {
      if (event.key === 'Tab') { setMenu(null); return; }
      const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus(); }
    }}>
      {menu.kind === 'new' && renderNewMenu()}
      {menu.kind === 'sort' && <><div className="menu-caption">Sort by</div>{COLUMNS.map(([key, label]) => <MenuItem key={key} checked={preferences.sort.key === key} icon="sort" onClick={() => setSort(key, preferences.sort.direction)}>{label}</MenuItem>)}<div className="menu-rule" /><MenuItem checked={preferences.sort.direction === 'asc'} icon="up" onClick={() => setSort(preferences.sort.key, 'asc')}>Ascending</MenuItem><MenuItem checked={preferences.sort.direction === 'desc'} icon="down" onClick={() => setSort(preferences.sort.key, 'desc')}>Descending</MenuItem></>}
      {menu.kind === 'view' && <><div className="menu-caption">Row spacing</div>{[['dense', 'Compact'], ['normal', 'Default'], ['comfortable', 'Comfortable']].map(([value, label]) => <MenuItem key={value} icon="list" checked={preferences.density === value} onClick={() => { setPreferences(previous => ({ ...previous, density: value })); setMenu(null); }}>{label}</MenuItem>)}</>}
      {menu.kind === 'more' && <><MenuItem icon="undo" disabled={!undo} shortcut="Ctrl+Z" onClick={undoChange}>Undo</MenuItem><div className="menu-rule" /><MenuItem icon="move" disabled={!hasSelection} onClick={() => beginTransfer('move')}>Move to…</MenuItem><MenuItem icon="copy" disabled={!hasSelection} onClick={() => beginTransfer('copy')}>Copy to…</MenuItem><MenuItem icon="star" disabled={selectedFolders.length !== 1 || selectedNodes.length !== 1} onClick={() => starFolder(selectedFolders[0])}>{selectedFolders[0]?.starred ? 'Unstar folder' : 'Star folder'}</MenuItem><div className="menu-rule" /><MenuItem icon="check" shortcut="Ctrl+A" onClick={() => { setSelected(items.map(n => n.id)); setMenu(null); }}>Select all</MenuItem><MenuItem icon="list" onClick={() => { setDialog({ type: 'help' }); setMenu(null); }}>Keyboard shortcuts</MenuItem></>}
      {menu.kind === 'background' && <>{renderNewMenu()}<div className="menu-rule" /><MenuItem icon="paste" disabled={!clipboard || !canCreate} shortcut="Ctrl+V" onClick={paste}>Paste</MenuItem><MenuItem icon="undo" disabled={!undo} shortcut="Ctrl+Z" onClick={undoChange}>Undo</MenuItem></>}
      {menu.kind === 'item' && <><div className="menu-caption">{menuItems.length === 1 ? menuItems[0].name : `${menuItems.length} items`}</div>{menuItems.length === 1 && <><MenuItem icon={menuItems[0].type === 'folder' ? 'folder' : 'details'} shortcut="Enter" onClick={() => { openItem(menuItems[0]); setMenu(null); }}>{menuItems[0].type === 'folder' ? 'Open' : 'Edit file'}</MenuItem><MenuItem icon="edit" shortcut="F2" onClick={() => beginRename(menuItems[0])}>Rename</MenuItem>{menuItems[0].type === 'folder' && <MenuItem icon="star" onClick={() => starFolder(menuItems[0])}>{menuItems[0].starred ? 'Unstar folder' : 'Star folder'}</MenuItem>}</>}<div className="menu-rule" /><MenuItem icon="cut" shortcut="Ctrl+X" onClick={() => rememberClipboard('move', menu.ids)}>Cut</MenuItem><MenuItem icon="copy" shortcut="Ctrl+C" onClick={() => rememberClipboard('copy', menu.ids)}>Copy</MenuItem><MenuItem icon="move" onClick={() => beginTransfer('move', menu.ids)}>Move to…</MenuItem><MenuItem icon="copy" onClick={() => beginTransfer('copy', menu.ids)}>Copy to…</MenuItem><div className="menu-rule" /><MenuItem icon="trash" danger shortcut="Del" onClick={() => { setDialog({ type: 'delete', ids: menu.ids }); setMenu(null); }}>Delete</MenuItem></>}
    </div>}

    {dialog && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')]; const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <button className="icon-button modal-close" aria-label="Close dialog" onClick={() => setDialog(null)}><Icon name="close" size={17} /></button>
      {(dialog.type === 'create' || dialog.type === 'rename') && <form onSubmit={submitName}><h2 id="dialog-title">{dialog.type === 'rename' ? 'Rename' : dialog.itemType === 'folder' ? 'New folder' : `New ${dialog.fileKind.label.toLowerCase()}`}</h2><p>{dialog.type === 'rename' ? 'Enter a new name.' : `Location: ${currentPath}`}</p><label className="field-label" htmlFor="item-name">Name</label><input className={`name-input ${error ? 'invalid' : ''}`} id="item-name" ref={nameRef} value={name} onChange={event => { setName(event.target.value); setError(''); }} maxLength={200} autoComplete="off" aria-describedby={error ? 'dialog-error' : undefined} />{error && <p className="field-error" id="dialog-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="button primary">{dialog.type === 'rename' ? 'Save' : 'Create'}</button></div></form>}
      {dialog.type === 'transfer' && <><h2 id="dialog-title">{dialog.mode === 'move' ? 'Move' : 'Copy'} {dialog.ids.length === 1 ? 'item' : `${dialog.ids.length} items`}</h2><p>Select a destination folder.</p><div className="destination-list" role="listbox" aria-label="Destination folder"><button className={`destination-row destination-root ${destination === null ? 'active' : ''}`} role="option" aria-selected={destination === null} onClick={() => setDestination(null)}><Icon name="drive" size={18} /><span>{ROOT_LABEL}</span>{destination === null && <Icon name="check" size={15} />}</button>{transferFolders.map(item => <button key={item.id} className={`destination-row ${destination === item.id ? 'active' : ''}`} style={{ paddingLeft: 16 + item.depth * 17 }} role="option" aria-selected={destination === item.id} disabled={item.disabled} onClick={() => { setDestination(item.id); setError(''); }}><ItemIcon item={item} size={16} /><span>{item.name}</span>{destination === item.id && <Icon name="check" size={15} />}</button>)}</div>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button className="button primary" onClick={() => transfer(dialog.mode, dialog.ids, destination)}>{dialog.mode === 'move' ? 'Move here' : 'Copy here'}</button></div></>}
      {dialog.type === 'delete' && <><h2 id="dialog-title">Delete {dialog.ids.length === 1 ? 'item' : 'items'}?</h2><p>{dialog.ids.length === 1 ? `“${nodes.find(n => n.id === dialog.ids[0])?.name}” will be deleted.` : `${dialog.ids.length} selected items will be deleted.`} Folders include everything inside them. You can undo the last change.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button className="button danger" onClick={removeItems}>Delete</button></div></>}
      {dialog.type === 'help' && <><h2 id="dialog-title">Keyboard shortcuts</h2><div className="shortcut-list">{[['Search current folder', 'Ctrl+F / /'], ['Edit folder path', 'Alt+D'], ['New Python file', 'N'], ['New folder', 'Ctrl+Shift+N'], ['Rename', 'F2'], ['Copy / cut / paste', 'Ctrl+C / X / V'], ['Select all', 'Ctrl+A'], ['Undo', 'Ctrl+Z'], ['Delete', 'Delete'], ['Open folder / edit file', 'Enter'], ['Previous / next folder', 'Alt+Left / Right'], ['Parent folder', 'Alt+Up']].map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div><p className="modal-footnote">Use Ctrl-click or Shift-click to select multiple items. Drag items into folders to move them; hold Ctrl or Alt to copy.</p></>}
    </section></div>}
    {!editorFile && toast && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={14} /></span><span>{toast.message}</span>{toast.canUndo && undo && <button onClick={undoChange}>Undo</button>}<button className="toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
  </div>;
}
