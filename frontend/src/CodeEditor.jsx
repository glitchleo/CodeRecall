import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createEditorState, recordEdit, undoEdit, redoEdit, selectEditorRange, indentSelection, insertLineBreak, normalizeLineEndings } from './lib/editor.js';
import TagPicker, { TagBadges } from './TagPicker.jsx';
import './editor.css';

function EditorIcon({ name, size = 17 }) {
  const paths = {
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>,
    undo: <><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12" /></>,
    redo: <><path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12" /></>,
    wrap: <><path d="M3 6h18M3 12h14a3 3 0 0 1 0 6h-4m3-3-3 3 3 3M3 18h5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function byteLabel(text) {
  const size = new TextEncoder().encode(text).length;
  return size < 1024 ? `${size} B` : `${(size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
}

const CodeEditor = forwardRef(function CodeEditor({ file, path, onSave, onClose, onDirtyChange, persistenceError = false, tags = [], onToggleTag, onCreateTag }, ref) {
  // A textarea uses LF offsets. Normalize the draft and its saved comparison
  // together; opening a CRLF file alone never marks it dirty or saves it.
  const initialText = normalizeLineEndings(typeof file.content === 'string' ? file.content : '');
  const [history, setHistory] = useState(() => createEditorState(initialText));
  const historyRef = useRef(history);
  const [savedText, setSavedText] = useState(initialText);
  const savedTextRef = useRef(initialText);
  const [wrap, setWrap] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [lineHeights, setLineHeights] = useState([]);
  const inputRef = useRef(null);
  const gutterRef = useRef(null);
  const mirrorRef = useRef(null);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const pendingCloseRef = useRef(null);
  const selectionRef = useRef(null);
  const restoringRef = useRef(false);
  const closeRef = useRef(onClose);
  const dirtyCallbackRef = useRef(onDirtyChange);
  closeRef.current = onClose;
  dirtyCallbackRef.current = onDirtyChange;

  const text = history.present.text;
  const dirty = text !== savedText || persistenceError;
  const visibleSaveError = saveError || (persistenceError ? 'Browser storage is unavailable. Save to retry keeping this file.' : '');
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const lines = useMemo(() => normalizeLineEndings(text).split('\n'), [text]);
  const cursorLines = normalizeLineEndings(text.slice(0, history.present.end)).split('\n');
  const language = file.name.toLowerCase().endsWith('.py') ? 'Python' : file.name.toLowerCase().endsWith('.js') ? 'JavaScript' : 'Plain text';
  const assignedTags = tags.filter((tag) => file.tagIds?.includes(tag.id));

  const focusInput = useCallback(() => inputRef.current?.focus({ preventScroll: true }), []);

  const applyHistory = useCallback((next, focus = true) => {
    if (next === historyRef.current) {
      if (focus) focusInput();
      return;
    }
    historyRef.current = next;
    selectionRef.current = { ...next.present, focus };
    setHistory(next);
  }, [focusInput]);

  useLayoutEffect(() => {
    const pending = selectionRef.current;
    const input = inputRef.current;
    if (!pending || !input) return;
    selectionRef.current = null;
    restoringRef.current = true;
    if (pending.focus) input.focus({ preventScroll: true });
    input.setSelectionRange(pending.start, pending.end);
    restoringRef.current = false;
  }, [history]);

  useEffect(() => {
    focusInput();
    return () => dirtyCallbackRef.current?.(false);
  }, [focusInput]);

  useEffect(() => {
    dirtyCallbackRef.current?.(dirty);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const save = useCallback((restoreFocus = true) => {
    const content = historyRef.current.present.text;
    if (content === savedTextRef.current && !persistenceError) {
      setSaveError('');
      if (restoreFocus) focusInput();
      return true;
    }
    try {
      const result = onSave(content);
      if (!result?.ok) {
        setSaveError(result?.message || 'Could not save this file. Your changes are still open here.');
        if (restoreFocus) focusInput();
        return false;
      }
      savedTextRef.current = content;
      setSavedText(content);
      dirtyRef.current = false;
      // A new typing group after Save must undo back to the saved version.
      // Keep every existing undo/redo entry while ending the current group.
      applyHistory({ ...historyRef.current, lastEdit: null }, false);
      setSaveError('');
      if (restoreFocus) focusInput();
      return true;
    } catch (error) {
      setSaveError(error?.message || 'Could not save this file. Your changes are still open here.');
      if (restoreFocus) focusInput();
      return false;
    }
  }, [applyHistory, focusInput, onSave, persistenceError]);

  const requestClose = useCallback((callback) => {
    const complete = typeof callback === 'function' ? callback : closeRef.current;
    if (!dirtyRef.current) {
      complete?.();
      return;
    }
    pendingCloseRef.current = complete;
    setShowUnsaved(true);
  }, []);

  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

  const cancelClose = useCallback(() => {
    pendingCloseRef.current = null;
    setShowUnsaved(false);
  }, []);

  const completeClose = useCallback((shouldSave) => {
    if (shouldSave && !save(false)) return;
    const complete = pendingCloseRef.current;
    pendingCloseRef.current = null;
    setShowUnsaved(false);
    complete?.();
  }, [save]);

  useEffect(() => {
    const keydown = (event) => {
      if (event.target?.closest?.('[data-tag-picker]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!showUnsaved) save();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [save, showUnsaved]);

  useEffect(() => {
    if (!showUnsaved) {
      focusInput();
      return undefined;
    }
    cancelRef.current?.focus();
    const containFocus = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) cancelRef.current?.focus();
    };
    document.addEventListener('focusin', containFocus);
    return () => document.removeEventListener('focusin', containFocus);
  }, [focusInput, showUnsaved]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const resize = () => setWrapWidth(Math.max(0, input.clientWidth - 32));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!wrap || !mirrorRef.current) return;
    const heights = Array.from(mirrorRef.current.children, (line) => line.getBoundingClientRect().height);
    setLineHeights(heights);
  }, [lines, wrap, wrapWidth]);

  const syncSelection = (input) => {
    if (restoringRef.current) return;
    const current = historyRef.current;
    const next = selectEditorRange(current, input.selectionStart, input.selectionEnd);
    if (next !== current) {
      historyRef.current = next;
      setHistory(next);
    }
  };

  const edit = (next, group = null) => {
    applyHistory(recordEdit(historyRef.current, next, { group, time: Date.now() }));
    setSaveError('');
  };

  const handleChange = (event) => {
    const input = event.target;
    const inputType = event.nativeEvent.inputType || '';
    const group = inputType.startsWith('delete') ? 'delete' : inputType === 'insertText' ? 'typing' : null;
    edit({ text: input.value, start: input.selectionStart, end: input.selectionEnd }, group);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault();
      const redo = key === 'y' || event.shiftKey;
      applyHistory(redo ? redoEdit(historyRef.current) : undoEdit(historyRef.current));
      return;
    }
    if (event.key === 'Tab' && !modifier && !event.altKey) {
      event.preventDefault();
      syncSelection(event.currentTarget);
      const current = historyRef.current.present;
      edit(indentSelection(current.text, current.start, current.end, { outdent: event.shiftKey, indent: '    ' }));
    } else if (event.key === 'Enter' && !modifier && !event.altKey) {
      event.preventDefault();
      syncSelection(event.currentTarget);
      const current = historyRef.current.present;
      edit(insertLineBreak(current.text, current.start, current.end));
    }
  };

  const dialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelClose();
    } else if (event.key === 'Tab') {
      const buttons = Array.from(dialogRef.current.querySelectorAll('button:not(:disabled)'));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return <section className="code-editor" aria-label={`Editing ${file.name}`}>
    <div className="editor-command-bar">
      <button className="editor-toolbar-button editor-back" aria-label="Back to files" title="Back to files" onClick={() => requestClose()}><EditorIcon name="back" /><span>Back to files</span></button>
      <span className="editor-separator" />
      <div className="editor-file-name" title={file.name}><EditorIcon name="file" /><span>{file.name}</span>{dirty && <span className="editor-dirty-dot" aria-label="Unsaved changes" />}</div>
      <div className="editor-command-spacer" />
      <button className="editor-toolbar-button editor-save" aria-label="Save" title="Save (Ctrl+S)" disabled={!dirty} onClick={() => save()}><EditorIcon name="save" /><span>Save</span></button>
      <span className="editor-separator" />
      <button className="editor-toolbar-button editor-icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.past.length} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHistory(undoEdit(historyRef.current))}><EditorIcon name="undo" /></button>
      <button className="editor-toolbar-button editor-icon-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.future.length} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHistory(redoEdit(historyRef.current))}><EditorIcon name="redo" /></button>
      <span className="editor-separator" />
      <TagPicker label="Tags" tags={tags} selectedIds={file.tagIds || []} onToggle={onToggleTag} onCreate={onCreateTag} disabled={showUnsaved} />
      <span className="editor-separator" />
      <button className={`editor-toolbar-button editor-wrap-button${wrap ? ' active' : ''}`} aria-label="Word wrap" aria-pressed={wrap} title="Word wrap" onMouseDown={(event) => event.preventDefault()} onClick={() => { setWrap((current) => !current); focusInput(); }}><EditorIcon name="wrap" /><span>Word wrap</span></button>
    </div>
    <div className="editor-path" title={path}><EditorIcon name="file" size={14} /><span>{path || file.name}</span></div>
    {assignedTags.length > 0 && <div className="editor-tags-row"><TagBadges tags={assignedTags} /></div>}
    {!showUnsaved && visibleSaveError && <div className="editor-save-error" role="alert">{visibleSaveError}</div>}
    <div className="editor-document">
      <div className="editor-gutter" ref={gutterRef} aria-hidden="true" style={{ width: `${Math.max(3, String(lines.length).length) + 2}ch` }}>
        <div className="editor-line-numbers">{lines.map((_, index) => <div key={index} className={index === cursorLines.length - 1 ? 'current-line-number' : undefined} style={wrap ? { height: lineHeights[index] || 22 } : undefined}>{index + 1}</div>)}</div>
      </div>
      <div className="editor-text-area">
        <textarea
          ref={inputRef}
          className={`editor-input${wrap ? ' editor-input-wrapped' : ''}`}
          aria-label="Code editor"
          value={text}
          wrap={wrap ? 'soft' : 'off'}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          onBeforeInput={(event) => syncSelection(event.currentTarget)}
          onSelect={(event) => syncSelection(event.currentTarget)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={(event) => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; }}
        />
        {wrap && <div className="editor-wrap-measure" ref={mirrorRef} aria-hidden="true" style={{ width: wrapWidth }}>{lines.map((line, index) => <div key={index}>{line || '\u200b'}</div>)}</div>}
      </div>
    </div>
    <div className="editor-status-bar">
      <span className={dirty ? 'editor-unsaved-status' : 'editor-saved-status'} role="status">{dirty ? 'Unsaved changes' : 'Saved'}</span>
      <span className="editor-status-spacer" />
      <span>Ln {cursorLines.length}, Col {cursorLines[cursorLines.length - 1].length + 1}</span>
      <span>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
      <span>{language}</span>
      <span>UTF-8 · {byteLabel(text)}</span>
    </div>
    {showUnsaved && <div className="editor-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelRef.current?.focus(); }}>
      <div className="editor-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-unsaved-title" aria-describedby="editor-unsaved-description" ref={dialogRef} onKeyDown={dialogKeyDown}>
        <h2 id="editor-unsaved-title">Unsaved changes</h2>
        <p id="editor-unsaved-description">Save your changes to <strong>{file.name}</strong> before leaving?</p>
        {visibleSaveError && <p className="editor-dialog-error" role="alert">{visibleSaveError}</p>}
        <div className="editor-dialog-actions">
          <button className="editor-dialog-primary" onClick={() => completeClose(true)}>Save changes</button>
          <button onClick={() => completeClose(false)}>Discard changes</button>
          <button ref={cancelRef} onClick={cancelClose}>Cancel</button>
        </div>
      </div>
    </div>}
  </section>;
});

export default CodeEditor;
