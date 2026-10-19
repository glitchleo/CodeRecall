import React, { useEffect, useRef, useState } from 'react';
import {
  createInitialNodes, createItem, renameItem, moveItems, copyItems,
  deleteItems, toggleStar, getChildren, getAncestors, isDescendant,
  validateStoredNodes,
} from './lib/library.js';

const STORAGE_KEY = 'coderecall.library.v1';
const VIEW_KEY = 'coderecall.library.layout';
const ROOT = { folderId: null, view: 'library' };

function Icon({ name, size = 18, ...props }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth="3" /></>,
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    back: <path d="m14 6-6 6 6 6" />,
    forward: <path d="m10 6 6 6-6 6" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    library: <><rect x="3" y="3" width="4" height="18" rx="1" /><rect x="10" y="3" width="4" height="18" rx="1" /><path d="m17 4 4-1 4 17-4 1Z" transform="translate(-2 0)" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8 8 12 12M8 16 20 4" /></>,
    paste: <><rect x="5" y="5" width="14" height="16" rx="2" /><rect x="9" y="2" width="6" height="5" rx="1" /></>,
    edit: <><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m13 6 5 5" /></>,
    move: <><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M3 12h11m-4-4 4 4-4 4" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    arrowUp: <path d="M12 20V4m-6 6 6-6 6 6" />,
    sort: <><path d="M4 5h16M4 12h11M4 19h6M18 15v6m-3-3 3 3 3-3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    bolt: <path d="m13 2-9 12h7l-1 8L21 9h-8Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.file}</svg>;
}

function FolderArt({ color = 0 }) {
  return <div className={`folder-art folder-color-${color % 4}`} aria-hidden="true"><div className="folder-tab" /><div className="folder-back" /><div className="folder-paper" /><div className="folder-front"><span /></div></div>;
}

function loadNodes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validateStoredNodes(saved)) return saved;
  } catch { /* Start with an example library when storage is unavailable. */ }
  return createInitialNodes();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function textFileName(name) {
  const trimmed = name.trim();
  return trimmed && !trimmed.toLowerCase().endsWith('.txt') ? `${trimmed}.txt` : trimmed;
}

export default function App() {
  const [nodes, setNodes] = useState(loadNodes);
  const [history, setHistory] = useState({ entries: [ROOT], index: 0 });
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const [sort, setSort] = useState('name');
  const [clipboard, setClipboard] = useState(null);
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [destination, setDestination] = useState(null);
  const [toast, setToast] = useState(null);
  const [undo, setUndo] = useState(null);
  const [expanded, setExpanded] = useState(new Set(['projects']));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const searchRef = useRef(null);
  const nameRef = useRef(null);
  const menuRef = useRef(null);
  const toastTimer = useRef(null);
  const selectionAnchor = useRef(null);
  const menuTrigger = useRef(null);
  const location = history.entries[history.index];
  const folderId = nodes.some(n => n.id === location.folderId && n.type === 'folder') ? location.folderId : null;
  const folder = nodes.find(n => n.id === folderId);
  const currentView = location.view;
  const title = query.trim() ? 'Search results' : currentView === 'starred' ? 'Starred' : currentView === 'recent' ? 'Recent' : folder?.name || 'Library';
  const selectedNodes = nodes.filter(n => selected.includes(n.id));
  const allFolders = nodes.filter(n => n.type === 'folder');
  const allFiles = nodes.filter(n => n.type === 'file');
  const searching = Boolean(query.trim());
  const baseItems = searching
    ? nodes.filter(n => n.name.toLowerCase().includes(query.trim().toLowerCase()))
    : currentView === 'starred' ? nodes.filter(n => n.starred)
      : currentView === 'recent' ? [...nodes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 30)
        : getChildren(nodes, folderId);
  const items = baseItems.filter(n => filter === 'all' || n.type === filter).sort((a, b) => {
    if (sort === 'modified') return new Date(b.updatedAt) - new Date(a.updatedAt) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  const folders = items.filter(n => n.type === 'folder');
  const files = items.filter(n => n.type === 'file');
  const displayItems = layout === 'grid' ? [...folders, ...files] : items;
  const breadcrumb = folder ? [...getAncestors(nodes, folder.id), folder] : [];
  const canCreate = currentView === 'library' && !searching;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [nodes]);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, layout); } catch { /* Layout still works for this session. */ }
  }, [layout]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!dialog) return;
    setError('');
    const frame = requestAnimationFrame(() => {
      const input = nameRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(0, input.value.endsWith('.txt') ? input.value.length - 4 : input.value.length);
      } else document.querySelector('.modal button')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [dialog]);

  useEffect(() => {
    if (!menu) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector('button:not(:disabled)')?.focus());
    const dismiss = event => { if (!menuRef.current?.contains(event.target)) setMenu(null); };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', dismiss);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', dismiss); };
  }, [menu]);

  function notify(message, canUndo = false) {
    clearTimeout(toastTimer.current);
    setToast({ message, canUndo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  function changeNodes(next, message) {
    setUndo(nodes);
    setNodes(next);
    if (message) notify(message, true);
  }

  function undoChange() {
    if (!undo) return;
    setNodes(undo);
    setUndo(null);
    setSelected([]);
    notify('Change undone');
  }

  function navigate(nextFolderId = null, view = 'library') {
    setHistory(previous => ({ entries: [...previous.entries.slice(0, previous.index + 1), { folderId: nextFolderId, view }], index: previous.index + 1 }));
    setQuery(''); setSelected([]); setFilter('all'); setMenu(null); setSidebarOpen(false); setDetailsOpen(false);
    if (view === 'recent') setSort('modified');
    if (nextFolderId) setExpanded(previous => new Set([...previous, ...getAncestors(nodes, nextFolderId).map(n => n.id)]));
  }

  function goHistory(delta) {
    setHistory(previous => ({ ...previous, index: Math.max(0, Math.min(previous.entries.length - 1, previous.index + delta)) }));
    setQuery(''); setSelected([]); setFilter('all'); setDetailsOpen(false);
  }

  function openItem(item) {
    if (item.type === 'folder') navigate(item.id);
    else { setSelected([item.id]); setDetailsOpen(true); }
  }

  function selectItem(event, id) {
    if (event.shiftKey && selectionAnchor.current && displayItems.some(n => n.id === selectionAnchor.current)) {
      const start = displayItems.findIndex(n => n.id === selectionAnchor.current);
      const end = displayItems.findIndex(n => n.id === id);
      setSelected(displayItems.slice(Math.min(start, end), Math.max(start, end) + 1).map(n => n.id));
    } else if (event.ctrlKey || event.metaKey) {
      setSelected(previous => previous.includes(id) ? previous.filter(v => v !== id) : [...previous, id]);
      selectionAnchor.current = id;
    } else { setSelected([id]); selectionAnchor.current = id; }
  }

  function beginCreate(type) {
    if (!canCreate) navigate();
    setName(type === 'folder' ? 'New folder' : 'Untitled.txt');
    setDialog({ type: 'create', itemType: type }); setMenu(null);
  }

  function clearSearch() {
    setQuery(''); setSelected([]); setDetailsOpen(false);
  }

  function beginRename(item) {
    setName(item.name); setDialog({ type: 'rename', item }); setMenu(null);
  }

  function beginTransfer(mode, ids = selected) {
    setDestination(null); setDialog({ type: 'transfer', mode, ids }); setMenu(null);
  }

  function submitName(event) {
    event.preventDefault();
    try {
      const isFile = dialog.type === 'create' ? dialog.itemType === 'file' : dialog.item.type === 'file';
      const finalName = isFile ? textFileName(name) : name.trim();
      if (!finalName) throw new Error('Give your item a name.');
      const next = dialog.type === 'create'
        ? createItem(nodes, { parentId: folderId, type: dialog.itemType, name: finalName })
        : renameItem(nodes, dialog.item.id, finalName);
      changeNodes(next, dialog.type === 'create' ? `${isFile ? 'Text file' : 'Folder'} created` : 'Item renamed');
      if (dialog.type === 'create') {
        const created = next.find(n => !nodes.some(old => old.id === n.id));
        if (created) setSelected([created.id]);
      }
      setDialog(null);
    } catch (err) { setError(err.message); }
  }

  function transfer(mode, ids, target) {
    try {
      changeNodes(mode === 'move' ? moveItems(nodes, ids, target) : copyItems(nodes, ids, target), `${ids.length === 1 ? 'Item' : `${ids.length} items`} ${mode === 'move' ? 'moved' : 'copied'}`);
      setSelected([]); setDialog(null); setMenu(null);
      if (mode === 'move') setClipboard(null);
      return true;
    } catch (err) {
      if (dialog) setError(err.message); else notify(err.message);
      return false;
    }
  }

  function rememberClipboard(mode, ids = selected) {
    setClipboard({ mode, ids }); setMenu(null);
    notify(`${ids.length === 1 ? 'Item' : `${ids.length} items`} ready to ${mode === 'move' ? 'move' : 'copy'}. Open a folder and paste.`);
  }

  function paste() {
    if (clipboard && canCreate) transfer(clipboard.mode, clipboard.ids, folderId);
  }

  function removeItems() {
    try {
      changeNodes(deleteItems(nodes, dialog.ids), `${dialog.ids.length === 1 ? 'Item' : `${dialog.ids.length} items`} deleted`);
      setSelected([]); setDialog(null); setDetailsOpen(false);
    } catch (err) { setError(err.message); }
  }

  function showMenu(event, ids = []) {
    event.preventDefault(); event.stopPropagation();
    menuTrigger.current = event.currentTarget;
    const targetIds = ids.length && selected.includes(ids[0]) ? selected : ids;
    if (ids.length) setSelected(targetIds);
    const width = 232;
    setMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 12)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - (ids.length ? 420 : 180) - 12)), ids: targetIds });
  }

  function dragStart(event, item) {
    const ids = selected.includes(item.id) ? selected : [item.id];
    if (!selected.includes(item.id)) setSelected(ids);
    event.dataTransfer.setData('application/x-coderecall-items', JSON.stringify(ids));
    event.dataTransfer.effectAllowed = 'copyMove'; setMenu(null);
  }

  function drop(event, target) {
    event.preventDefault(); event.stopPropagation(); setDropTarget(null);
    try {
      const ids = JSON.parse(event.dataTransfer.getData('application/x-coderecall-items'));
      if (Array.isArray(ids) && ids.length) transfer(event.ctrlKey || event.altKey ? 'copy' : 'move', ids, target);
    } catch { notify('Drag a file or folder from this library.'); }
  }

  function dragOver(event, target) {
    if (!event.dataTransfer.types.includes('application/x-coderecall-items')) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = event.ctrlKey || event.altKey ? 'copy' : 'move'; setDropTarget(target ?? 'root');
  }

  useEffect(() => {
    const handleKey = event => {
      const editable = event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') {
        if (menu) { setMenu(null); menuTrigger.current?.focus(); }
        else if (dialog) setDialog(null);
        else { setSidebarOpen(false); if (!editable) setSelected([]); }
        return;
      }
      if (dialog || editable) return;
      const interactive = event.target instanceof HTMLElement && event.target.closest('button,a,[role="menu"]');
      if (interactive && !mod && (event.key === 'Enter' || event.key === ' ')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); }
      else if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelected(items.map(n => n.id)); }
      else if (mod && event.key.toLowerCase() === 'c' && selected.length) { event.preventDefault(); rememberClipboard('copy'); }
      else if (mod && event.key.toLowerCase() === 'x' && selected.length) { event.preventDefault(); rememberClipboard('move'); }
      else if (mod && event.key.toLowerCase() === 'v' && clipboard && canCreate) { event.preventDefault(); paste(); }
      else if (mod && event.key.toLowerCase() === 'z' && undo) { event.preventDefault(); undoChange(); }
      else if (event.key === 'F2' && selectedNodes.length === 1) { event.preventDefault(); beginRename(selectedNodes[0]); }
      else if ((event.key === 'Delete' || (mod && event.key === 'Backspace')) && selected.length) { event.preventDefault(); setDialog({ type: 'delete', ids: selected }); }
      else if (event.key === 'Enter' && selectedNodes.length === 1) { event.preventDefault(); openItem(selectedNodes[0]); }
      else if (mod && event.shiftKey && event.key.toLowerCase() === 'n' && canCreate) { event.preventDefault(); beginCreate('folder'); }
      else if (!mod && !event.altKey && event.key.toLowerCase() === 'n' && canCreate) { event.preventDefault(); beginCreate('file'); }
      else if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); goHistory(-1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function renderTree(parentId = null, depth = 0) {
    return getChildren(nodes, parentId).filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name)).map(item => {
      const hasFolders = getChildren(nodes, item.id).some(n => n.type === 'folder');
      return <div key={item.id}>
        <div className={`tree-row ${folderId === item.id && currentView === 'library' ? 'active' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`} style={{ '--depth': depth }} onDragOver={e => dragOver(e, item.id)} onDragLeave={() => setDropTarget(null)} onDrop={e => drop(e, item.id)}>
          <button className={`tree-expand ${expanded.has(item.id) ? 'expanded' : ''} ${!hasFolders ? 'invisible' : ''}`} aria-label={`${expanded.has(item.id) ? 'Collapse' : 'Expand'} ${item.name}`} tabIndex={hasFolders ? 0 : -1} onClick={() => setExpanded(previous => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}><Icon name="chevron" size={12} /></button>
          <button className="tree-folder" onClick={() => navigate(item.id)}><Icon name="folder" size={16} /><span>{item.name}</span><span className="tree-count">{getChildren(nodes, item.id).length}</span></button>
        </div>
        {hasFolders && expanded.has(item.id) && renderTree(item.id, depth + 1)}
      </div>;
    });
  }

  const itemProps = item => ({
    draggable: true,
    onDragStart: event => dragStart(event, item),
    onDragEnd: () => setDropTarget(null),
    onClick: event => selectItem(event, item.id),
    onDoubleClick: () => openItem(item),
    onContextMenu: event => showMenu(event, [item.id]),
    onKeyDown: event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectItem(event, item.id); }
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); openItem(item); }
    },
    ...(item.type === 'folder' ? { onDragOver: event => dragOver(event, item.id), onDragLeave: () => setDropTarget(null), onDrop: event => drop(event, item.id) } : {}),
    tabIndex: 0,
    'aria-label': `${item.name}, ${item.type === 'folder' ? 'folder' : 'text file'}`,
    'aria-selected': selected.includes(item.id),
  });

  function renderRow(item) {
    return <tr key={item.id} className={`file-row ${selected.includes(item.id) ? 'selected' : ''} ${clipboard?.mode === 'move' && clipboard.ids.includes(item.id) ? 'cut-item' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`} {...itemProps(item)} role="row">
      <td className="checkbox-cell"><button className={`checkbox ${selected.includes(item.id) ? 'checked' : ''}`} onClick={event => { event.stopPropagation(); setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id]); }} aria-label={`Select ${item.name}`} aria-pressed={selected.includes(item.id)}>{selected.includes(item.id) && <Icon name="check" size={11} />}</button></td>
      <td><div className="file-name"><span className={`file-icon ${item.type === 'folder' ? 'is-folder' : ''}`}><Icon name={item.type} size={21} /></span><span className="name-and-path"><span>{item.name}</span>{(searching || currentView !== 'library') && <small>{getAncestors(nodes, item.id).map(n => n.name).join(' / ') || 'Library'}</small>}</span>{item.starred && <Icon name="star" size={12} className="starred-icon" />}</div></td>
      <td className="type-cell">{item.type === 'folder' ? 'Folder' : 'Plain text'}</td>
      <td className="date-cell">{formatDate(item.updatedAt)}</td>
      <td className="size-cell">{item.type === 'folder' ? `${getChildren(nodes, item.id).length} items` : '0 B'}</td>
      <td className="more-cell"><button className="icon-button item-more" aria-label={`More options for ${item.name}`} onClick={event => showMenu(event, [item.id])}><Icon name="more" size={18} /></button></td>
    </tr>;
  }

  function renderTable(entries, allItems = false) {
    return <div className="table-scroll"><table className="file-table" aria-label={allItems ? 'Library items' : 'Text files'}>
      <thead><tr><th className="checkbox-cell"><button className={`checkbox ${entries.length && entries.every(n => selected.includes(n.id)) ? 'checked' : ''}`} aria-label="Select all items in this table" onClick={() => setSelected(entries.every(n => selected.includes(n.id)) ? selected.filter(id => !entries.some(n => n.id === id)) : [...new Set([...selected, ...entries.map(n => n.id)])])}>{entries.length > 0 && entries.every(n => selected.includes(n.id)) && <Icon name="check" size={11} />}</button></th><th>Name <Icon name="arrowUp" size={11} /></th><th className="type-cell">Type</th><th className="date-cell">Modified</th><th className="size-cell">Size</th><th className="more-cell" /></tr></thead>
      <tbody>{entries.map(renderRow)}</tbody>
    </table></div>;
  }

  const menuItems = menu?.ids.map(id => nodes.find(n => n.id === id)).filter(Boolean) || [];
  const detail = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const transferFolders = [];
  function collectDestinations(parentId = null, depth = 0) {
    getChildren(nodes, parentId).filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
      const disabled = dialog?.ids?.some(id => id === item.id || isDescendant(nodes, item.id, id));
      transferFolders.push({ ...item, depth, disabled });
      if (!disabled) collectDestinations(item.id, depth + 1);
    });
  }
  if (dialog?.type === 'transfer') collectDestinations();

  return <div className="app-shell">
    {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Library navigation">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate(); }}><span className="brand-mark"><i /><i /><i /></span><span>coderecall<span className="brand-dot">.</span></span></a>
      <div className="workspace-card"><span className="workspace-avatar">P</span><div><strong>Personal workspace</strong><span>Just for you</span></div><Icon name="down" size={14} /></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="primary-nav">
        <button className={`nav-item ${currentView === 'library' && !folderId ? 'active' : ''}`} onClick={() => navigate()} onDragOver={event => dragOver(event, null)} onDrop={event => drop(event, null)}><Icon name="grid" size={18} /><span>Library</span><span className="nav-count">{nodes.length}</span></button>
        <button className={`nav-item ${currentView === 'starred' ? 'active' : ''}`} onClick={() => navigate(null, 'starred')}><Icon name="star" size={18} /><span>Starred</span>{nodes.filter(n => n.starred).length > 0 && <span className="subtle-count">{nodes.filter(n => n.starred).length}</span>}</button>
        <button className={`nav-item ${currentView === 'recent' ? 'active' : ''}`} onClick={() => navigate(null, 'recent')}><Icon name="clock" size={18} /><span>Recent</span></button>
      </nav>
      <div className="sidebar-label folders-label"><span>FOLDERS</span><button className="icon-button" aria-label="Create a folder" onClick={() => beginCreate('folder')}><Icon name="plus" size={15} /></button></div>
      <div className="folder-tree">{renderTree()}</div>
      <button className="sidebar-new" onClick={() => beginCreate('folder')}><Icon name="plus" size={15} /> New folder</button>
      <div className="sidebar-bottom"><div className="local-note"><span className="local-note-icon"><Icon name="bolt" size={16} /></span><div><strong>Your space to build.</strong><p>Small ideas. Great things.</p></div></div><div className="sidebar-footer"><span className="status-dot" /> Stored on this device <button className="icon-button" aria-label="About local storage" onClick={() => setDialog({ type: 'about' })}><Icon name="info" size={14} /></button></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="topbar-location"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><span className="topbar-workspace">Personal workspace</span><span className="topbar-divider">/</span><span>Library</span></div>
        <div className="topbar-right"><div className="search-box"><Icon name="search" size={16} /><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); setSelected([]); }} placeholder="Search your library..." aria-label="Search your library" />{query ? <button className="icon-button" aria-label="Clear search" onClick={clearSearch}><Icon name="close" size={13} /></button> : <kbd>/</kbd>}</div><span className="topbar-separator" /><button className="icon-button help-button" aria-label="Keyboard shortcuts" onClick={() => setDialog({ type: 'help' })}><Icon name="help" size={19} /></button><span className="user-avatar" aria-label="Personal workspace">P</span></div>
      </header>

      <main className="main" onContextMenu={event => { if (!event.target.closest('input,button,select')) showMenu(event); }}>
        <div className="navigation-row"><div className="history-buttons"><button className="icon-button" aria-label="Go back" disabled={history.index === 0} onClick={() => goHistory(-1)}><Icon name="back" size={16} /></button><button className="icon-button" aria-label="Go forward" disabled={history.index === history.entries.length - 1} onClick={() => goHistory(1)}><Icon name="forward" size={16} /></button></div><span className="nav-divider" /><nav className="breadcrumbs" aria-label="Breadcrumb"><button onClick={() => navigate()} onDragOver={event => dragOver(event, null)} onDrop={event => drop(event, null)}><Icon name="library" size={14} /><span>Library</span></button>{currentView !== 'library' && <><Icon name="chevron" size={12} /><span>{currentView === 'starred' ? 'Starred' : 'Recent'}</span></>}{breadcrumb.map(item => <span className="breadcrumb-part" key={item.id}><Icon name="chevron" size={12} /><button onClick={() => navigate(item.id)} onDragOver={event => dragOver(event, item.id)} onDrop={event => drop(event, item.id)}>{item.name}</button></span>)}</nav></div>

        <div className="page-heading"><div><div className="eyebrow">A PLACE FOR EVERYTHING</div><h1>{title}<span className="heading-dot">.</span></h1><p>{searching ? `Everything matching “${query.trim()}” across your library.` : currentView === 'starred' ? 'The things you want to keep close.' : currentView === 'recent' ? 'Pick up where your ideas left off.' : folder ? 'A little room for your next big idea.' : 'Your ideas, projects, and little sparks. All in one place.'}</p></div><div className="create-actions"><button className="button secondary" onClick={() => beginCreate('folder')} disabled={!canCreate}><Icon name="folder" size={16} /><span>New folder</span></button><button className="button primary" onClick={() => beginCreate('file')} disabled={!canCreate}><Icon name="plus" size={18} /><span>New file</span></button></div></div>

        <div className="library-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter items">{[['all', 'All items', baseItems.length], ['folder', 'Folders', baseItems.filter(n => n.type === 'folder').length], ['file', 'Text files', baseItems.filter(n => n.type === 'file').length]].map(([value, label, count]) => <button role="tab" aria-selected={filter === value} className={`filter-tab ${filter === value ? 'active' : ''}`} key={value} onClick={() => { setFilter(value); setSelected([]); }}><span>{label}</span><span className="filter-count">{count}</span></button>)}</div><div className="view-options"><label className="sort-control"><Icon name="sort" size={15} /><select aria-label="Sort items" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="modified">Last modified</option></select><Icon name="down" size={12} /></label><div className="layout-toggle" aria-label="Layout"><button className={layout === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Icon name="grid" size={15} /></button><button className={layout === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><Icon name="list" size={17} /></button></div></div></div>

        {selected.length > 0 && <div className="selection-toolbar"><span><span className="selection-number">{selected.length}</span> selected</span><div>{selectedNodes.length === 1 && <button onClick={() => beginRename(selectedNodes[0])}><Icon name="edit" size={14} />Rename</button>}<button onClick={() => rememberClipboard('copy')}><Icon name="copy" size={14} />Copy</button><button onClick={() => beginTransfer('move')}><Icon name="move" size={14} />Move</button><button aria-label="Delete selected items" onClick={() => setDialog({ type: 'delete', ids: selected })}><Icon name="trash" size={14} /><span className="selection-delete-label">Delete</span></button><button className="icon-button" aria-label="Clear selection" onClick={() => setSelected([])}><Icon name="close" size={14} /></button></div></div>}

        <div className={`library-content ${dropTarget === 'root' ? 'root-drop-target' : ''}`} onDragOver={event => canCreate && dragOver(event, folderId)} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }} onDrop={event => canCreate && drop(event, folderId)} onClick={event => { if (event.target === event.currentTarget) setSelected([]); }}>
          {items.length === 0 ? <div className="empty-state"><div className="empty-art"><Icon name={searching ? 'search' : currentView === 'starred' ? 'star' : 'folder'} size={36} /></div><h2>{searching ? 'No matches this time' : currentView === 'starred' ? 'Keep your favorites close' : 'A fresh start'}</h2><p>{searching ? 'Try another name, or clear your search to see everything.' : currentView === 'starred' ? 'Star any file or folder from its menu to find it here.' : filter !== 'all' ? `There are no ${filter === 'folder' ? 'folders' : 'text files'} here yet.` : 'Every great project starts with a little space. Make it yours.'}</p>{canCreate ? <div className="empty-actions"><button className="button secondary" onClick={() => beginCreate('folder')}><Icon name="folder" size={16} />New folder</button><button className="button primary" onClick={() => beginCreate('file')}><Icon name="plus" size={16} />New file</button></div> : searching && <button className="button secondary" onClick={clearSearch}>Clear search</button>}{clipboard && canCreate && <button className="text-button" onClick={paste}><Icon name="paste" size={14} />Paste here</button>}</div> : layout === 'list' ? <section className="items-section list-section">{renderTable(items, true)}</section> : <>
            {folders.length > 0 && <section className="items-section"><div className="section-heading"><h2>Folders <span>{folders.length}</span></h2><span className="section-hint">A little order, a lot of possibility</span></div><div className="folder-grid" role="listbox" aria-label="Folders" aria-multiselectable="true">{folders.map(item => <div key={item.id} className={`folder-card ${selected.includes(item.id) ? 'selected' : ''} ${clipboard?.mode === 'move' && clipboard.ids.includes(item.id) ? 'cut-item' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`} {...itemProps(item)} role="option"><div className="folder-card-top"><FolderArt color={allFolders.findIndex(n => n.id === item.id)} /><button className="icon-button item-more" aria-label={`More options for ${item.name}`} onClick={event => showMenu(event, [item.id])}><Icon name="more" size={18} /></button></div><div className="folder-card-name"><span>{item.name}</span>{item.starred && <Icon name="star" size={12} className="starred-icon" />}</div><div className="folder-card-meta"><span>{getChildren(nodes, item.id).length} {getChildren(nodes, item.id).length === 1 ? 'item' : 'items'}</span><span className="meta-dot">·</span><span>{formatDate(item.updatedAt)}</span></div>{selected.includes(item.id) && <span className="folder-selected"><Icon name="check" size={10} /></span>}</div>)}</div></section>}
            {files.length > 0 && <section className="items-section files-section"><div className="section-heading"><h2>Files <span>{files.length}</span></h2><span className="section-hint">Little notes. Future possibilities.</span></div>{renderTable(files)}</section>}
          </>}
        </div>

        {canCreate && items.length > 0 && <div className="workspace-tip"><span className="tip-icon"><Icon name="bolt" size={16} /></span><div><strong>A little more organized, a little more focused.</strong><p>Drag items into folders, or right-click for more possibilities.</p></div><span className="tip-shortcut"><kbd>N</kbd><span>new file</span></span></div>}
        <footer className="content-footer"><span>{items.length} {items.length === 1 ? 'item' : 'items'}<span className="footer-dot">·</span>{folders.length} {folders.length === 1 ? 'folder' : 'folders'}<span className="footer-dot">·</span>{files.length} {files.length === 1 ? 'file' : 'files'}</span><span className={storageError ? 'storage-warning' : ''}><span className={`status-dot ${storageError ? 'warning' : ''}`} />{storageError ? 'Storage unavailable · session only' : 'All changes saved locally'}</span></footer>
      </main>
    </div>

    {detailsOpen && detail && <aside className="details-panel" aria-label="Item details"><div className="details-heading"><h2>Item details</h2><button className="icon-button" aria-label="Close details" onClick={() => setDetailsOpen(false)}><Icon name="close" /></button></div><div className="details-preview">{detail.type === 'folder' ? <FolderArt /> : <Icon name="file" size={64} />}</div><h3>{detail.name}</h3><span className="detail-badge">{detail.type === 'folder' ? 'Folder' : 'Plain text file'}</span><dl><div><dt>Location</dt><dd>{getAncestors(nodes, detail.id).map(n => n.name).join(' / ') || 'Library'}</dd></div><div><dt>Size</dt><dd>{detail.type === 'folder' ? `${getChildren(nodes, detail.id).length} items` : '0 bytes'}</dd></div><div><dt>Created</dt><dd>{formatDate(detail.createdAt)}</dd></div><div><dt>Modified</dt><dd>{formatDate(detail.updatedAt)}</dd></div></dl>{detail.type === 'file' && <div className="editor-note"><Icon name="info" size={17} /><p>This is an empty text file. For now, give it a name and a place. Editing is coming later.</p></div>}<button className="button secondary details-rename" onClick={() => beginRename(detail)}><Icon name="edit" size={15} />Rename</button></aside>}

    {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} ref={menuRef} role="menu" aria-label="Item actions" onKeyDown={event => { const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus(); } }}>
      {menuItems.length ? <><div className="menu-caption">{menuItems.length === 1 ? menuItems[0].name : `${menuItems.length} items selected`}</div>{menuItems.length === 1 && <><button role="menuitem" onClick={() => { openItem(menuItems[0]); setMenu(null); }}><Icon name={menuItems[0].type === 'folder' ? 'folder' : 'info'} size={15} />{menuItems[0].type === 'folder' ? 'Open folder' : 'File details'}<kbd>↵</kbd></button><button role="menuitem" onClick={() => beginRename(menuItems[0])}><Icon name="edit" size={15} />Rename<kbd>F2</kbd></button><button role="menuitem" onClick={() => { changeNodes(toggleStar(nodes, menuItems[0].id), menuItems[0].starred ? 'Removed from starred' : 'Added to starred'); setMenu(null); }}><Icon name="star" size={15} />{menuItems[0].starred ? 'Remove from starred' : 'Add to starred'}</button></>}<div className="menu-rule" /><button role="menuitem" onClick={() => rememberClipboard('move', menu.ids)}><Icon name="cut" size={15} />Cut<kbd>⌘/Ctrl X</kbd></button><button role="menuitem" onClick={() => rememberClipboard('copy', menu.ids)}><Icon name="copy" size={15} />Copy<kbd>⌘/Ctrl C</kbd></button><button role="menuitem" onClick={() => beginTransfer('move', menu.ids)}><Icon name="move" size={15} />Move to…</button><button role="menuitem" onClick={() => beginTransfer('copy', menu.ids)}><Icon name="copy" size={15} />Copy to…</button><div className="menu-rule" /><button role="menuitem" className="danger-menu-item" onClick={() => { setDialog({ type: 'delete', ids: menu.ids }); setMenu(null); }}><Icon name="trash" size={15} />Delete<kbd>Del</kbd></button></> : <><button role="menuitem" disabled={!canCreate} onClick={() => beginCreate('folder')}><Icon name="folder" size={15} />New folder</button><button role="menuitem" disabled={!canCreate} onClick={() => beginCreate('file')}><Icon name="file" size={15} />New text file<kbd>N</kbd></button><div className="menu-rule" /><button role="menuitem" disabled={!clipboard || !canCreate} onClick={paste}><Icon name="paste" size={15} />Paste<kbd>⌘/Ctrl V</kbd></button></>}
    </div>}

    {dialog && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={event => { if (event.key !== 'Tab') return; const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')]; const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}>
      <button className="icon-button modal-close" aria-label="Close dialog" onClick={() => setDialog(null)}><Icon name="close" size={18} /></button>
      {(dialog.type === 'create' || dialog.type === 'rename') && <form onSubmit={submitName}><span className="modal-icon"><Icon name={dialog.type === 'create' ? dialog.itemType : 'edit'} size={24} /></span><h2 id="dialog-title">{dialog.type === 'rename' ? 'A new name' : dialog.itemType === 'folder' ? 'Make a little space' : 'Start with a blank page'}</h2><p>{dialog.type === 'rename' ? 'A familiar idea, with a fresh name.' : `Create ${dialog.itemType === 'folder' ? 'a folder' : 'an empty text file'} in ${folder?.name || 'your library'}.`}</p><label className="field-label" htmlFor="item-name">{dialog.type === 'rename' ? 'Name' : dialog.itemType === 'folder' ? 'Folder name' : 'File name'}</label><input className={`name-input ${error ? 'invalid' : ''}`} id="item-name" ref={nameRef} value={name} onChange={event => { setName(event.target.value); setError(''); }} maxLength={200} autoComplete="off" aria-describedby={error ? 'dialog-error' : undefined} />{error && <p className="field-error" id="dialog-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="button primary">{dialog.type === 'rename' ? 'Save name' : dialog.itemType === 'folder' ? 'Create folder' : 'Create file'}<Icon name="forward" size={15} /></button></div></form>}
      {dialog.type === 'transfer' && <><span className="modal-icon"><Icon name={dialog.mode === 'move' ? 'move' : 'copy'} size={24} /></span><h2 id="dialog-title">{dialog.mode === 'move' ? 'Find a new home' : 'Make a copy'}</h2><p>Choose where to {dialog.mode} {dialog.ids.length === 1 ? `“${nodes.find(n => n.id === dialog.ids[0])?.name}”` : `${dialog.ids.length} items`}.</p><div className="destination-list" role="listbox" aria-label="Destination folder"><button className={`destination-row ${destination === null ? 'active' : ''}`} role="option" aria-selected={destination === null} onClick={() => setDestination(null)}><Icon name="library" size={18} /><span>Library</span>{destination === null && <Icon name="check" size={16} />}</button>{transferFolders.map(item => <button key={item.id} className={`destination-row ${destination === item.id ? 'active' : ''}`} style={{ paddingLeft: 19 + item.depth * 19 }} role="option" aria-selected={destination === item.id} disabled={item.disabled} onClick={() => { setDestination(item.id); setError(''); }}><Icon name="folder" size={17} /><span>{item.name}</span>{destination === item.id && <Icon name="check" size={16} />}</button>)}</div>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button className="button primary" onClick={() => transfer(dialog.mode, dialog.ids, destination)}>{dialog.mode === 'move' ? 'Move here' : 'Copy here'}<Icon name="forward" size={15} /></button></div></>}
      {dialog.type === 'delete' && <><span className="modal-icon danger"><Icon name="trash" size={24} /></span><h2 id="dialog-title">Time for a little clear-out?</h2><p>Delete {dialog.ids.length === 1 ? `“${nodes.find(n => n.id === dialog.ids[0])?.name}”` : `${dialog.ids.length} selected items`}? Folders and everything inside them will be removed. You can undo your last change.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Keep it</button><button className="button danger" onClick={removeItems}>Delete {dialog.ids.length > 1 ? 'items' : 'item'}</button></div></>}
      {dialog.type === 'help' && <><span className="modal-icon"><Icon name="bolt" size={24} /></span><h2 id="dialog-title">A few little shortcuts</h2><p>Less clicking, more creating.</p><div className="shortcut-list">{[['Search your library', '/'], ['New text file', 'N'], ['New folder', 'Ctrl / ⌘ Shift N'], ['Rename selected item', 'F2'], ['Copy / cut / paste', 'Ctrl / ⌘ C / X / V'], ['Select all visible items', 'Ctrl / ⌘ A'], ['Undo last change', 'Ctrl / ⌘ Z'], ['Delete selected items', 'Delete'], ['Open folder / file details', 'Enter']].map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div><p className="modal-footnote">Double-click to open. Ctrl/⌘-click to select more. Drag into a folder to move, or hold Ctrl/Alt to copy.</p></>}
      {dialog.type === 'about' && <><span className="modal-icon"><Icon name="library" size={24} /></span><h2 id="dialog-title">Your own little corner</h2><p>Your library is saved in this browser on this device. Folders can hold more folders, and text files start completely empty.</p><div className="about-stat"><span>{allFolders.length} folders</span><span>{allFiles.length} text files</span><span>Endless possibilities</span></div><p className="modal-footnote">This is a local prototype. Clearing your browser data removes this library. File editing and account sync will come later.</p><div className="modal-actions"><button className="button primary" onClick={() => setDialog(null)}>Make yourself at home<Icon name="forward" size={15} /></button></div></>}
    </section></div>}

    {toast && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15} /></span><span>{toast.message}</span>{toast.canUndo && undo && <button onClick={undoChange}>Undo</button>}<button className="toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
  </div>;
}
