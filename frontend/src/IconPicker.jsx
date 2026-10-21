import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ItemIcon from './ItemIcon.jsx';
import { ICON_CATALOG, getIconForItem, normalizeIconId } from './lib/icons.js';
import './icons.css';

export default function IconPicker({ item, onChange, disabled = false, label = 'Icon' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const focusOnOpen = useRef(false);
  const menuId = useId();
  const selectedId = normalizeIconId(item?.iconId);
  const automatic = getIconForItem({ ...item, iconId: null });
  const terms = query.trim().toLocaleLowerCase('en-US').split(/\s+/u).filter(Boolean);
  const matching = ICON_CATALOG.filter((icon) => {
    const text = `${icon.label} ${icon.id} ${icon.keywords.join(' ')}`.toLocaleLowerCase('en-US');
    return terms.every((term) => text.includes(term));
  });

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (disabled) close(false);
  }, [disabled, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = (event) => {
      if (event?.type === 'scroll' && menuRef.current?.contains(event.target)) return;
      const anchor = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      if (anchor.bottom < 0 || anchor.top > viewportHeight) { close(false); return; }
      const left = Math.max(8, Math.min(anchor.left, viewportWidth - menu.width - 8));
      let top = anchor.bottom + 6;
      if (top + menu.height > viewportHeight - 8 && anchor.top > menu.height + 14) top = anchor.top - menu.height - 6;
      top = Math.max(8, Math.min(top, viewportHeight - menu.height - 8));
      setPosition((previous) => previous?.left === left && previous?.top === top ? previous : { left, top });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, matching.length, close]);

  useLayoutEffect(() => {
    if (open && position && focusOnOpen.current) {
      focusOnOpen.current = false;
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, close]);

  function choose(id) {
    try {
      const result = onChange?.(id);
      if (result?.ok === false) { setError(result.message || 'This icon could not be saved.'); return; }
      close();
    } catch (reason) {
      setError(reason?.message || 'This icon could not be saved.');
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      event.stopPropagation();
      const focusable = [...(menuRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])]
        .filter((node) => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      const active = document.activeElement;
      if (!menuRef.current?.contains(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  }

  return <>
    <button ref={triggerRef} type="button" className={`icon-picker-trigger${open ? ' active' : ''}`} disabled={disabled} data-icon-picker=""
      aria-label={`${label}: ${selectedId ? getIconForItem(item).label : 'Automatic'}`} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onKeyDown={open ? handleKeyDown : undefined}
      onClick={() => {
        if (open) close();
        else { setQuery(''); setError(''); setPosition(null); focusOnOpen.current = true; setOpen(true); }
      }}>
      <ItemIcon item={item} size={18} />
      <span>{label}</span>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && createPortal(<div ref={menuRef} id={menuId} className="icon-picker-menu" role="dialog" aria-label="Choose an icon" data-icon-picker=""
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onKeyDown={handleKeyDown}>
      <div className="icon-picker-heading"><strong>Choose an icon</strong><button type="button" aria-label="Close icon picker" onClick={() => close()}><span aria-hidden="true">×</span></button></div>
      <input ref={searchRef} className="icon-picker-search" aria-label="Search icons" placeholder="Search icons" type="search" autoComplete="off"
        value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); menuRef.current?.querySelector('.icon-picker-automatic')?.focus(); }
        }} />
      <button type="button" className={`icon-picker-automatic${selectedId === null ? ' selected' : ''}`} aria-pressed={selectedId === null} onClick={() => choose(null)}>
        <img src={automatic.src} width="24" height="24" alt="" />
        <span>Automatic<small>From name and file type</small></span>
        {selectedId === null && <span className="icon-picker-check" aria-hidden="true">✓</span>}
      </button>
      <div className="icon-picker-grid" aria-label="Available icons">
        {matching.map((icon) => <button type="button" key={icon.id} className={`icon-picker-option${selectedId === icon.id ? ' selected' : ''}`}
          title={icon.label} aria-label={icon.label} aria-pressed={selectedId === icon.id} onClick={() => choose(icon.id)}>
          <img src={icon.src} width="27" height="27" alt="" draggable="false" /><span>{icon.label}</span>
        </button>)}
        {!matching.length && <p className="icon-picker-empty">No icons match “{query}”.</p>}
      </div>
      {error && <p className="icon-picker-error" role="alert">{error}</p>}
      <p className="icon-picker-footer">Any icon works with a file or folder.</p>
    </div>, document.body)}
  </>;
}
