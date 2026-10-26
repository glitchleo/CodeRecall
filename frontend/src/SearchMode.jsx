import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ItemIcon from './ItemIcon.jsx';
import TagPicker, { TagBadges } from './TagPicker.jsx';
import MetadataPanel from './MetadataPanel.jsx';
import { CodeTokens } from './SyntaxCode.jsx';
import { getAncestors } from './lib/library.js';
import { buildSearchIndex } from './lib/search.js';
import { getFileTags } from './lib/tags.js';
import { ROOT_LABEL, formatDateTime, getItemType } from './lib/explorer.js';
import { FILE_TEMPLATES, OTHER_FILE_TEMPLATE } from './lib/fileTypes.js';
import './search.css';

export function SearchIcon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    up: <path d="M12 20V4m-6 6 6-6 6 6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    edit: <><path d="m16 3 5 5-12 12H4v-5L16 3ZM13 6l5 5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    down: <path d="m7 10 5 5 5-5" />,
    drive: <><path d="M4 5h16l2 12H2L4 5Zm-2 12v4h20v-4M6 18.5h.01M9 18.5h.01" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    notes: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M14 3v18M17 8h1M17 12h1M17 16h1" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8 3 3M16 8l5-5M8 16l-5 5M16 16l5 5" /></>,
    split: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.search}</svg>;
}

// Small, bounded previews keep large snippets from making result cards expensive.
export function CodeLines({ content = '', filename = '', preview = false }) {
  const text = preview ? content.slice(0, 6000).split('\n').slice(0, 12).join('\n') : content;
  const code = <pre className={`snippet-code${preview ? ' snippet-code-preview' : ''}`}><code>{text ? <CodeTokens code={text} filename={filename} /> : <span className="code-empty">No code yet</span>}</code></pre>;
  return preview ? code : <div className="snippet-document"><pre className="snippet-read-gutter" aria-hidden="true">{text.split('\n').map((_, index) => index + 1).join('\n')}</pre>{code}</div>;
}

function ResultCard({ item, tags, previews, childCount, path, onOpen, onEdit, onCopy, onDetails }) {
  const assigned = getFileTags(item, tags);
  return <article className={`result-card ${item.type}-card`} aria-label={`${item.type}: ${item.name}`} onClick={event => { if (!event.target.closest('button')) onOpen(item); }}>
    <div className="result-card-heading"><button className="result-title" onClick={() => onOpen(item)} title={`Open ${item.name}`}><ItemIcon item={item} size={20} /><span>{item.name}</span></button></div>
    {item.type === 'folder' ? <div className="folder-card-body">
      <div className="folder-card-caption">{childCount} {childCount === 1 ? 'item' : 'items'}</div>
      <div className="folder-preview-list">{previews.map(({ item: child }) => <button key={child.id} className="folder-preview-row" onClick={() => onOpen(child)} title={`Open ${child.name}`}><ItemIcon item={child} size={18} /><span>{child.name}</span><SearchIcon name="arrow" size={14} /></button>)}{previews.length === 0 && <span className="folder-empty">Empty folder</span>}</div>
    </div> : <button className="code-preview-button" onClick={() => onOpen(item)} aria-label={`Read ${item.name}`}><CodeLines content={item.content} filename={item.name} preview /><span className="code-preview-fade" /></button>}
    {(item.description || assigned.length > 0) && <div className="result-card-meta">{item.description && <p className="result-description" title={item.description}>{item.description}</p>}{assigned.length > 0 && <div className="result-tags"><TagBadges tags={assigned.slice(0, 3)} />{assigned.length > 3 && <span className="more-tags">+{assigned.length - 3}</span>}</div>}</div>}
    <footer className="result-card-footer"><span className="result-location" title={path || ROOT_LABEL}>{path || ROOT_LABEL}</span><div>
      {item.type === 'file' && <><button title={`Copy code from ${item.name}`} aria-label={`Copy code from ${item.name}`} onClick={() => onCopy(item)}><SearchIcon name="copy" size={15} /></button><button title={`Edit ${item.name}`} aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><SearchIcon name="edit" size={15} /></button></>}
      <button title={`Details for ${item.name}`} aria-label={`Details for ${item.name}`} onClick={() => onDetails(item)}><SearchIcon name="info" size={15} /></button>
    </div></footer>
  </article>;
}

export default function SearchMode({ nodes, tags, query, onQuery, searchRef, tagFilter, onToggleFilter, onCreateTag, onClearFilters, folderId, breadcrumb, onNavigate, onBack, canBack, onEdit, onCreate, onCopy, onSaveMetadata, onToggleTag, storageError }) {
  const [openedId, setOpenedId] = useState(null);
  const [detailsOnly, setDetailsOnly] = useState(false);
  const [kind, setKind] = useState('all');
  const [browseChildren, setBrowseChildren] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const closeViewer = useCallback(() => setOpenedId(null), []);
  const resultsRef = useRef(null);
  const folder = nodes.find(node => node.id === folderId);
  const searchIndex = useMemo(() => buildSearchIndex(nodes, tags, { query, tagIds: tagFilter }), [nodes, tags, query, tagFilter]);
  const ranked = useMemo(() => searchIndex.search({ folderId, directOnly: browseChildren && folderId !== null }), [searchIndex, folderId, browseChildren]);
  const results = useMemo(() => ranked.filter(({ item }) => kind === 'all' || item.type === kind), [ranked, kind]);
  const paths = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return new Map(nodes.map(node => { const parts = []; let parent = byId.get(node.parentId); while (parent) { parts.unshift(parent.name); parent = byId.get(parent.parentId); } return [node.id, parts.join(' / ')]; }));
  }, [nodes]);
  const opened = nodes.find(node => node.id === openedId);
  const searching = Boolean(query.trim() || tagFilter.length);
  useEffect(() => { resultsRef.current?.scrollTo(0, 0); }, [query, folderId, kind, tagFilter]);
  useEffect(() => {
    const handler = event => { if (event.key === 'Escape' && newMenu) { event.stopPropagation(); setNewMenu(false); } };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [newMenu]);
  function navigate(id) { setBrowseChildren(id !== null); onNavigate(id); setNewMenu(false); }
  function open(item) { if (item.type === 'folder') navigate(item.id); else { setDetailsOnly(false); setOpenedId(item.id); } }
  function details(item) { setDetailsOnly(item.type === 'folder'); setOpenedId(item.id); }
  return <section className="find-workspace" aria-label="Find code">
    <div className="command-bar find-command-bar" role="toolbar" aria-label="Search actions">
      <div className="find-new-wrap"><button className="toolbar-button" aria-expanded={newMenu} onClick={() => setNewMenu(value => !value)}><SearchIcon name="plus" size={16} /><span>New</span><SearchIcon name="down" size={12} /></button>{newMenu && <><button className="find-menu-dismiss" aria-label="Close new menu" onClick={() => setNewMenu(false)} /><div className="find-new-menu" role="menu" aria-label="Create a folder or file"><button role="menuitem" className="find-new-folder" onClick={() => { setNewMenu(false); onCreate('folder'); }}><ItemIcon item={{ type: 'folder', name: 'Folder' }} /><span>Folder</span></button><span className="find-new-caption">Programming files</span>{[...FILE_TEMPLATES, OTHER_FILE_TEMPLATE].map(template => <button role="menuitem" key={template.id} onClick={() => { setNewMenu(false); onCreate(template.id); }}><ItemIcon item={{ type: 'file', name: template.defaultName || 'file' }} /><span>{template.label}</span><small>{template.extension || 'name.ext'}</small></button>)}</div></>}</div>
      <span className="toolbar-separator" />
      <TagPicker label="Filter tags" tags={tags} selectedIds={tagFilter} onToggle={onToggleFilter} onCreate={name => onCreateTag(name)} />
      <span className="toolbar-separator" />
      <div className="find-kind-tabs" aria-label="Result types">{[['all', 'All items'], ['file', 'Files'], ['folder', 'Folders']].map(([id, label]) => <button key={id} aria-pressed={kind === id} className={kind === id ? 'active' : ''} onClick={() => setKind(id)}>{label}</button>)}</div>
    </div>
    <div className="location-bar find-browse-bar">
      <div className="navigation-controls"><button className="icon-button" disabled={!canBack} aria-label="Go back" onClick={onBack}><SearchIcon name="back" size={16} /></button><button className="icon-button" disabled={!folder} aria-label="Up one level" onClick={() => navigate(folder?.parentId ?? null)}><SearchIcon name="up" size={16} /></button></div>
      <div className="address-bar find-address-bar"><nav className="breadcrumbs" aria-label="Search folder path"><button onClick={() => navigate(null)}><SearchIcon name="drive" size={16} /><span>{ROOT_LABEL}</span></button>{breadcrumb.map(node => <React.Fragment key={node.id}><SearchIcon name="chevron" size={12} /><button aria-current={node.id === folderId ? 'location' : undefined} onClick={() => navigate(node.id)}>{node.name}</button></React.Fragment>)}</nav></div>
      <div className="search-box find-search-box"><input ref={searchRef} value={query} onChange={event => { onQuery(event.target.value); setBrowseChildren(false); }} placeholder={`Search ${folder?.name || ROOT_LABEL}`} aria-label="Search code, descriptions, folders, and tags" autoComplete="off" spellCheck={false} />{query ? <button className="icon-button" aria-label="Clear search" onClick={() => onQuery('')}><SearchIcon name="close" size={13} /></button> : <SearchIcon name="search" size={15} />}</div>
    </div>
    {tagFilter.length > 0 && <div className="find-active-tags"><span>All tags</span><TagBadges tags={tags.filter(tag => tagFilter.includes(tag.id))} onRemove={onToggleFilter} /><button onClick={onClearFilters}>Clear filters</button></div>}
    <div className="find-results-scroll" ref={resultsRef}><div className="result-grid">{results.map(({ item }) => <ResultCard key={item.id} item={item} tags={tags} previews={searchIndex.getChildren(item.id).slice(0, 3)} childCount={searchIndex.getChildren(item.id).length} path={paths.get(item.id)} onOpen={open} onEdit={onEdit} onCopy={onCopy} onDetails={details} />)}</div>
      {!results.length && <div className="find-empty"><p>{searching ? 'No items match your search.' : 'This folder is empty.'}</p>{searching ? <button className="button secondary" onClick={() => { onQuery(''); onClearFilters(); setKind('all'); }}>Clear search and filters</button> : <button className="button secondary" onClick={() => onCreate('python')}>New Python file</button>}</div>}
    </div>
    <footer className="status-bar find-status" role="status"><span>{results.length} {results.length === 1 ? 'item' : 'items'}</span><span className={`status-message${storageError ? ' storage-warning' : ''}`}>{storageError ? 'Browser storage unavailable' : 'Saved locally'}</span></footer>
    {opened && <ItemViewer key={opened.id} item={opened} nodes={nodes} tags={tags} detailsOnly={detailsOnly} onClose={closeViewer} onEdit={() => { setOpenedId(null); onEdit(opened); }} onCopy={() => onCopy(opened)} onSaveMetadata={onSaveMetadata} onToggleTag={onToggleTag} onCreateTag={onCreateTag} />}
  </section>;
}

function ItemViewer({ item, nodes, tags, detailsOnly, onClose, onEdit, onCopy, onSaveMetadata, onToggleTag, onCreateTag }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const metadataRef = useRef(null);
  const bodyRef = useRef(null);
  const [notesMode, setNotesMode] = useState('split');
  const [notesWidth, setNotesWidth] = useState(35);
  const [mobilePane, setMobilePane] = useState('code');
  const changeWidth = value => setNotesWidth(Math.min(75, Math.max(20, Number(value))));
  const resizeNotes = clientX => {
    const bounds = bodyRef.current?.getBoundingClientRect();
    if (bounds?.width) changeWidth((bounds.right - clientX) / bounds.width * 100);
  };
  const requestClose = useCallback(() => {
    if (metadataRef.current && !metadataRef.current.requestSave()?.ok) return;
    onClose();
  }, [onClose]);
  const requestEdit = () => {
    if (metadataRef.current && !metadataRef.current.requestSave()?.ok) return;
    onEdit();
  };
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    function handleKey(event) {
      if (event.target.closest?.('.tag-picker-menu, .icon-picker-menu')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); }
      if (event.key === 'Tab') {
        const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), textarea, input, select, [contenteditable="true"], [tabindex="0"]')].filter(node => node.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    const dialog = dialogRef.current;
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); previous?.isConnected && previous.focus(); };
  }, [requestClose]);
  return <div className="viewer-overlay" data-item-viewer="" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}><section ref={dialogRef} className={`item-viewer${detailsOnly ? ' metadata-viewer' : ''}`} role="dialog" aria-modal="true" aria-labelledby="viewer-title">
    <header className="viewer-heading"><ItemIcon item={item} size={24} /><div><h2 id="viewer-title">{item.name}</h2><p>{['Library', ...getAncestors(nodes, item.id).map(node => node.name)].join(' / ')}</p></div><div className="viewer-actions">{item.type === 'file' && <><button className="button secondary" aria-label="Copy code" onClick={onCopy}><SearchIcon name="copy" size={15} /><span>Copy code</span></button><button className="button primary" aria-label={`Edit ${item.name}`} onClick={requestEdit}><SearchIcon name="edit" size={15} /><span>Edit</span></button></>}<button ref={closeRef} className="icon-button" aria-label="Close preview" onClick={requestClose}><SearchIcon name="close" /></button></div></header>
    {!detailsOnly && <div className="viewer-workspace-bar">
      <div className="viewer-mobile-switch" aria-label="Preview workspace"><button aria-pressed={mobilePane === 'code'} onClick={() => setMobilePane('code')}>Code</button><button aria-pressed={mobilePane === 'notes'} onClick={() => setMobilePane('notes')}>Notes</button></div>
      <span className="viewer-code-caption">Source preview</span>
      <div className="viewer-panel-controls"><button className={notesMode !== 'hidden' ? 'active' : ''} aria-pressed={notesMode !== 'hidden'} aria-label={notesMode === 'hidden' ? 'Show notes panel' : 'Hide notes panel'} title={notesMode === 'hidden' ? 'Show notes panel' : 'Hide notes panel'} onClick={() => setNotesMode(mode => mode === 'hidden' ? 'split' : 'hidden')}><SearchIcon name="notes" size={15} /><span>Notes</span></button>{notesMode !== 'hidden' && <button aria-label={notesMode === 'full' ? 'Restore split view' : 'Expand notes to full width'} title={notesMode === 'full' ? 'Restore split view' : 'Expand notes to full width'} onClick={() => setNotesMode(mode => mode === 'full' ? 'split' : 'full')}><SearchIcon name={notesMode === 'full' ? 'split' : 'expand'} size={15} /></button>}</div>
    </div>}
    <div ref={bodyRef} className={`viewer-body viewer-notes-${notesMode} viewer-mobile-${mobilePane}`} style={{ '--viewer-notes-width': `${notesWidth}%` }}>{!detailsOnly && <div className="viewer-code" tabIndex={0} aria-label="Full code, scroll to read"><CodeLines content={item.content} filename={item.name} /></div>}
      {!detailsOnly && <div className="viewer-resizer" role="separator" aria-label="Resize notes panel" aria-orientation="vertical" aria-valuemin={20} aria-valuemax={75} aria-valuenow={Math.round(notesWidth)} tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeWidth(notesWidth + (event.key === 'ArrowLeft' ? 2 : -2)); } }} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); resizeNotes(event.clientX); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeNotes(event.clientX); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />}
      <aside className="viewer-details" aria-label="Description and tags"><div className="viewer-type">{getItemType(item)}</div><MetadataPanel ref={metadataRef} item={item} tags={tags} onSave={onSaveMetadata} onToggleTag={onToggleTag} onCreateTag={onCreateTag} /><dl className="viewer-dates"><dt>Last updated</dt><dd>{formatDateTime(item.updatedAt)}</dd><dt>Created</dt><dd>{formatDateTime(item.createdAt)}</dd></dl></aside></div>
  </section></div>;
}
