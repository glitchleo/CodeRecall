import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './tags.css';

function TagIcon({ className }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 13.5 12 22 2 12V2h10l8.5 8.5a2.12 2.12 0 0 1 0 3Z" /><circle cx="7" cy="7" r="1" /></svg>;
}

const cleanName = (name) => String(name ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
const matchName = (name) => cleanName(name).toLocaleLowerCase('en-US');

export function TagBadges({ tags = [], onRemove }) {
  if (!tags.length) return null;
  return <span className="tag-badges">
    {tags.map((tag) => <span className="tag-badge" key={tag.id} title={tag.name}>
      <span>{tag.name}</span>
      {onRemove && <button type="button" aria-label={`Remove tag ${tag.name}`} onClick={() => onRemove(tag.id)}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>}
    </span>)}
  </span>;
}

export default function TagPicker({ tags = [], selectedIds = [], onToggle, onCreate, label = 'Tags', disabled = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const focusOnOpenRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const menuId = useId();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedQuery = matchName(query);
  const newName = cleanName(query);
  const matchingTags = tags.filter((tag) => matchName(tag.name).includes(normalizedQuery));
  const canCreate = Boolean(newName) && !tags.some((tag) => matchName(tag.name) === normalizedQuery);

  const closeMenu = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);

  useEffect(() => {
    if (disabled && open) closeMenu(false);
  }, [disabled, open, closeMenu]);

  // The toolbar and editor both scroll. A body portal keeps this small menu
  // visible, while its anchor is measured again when either surface moves.
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = (event) => {
      if (event?.type === 'scroll' && menuRef.current?.contains(event.target)) return;
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const anchor = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      if (anchor.bottom < 0 || anchor.top > viewportHeight || anchor.right < 0 || anchor.left > viewportWidth) {
        closeMenu(false);
        return;
      }
      const bounds = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, viewportWidth - bounds.width - 8));
      let top = anchor.bottom + 6;
      if (top + bounds.height > viewportHeight - 8 && anchor.top > bounds.height + 14) top = anchor.top - bounds.height - 6;
      top = Math.max(8, Math.min(top, viewportHeight - bounds.height - 8));
      setPosition((previous) => previous?.top === top && previous?.left === left ? previous : { top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, matchingTags.length, canCreate, error, closeMenu]);

  useLayoutEffect(() => {
    if (open && position && focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) closeMenu(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, closeMenu]);

  function toggleTag(id) {
    setError('');
    try {
      const result = onToggle?.(id);
      if (!result?.ok) setError(result?.message || 'This tag could not be updated. Try again.');
    } catch {
      setError('This tag could not be updated. Try again.');
    }
  }

  function createTag() {
    if (!canCreate) return;
    setError('');
    try {
      const result = onCreate?.(newName);
      if (!result?.ok) {
        setError(result?.message || 'This tag could not be created. Try again.');
        return;
      }
      setQuery('');
      searchRef.current?.focus({ preventScroll: true });
    } catch {
      setError('This tag could not be created. Try again.');
    }
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
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
    <button
      ref={triggerRef}
      type="button"
      className={`tag-picker-trigger${open || selected.size ? ' active' : ''}`}
      data-tag-picker=""
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      disabled={disabled}
      onKeyDown={(event) => {
        if (open) handleMenuKeyDown(event);
      }}
      onClick={() => {
        if (open) closeMenu();
        else {
          setError('');
          setQuery('');
          setPosition(null);
          focusOnOpenRef.current = true;
          setOpen(true);
        }
      }}
    >
      <TagIcon />
      <span>{label}</span>
      {selected.size > 0 && <span className="tag-picker-count" aria-hidden="true">{selected.size}</span>}
      <svg className="tag-picker-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && createPortal(<div
      ref={menuRef}
      id={menuId}
      className="tag-picker-menu"
      data-tag-picker=""
      role="dialog"
      aria-label={`${label} menu`}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={handleMenuKeyDown}
    >
      <div className="tag-picker-heading">{label}</div>
      <input
        ref={searchRef}
        className="tag-picker-search"
        type="text"
        autoComplete="off"
        placeholder="Find or create a tag"
        aria-label="Find or create a tag"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setError(''); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            if (canCreate) createTag();
          } else if (event.key === 'ArrowDown') {
            const firstOption = menuRef.current?.querySelector('input[type="checkbox"]');
            if (firstOption) {
              event.preventDefault();
              firstOption.focus();
            }
          }
        }}
      />
      <div className="tag-picker-options">
        {matchingTags.map((tag) => <label className="tag-picker-option" key={tag.id}>
          <input type="checkbox" aria-label={tag.name} checked={selected.has(tag.id)} onChange={() => toggleTag(tag.id)} />
          <TagIcon />
          <span>{tag.name}</span>
        </label>)}
        {!matchingTags.length && <p className="tag-picker-hint">{normalizedQuery ? 'No matching tags.' : 'Type a name to create a tag.'}</p>}
      </div>
      {canCreate && <button className="tag-picker-create" type="button" onClick={createTag}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
        <span>Create “{newName}”</span>
      </button>}
      {error && <p className="tag-picker-error" role="alert">{error}</p>}
      <p className="tag-picker-footer">Tag changes save automatically.</p>
    </div>, document.body)}
  </>;
}
