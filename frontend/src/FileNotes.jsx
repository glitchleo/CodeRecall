import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_NOTES_FONT_SIZE, MAX_NOTE_LENGTH, NOTES_FONT_SIZES, equalNotes, normalizeNoteRuns, normalizeNotes } from './lib/notes.js';
import { MAX_LINK_LENGTH } from './lib/noteLinks.js';
import './notes.css';

const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function populateDocument(element, notes) {
  const fragment = document.createDocumentFragment();
  for (const run of notes.descriptionFormat.runs) {
    const span = document.createElement('span');
    span.textContent = run.text;
    if (run.bold) span.style.fontWeight = '700';
    if (run.italic) span.style.fontStyle = 'italic';
    if (run.underline) span.style.textDecoration = 'underline';
    if (run.fontSize) span.style.fontSize = `${run.fontSize}px`;
    if (run.link) {
      // A reference is one atomic chip: click opens it, Backspace removes it whole.
      span.className = 'notes-link';
      span.contentEditable = 'false';
      span.setAttribute('role', 'link');
      span.tabIndex = 0;
      span.dataset.link = run.link;
      if (run.linkId) span.dataset.linkId = run.linkId;
      span.title = run.link;
    }
    fragment.appendChild(span);
  }
  element.replaceChildren(fragment);
}

function normalizeNativeFontSize(element, size) {
  // A collapsed selection may defer creation of the native font tag until the
  // next keystroke. Patch attributes in place both now and on every input so
  // the browser keeps the same selection and pending formatting never leaks.
  element.querySelectorAll('font[size="7"]').forEach(font => {
    font.removeAttribute('size');
    font.style.fontSize = `${size}px`;
  });
}

function readDocument(element) {
  const runs = [];
  const add = (text, marks) => { if (text) runs.push({ text, ...marks }); };
  const visit = (node, inherited = {}) => {
    if (node.nodeType === 3) { add(node.textContent.replace(/\u00a0/g, ' '), inherited); return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'BR') {
      // Chromium keeps one BR in an otherwise empty editable line so the caret
      // has a place to sit. It is a placeholder, including when nested in spans.
      let line = node.parentElement;
      while (line !== element && !['DIV', 'P'].includes(line.tagName)) line = line.parentElement;
      const placeholder = !line.textContent && line.querySelectorAll('br').length === 1;
      if (!placeholder) add('\n', inherited);
      return;
    }
    const marks = { ...inherited };
    if (['B', 'STRONG'].includes(node.tagName) || Number.parseInt(node.style.fontWeight, 10) >= 600 || node.style.fontWeight === 'bold') marks.bold = true;
    else if (node.style.fontWeight && (node.style.fontWeight === 'normal' || Number.parseInt(node.style.fontWeight, 10) < 600)) marks.bold = false;
    if (['I', 'EM'].includes(node.tagName) || node.style.fontStyle === 'italic') marks.italic = true;
    else if (node.style.fontStyle === 'normal') marks.italic = false;
    if (node.tagName === 'U' || node.style.textDecoration.includes('underline')) marks.underline = true;
    else if (node.style.textDecoration.includes('none')) marks.underline = false;
    const size = Number.parseFloat(node.style.fontSize);
    if (NOTES_FONT_SIZES.includes(size)) marks.fontSize = size;
    if (node.dataset?.link) {
      add(node.textContent.replace(/\u00a0/g, ' '), { ...marks, link: node.dataset.link.slice(0, MAX_LINK_LENGTH), ...(node.dataset.linkId ? { linkId: node.dataset.linkId } : {}) });
      return;
    }
    if (['DIV', 'P'].includes(node.tagName) && node.previousSibling) add('\n', inherited);
    node.childNodes.forEach(child => visit(child, marks));
  };
  element.childNodes.forEach(node => visit(node));
  const normalized = normalizeNoteRuns(runs);
  return { description: normalized.map(run => run.text).join(''), descriptionFormat: { version: 1, runs: normalized } };
}

/** Rich editing surface; all persistent output is validated text + explicit marks. */
export default function FileNotes({ value, onChange, readOnly = false, resolveLink, onOpenLink, label = 'File notes', placeholder = 'Explain what this code does, add examples, or leave a note for later…' }) {
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const pendingFontSizeRef = useRef(DEFAULT_NOTES_FONT_SIZE);
  const currentRef = useRef(normalizeNotes(value));
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  const [count, setCount] = useState(currentRef.current.description.length);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false, fontSize: DEFAULT_NOTES_FONT_SIZE });
  const [limitMessage, setLimitMessage] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPath, setLinkPath] = useState('');
  const [linkError, setLinkError] = useState('');
  const linkInputRef = useRef(null);
  const sizes = [...NOTES_FONT_SIZES].sort((a, b) => a - b);

  useLayoutEffect(() => {
    const next = normalizeNotes(value);
    const element = editorRef.current;
    if (element && (!element.dataset.initialized || !equalNotes(next, currentRef.current))) {
      populateDocument(element, next);
      element.dataset.initialized = 'true';
    }
    currentRef.current = next;
    setCount(next.description.length);
  }, [value]);

  const captureSelection = useCallback(() => {
    const element = editorRef.current;
    const selection = window.getSelection();
    if (!element || !selection?.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return;
    normalizeNativeFontSize(element, pendingFontSizeRef.current);
    selectionRef.current = selection.getRangeAt(0).cloneRange();
    const anchorElement = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
    const computedSize = Number.parseFloat(window.getComputedStyle(anchorElement).fontSize);
    const pendingSize = document.queryCommandValue('fontSize') === '7' ? pendingFontSizeRef.current : computedSize;
    setActive({
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'),
      fontSize: NOTES_FONT_SIZES.includes(pendingSize) ? pendingSize : DEFAULT_NOTES_FONT_SIZE,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [captureSelection]);

  const publish = useCallback(() => {
    const element = editorRef.current;
    normalizeNativeFontSize(element, pendingFontSizeRef.current);
    const next = readDocument(element);
    if (next.description.length > MAX_NOTE_LENGTH) {
      populateDocument(element, currentRef.current);
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      setLimitMessage('Notes can contain up to 4,000 characters.');
      return;
    }
    setLimitMessage('');
    currentRef.current = next;
    setCount(next.description.length);
    callbackRef.current?.(next);
    captureSelection();
  }, [captureSelection]);

  const restoreSelection = () => {
    const element = editorRef.current;
    element.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (selectionRef.current && element.contains(selectionRef.current.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    } else if (!selection?.rangeCount || !element.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const format = (command, size) => {
    restoreSelection();
    if (command === 'fontSize') {
      // Native editing preserves caret/selection and undo; normalize its temporary
      // font tags to an explicit supported pixel size before serializing.
      pendingFontSizeRef.current = size;
      document.execCommand('fontSize', false, '7');
      normalizeNativeFontSize(editorRef.current, size);
    } else document.execCommand(command, false);
    publish();
    captureSelection();
    if (size) setActive(current => ({ ...current, fontSize: size }));
  };

  // A− / A+ move one step through the supported sizes.
  const stepFontSize = direction => {
    const index = sizes.indexOf(active.fontSize);
    const from = index === -1 ? sizes.indexOf(DEFAULT_NOTES_FONT_SIZE) : index;
    const next = sizes[Math.min(sizes.length - 1, Math.max(0, from + direction))];
    if (next !== undefined && next !== active.fontSize) format('fontSize', next);
  };

  const openLinkBar = () => {
    if (readOnly) return;
    captureSelection();
    setLinkPath('');
    setLinkError('');
    setLinkOpen(true);
    requestAnimationFrame(() => linkInputRef.current?.focus());
  };

  const closeLinkBar = () => {
    setLinkOpen(false);
    setLinkError('');
    restoreSelection();
  };

  const insertLink = () => {
    const target = resolveLink?.(linkPath.trim());
    if (!resolveLink) { setLinkError('Linking to files is not available here.'); return; }
    if (!target) { setLinkError('No file found at that path. Copy it from the editor path bar (files only).'); return; }
    if (target.path.length > MAX_LINK_LENGTH) { setLinkError('That path is too long to link.'); return; }
    restoreSelection();
    const selected = window.getSelection()?.toString().replace(/\s+/g, ' ').trim().slice(0, 120);
    const chip = `<span class="notes-link" contenteditable="false" role="link" tabindex="0" data-link="${escapeHtml(target.path)}" data-link-id="${escapeHtml(target.id)}" title="${escapeHtml(target.path)}">${escapeHtml(selected || target.name)}</span>&nbsp;`;
    document.execCommand('insertHTML', false, chip);
    setLinkOpen(false);
    setLinkError('');
    publish();
  };

  const openLinkedFile = chip => {
    const target = resolveLink?.({ path: chip.dataset.link, id: chip.dataset.linkId });
    if (!target) { setLimitMessage('That linked file no longer exists.'); return; }
    setLimitMessage('');
    onOpenLink?.(target);
  };

  const pastePlainText = event => {
    event.preventDefault();
    const selection = window.getSelection();
    const selectedLength = selection?.toString().length || 0;
    const available = Math.max(0, MAX_NOTE_LENGTH - count + selectedLength);
    const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, available);
    document.execCommand('insertText', false, text);
    publish();
  };

  return <div className={`file-notes${readOnly ? ' file-notes-readonly' : ''}`}>
    {!readOnly && <div className="notes-format-toolbar" role="toolbar" aria-label="Note formatting">
      <label className="notes-size-label"><span className="notes-sr-only">Note font size</span><select aria-label="Note font size" value={active.fontSize}
        onMouseDown={captureSelection} onChange={event => format('fontSize', Number(event.target.value))}>
        {NOTES_FONT_SIZES.map(size => <option key={size} value={size}>{size} px</option>)}
      </select></label>
      <button className="notes-step-button" type="button" title="Smaller text" aria-label="Decrease font size" disabled={active.fontSize <= sizes[0]}
        onMouseDown={event => { event.preventDefault(); captureSelection(); }} onClick={() => stepFontSize(-1)}>A<span aria-hidden="true">−</span></button>
      <button className="notes-step-button" type="button" title="Larger text" aria-label="Increase font size" disabled={active.fontSize >= sizes.at(-1)}
        onMouseDown={event => { event.preventDefault(); captureSelection(); }} onClick={() => stepFontSize(1)}>A<span aria-hidden="true">+</span></button>
      <span className="notes-toolbar-divider" />
      {[['bold', 'B', 'Bold (Ctrl+B)'], ['italic', 'I', 'Italic (Ctrl+I)'], ['underline', 'U', 'Underline (Ctrl+U)']].map(([command, text, title]) =>
        <button key={command} className={`notes-format-${command}`} type="button" title={title} aria-label={command[0].toUpperCase() + command.slice(1)} aria-pressed={active[command]}
          onMouseDown={event => { event.preventDefault(); captureSelection(); }} onClick={() => format(command)}>{text}</button>)}
      <span className="notes-toolbar-divider" />
      <button className="notes-link-button" type="button" title="Link to another file (Ctrl+K)" aria-label="Link to another file" aria-expanded={linkOpen}
        onMouseDown={event => { event.preventDefault(); captureSelection(); }} onClick={openLinkBar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
      </button>
    </div>}
    {!readOnly && linkOpen && <div className="notes-link-bar" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLinkBar(); }
      else if (event.key === 'Enter') { event.preventDefault(); insertLink(); }
    }}>
      <input ref={linkInputRef} type="text" value={linkPath} aria-label="Path of the file to link" placeholder="Paste a file path, e.g. D:/Utils/math.js" spellCheck={false}
        onChange={event => { setLinkPath(event.target.value); setLinkError(''); }} />
      <button type="button" className="notes-link-add" onClick={insertLink} disabled={!linkPath.trim()}>Add link</button>
      <button type="button" className="notes-link-cancel" onClick={closeLinkBar}>Cancel</button>
      {linkError && <span className="notes-link-error" role="alert">{linkError}</span>}
    </div>}
    <div ref={editorRef} className="notes-editable" contentEditable={!readOnly} suppressContentEditableWarning role={readOnly ? 'document' : 'textbox'}
      aria-label={label} aria-multiline={readOnly ? undefined : true} data-empty={count === 0} data-placeholder={placeholder}
      spellCheck={!readOnly} onInput={publish}
      onClick={event => { const chip = event.target.closest?.('[data-link]'); if (chip && editorRef.current.contains(chip)) { event.preventDefault(); openLinkedFile(chip); } }} onPaste={readOnly ? undefined : pastePlainText}
      onDrop={event => { if (!readOnly) { event.preventDefault(); document.execCommand('insertText', false, event.dataTransfer.getData('text/plain')); publish(); } }}
      onKeyDown={event => {
        if (event.key === 'Enter' && event.target.dataset?.link) { event.preventDefault(); openLinkedFile(event.target); return; }
        if (!readOnly && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
          event.preventDefault(); event.stopPropagation(); openLinkBar(); return;
        }
        const command = { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()];
        if (!readOnly && (event.ctrlKey || event.metaKey) && !event.altKey && command) { event.preventDefault(); captureSelection(); format(command); }
      }} />
    {readOnly && limitMessage && <div className="notes-document-footer" role="status"><span>{limitMessage}</span></div>}
    {!readOnly && <div className="notes-document-footer"><span role="status">{limitMessage || 'Text & formatting'}</span><span>{count.toLocaleString()} / 4,000</span></div>}
  </div>;
}