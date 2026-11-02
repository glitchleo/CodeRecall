import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import ItemIcon from './ItemIcon.jsx';
import { MAX_IMPORT_BYTES, parseImportText, planLibraryImport } from './lib/import.js';
import './import.css';

function ImportIcon({ name, size = 20 }) {
  const paths = {
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}

const countLabel = (count, singular, plural = `${singular}s`) => `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
const actionLabels = { add: 'New', update: 'Update', unchanged: 'Unchanged' };
const maxSizeLabel = `${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MiB`;

/** A selected document is planned against the current library before any write. */
export default function ImportLibrary({ library, parentId = null, destinationLabel = 'D:', onImport, onClose }) {
  const headingId = useId();
  const introId = useId();
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const chooseRef = useRef(null);
  const closeRef = useRef(onClose);
  const mountedRef = useRef(false);
  const readVersionRef = useRef(0);
  const busyRef = useRef(false);
  closeRef.current = onClose;
  const [payload, setPayload] = useState(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [saveError, setSaveError] = useState('');

  const review = useMemo(() => {
    if (!payload) return { plan: null, error: '' };
    try { return { plan: planLibraryImport(library, payload, parentId), error: '' }; }
    catch (error) { return { plan: null, error: error?.message || 'This file could not be imported.' }; }
  }, [library, payload, parentId]);
  const plan = review.plan;
  const error = fileError || review.error || saveError;
  const busy = reading || importing;
  busyRef.current = importing;

  useEffect(() => {
    mountedRef.current = true;
    const previous = document.activeElement;
    chooseRef.current?.focus({ preventScroll: true });
    function handleKey(event) {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current?.();
      } else if (event.key === 'Tab') {
        const focusable = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), [tabindex="0"]')]
          .filter(element => element.getClientRects().length && !element.hidden);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first) { event.preventDefault(); panel.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    }
    function containFocus(event) {
      if (!panelRef.current?.contains(event.target)) chooseRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener('keydown', handleKey, true);
    document.addEventListener('focusin', containFocus);
    return () => {
      mountedRef.current = false;
      readVersionRef.current += 1;
      window.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('focusin', containFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  async function selectFiles(files) {
    if (importing) return;
    const version = ++readVersionRef.current;
    setPayload(null);
    setFileError('');
    setSaveError('');
    setDragging(false);
    setReading(false);
    if (files.length !== 1) {
      setFileName('');
      setFileError('Choose one JSON file at a time.');
      return;
    }
    const file = files[0];
    setFileName(file.name);
    if (!/\.json$/iu.test(file.name)) { setFileError('Choose a file with a .json extension.'); return; }
    if (file.size > MAX_IMPORT_BYTES) { setFileError(`Choose a JSON file smaller than ${maxSizeLabel}.`); return; }
    setReading(true);
    try {
      const text = await file.text();
      if (!mountedRef.current || readVersionRef.current !== version) return;
      setPayload(parseImportText(text));
    } catch (failure) {
      if (mountedRef.current && readVersionRef.current === version) setFileError(failure?.message || `Could not read ${file.name}. Choose the file again.`);
    } finally {
      if (mountedRef.current && readVersionRef.current === version) setReading(false);
    }
  }

  async function applyImport() {
    if (!plan || busy || !plan.hasChanges) return;
    setImporting(true);
    busyRef.current = true;
    setSaveError('');
    try {
      const result = await onImport(plan);
      if (!mountedRef.current) return;
      if (!result?.ok) setSaveError(result?.message || 'Could not save this import. Your JSON file is still ready to retry.');
      else closeRef.current?.();
    } catch (failure) {
      if (mountedRef.current) setSaveError(failure?.message || 'Could not save this import. Try again.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setImporting(false);
    }
  }

  const summary = plan?.summary;
  return <div className="import-backdrop" data-import-library="" onMouseDown={event => { if (event.target === event.currentTarget && !importing) onClose?.(); }}>
    <section ref={panelRef} className="import-panel" role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={introId} aria-busy={busy} tabIndex={-1}>
      <header className="import-heading"><div className="import-heading-icon"><ImportIcon name="upload" size={22} /></div><div><h2 id={headingId}>Import JSON</h2><p id={introId}>Bring in folders, code, file notes, and tags.</p></div><button className="import-close" type="button" aria-label="Close JSON import" disabled={importing} onClick={onClose}><ImportIcon name="close" size={18} /></button></header>
      <div className="import-body">
        <div className="import-destination"><ImportIcon name="folder" size={16} /><span>Import into <strong title={destinationLabel}>{destinationLabel}</strong></span></div>
        <div className={`import-dropzone${dragging ? ' is-dragging' : ''}${plan ? ' has-file' : ''}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (!importing) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); if (!importing) selectFiles(Array.from(event.dataTransfer.files)); }}>
          <span className="import-drop-icon"><ImportIcon name={plan ? 'check' : 'upload'} size={28} /></span>
          <strong>{reading ? 'Reading JSON…' : dragging ? 'Drop your JSON file here' : fileName ? fileName : 'Drop a JSON file here'}</strong>
          <span>{plan ? 'Ready to review below' : `CodeRecall import or backup · Up to ${maxSizeLabel}`}</span>
          <button ref={chooseRef} type="button" className="button secondary" disabled={importing} onClick={() => inputRef.current?.click()}>{fileName ? 'Choose another file' : 'Choose JSON file'}</button>
          <input ref={inputRef} className="import-file-input" type="file" accept=".json,application/json" aria-label="Select JSON import file" tabIndex={-1} disabled={importing} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) selectFiles(files); }} />
        </div>
        {error && <p className="import-error" role="alert">{error}</p>}
        {plan && <section className="import-review" aria-label="Import review">
          <div className="import-review-heading"><h3>Review changes</h3><span>{countLabel(plan.changes.length, 'item')}</span></div>
          <dl className="import-summary"><div><dt>New files</dt><dd>{summary.filesAdded.toLocaleString()}</dd></div><div><dt>Updated files</dt><dd>{summary.filesUpdated.toLocaleString()}</dd></div><div><dt>New folders</dt><dd>{summary.foldersAdded.toLocaleString()}</dd></div><div><dt>New tags</dt><dd>{summary.tagsAdded.toLocaleString()}</dd></div></dl>
          <p className="import-tag-summary">{countLabel(summary.tagsReused, 'existing tag')} reused{summary.foldersUpdated ? ` · ${countLabel(summary.foldersUpdated, 'folder')} updated` : ''}. Tag names match regardless of capitalization.</p>
          <div className="import-change-list" role="list" aria-label="Folders and files to import">{plan.changes.map((change, index) => {
            const parts = change.path.split('/').map(part => part.trim()).filter(Boolean);
            const name = parts.at(-1) || change.path;
            return <div className={`import-change-row import-change-${change.action}`} role="listitem" key={`${change.path}-${index}`} style={{ '--import-depth': Math.min(8, parts.length - 1) }}><ItemIcon item={{ type: change.type, name }} size={18} /><span className="import-change-path" title={change.path}>{change.path}</span><span className="import-action-label">{actionLabels[change.action] || change.action}</span></div>;
          })}</div>
          <p className="import-merge-note">Matching folders merge. Matching files receive the imported code and supplied details.</p>
          {!plan.hasChanges && <p className="import-unchanged" role="status">Everything in this file is already up to date.</p>}
        </section>}
        <div className="import-format-help"><div><strong>Getting JSON from an AI?</strong><p>Use the example's format. A file's description becomes its editable notes.</p></div><a className="import-example" href="/examples/coderecall-import.json" download="coderecall-import.json">Download example JSON</a></div>
      </div>
      <footer className="import-footer"><span role="status">{importing ? 'Saving import…' : reading ? 'Reading file…' : plan?.hasChanges ? 'Review the changes, then import.' : plan ? 'No changes to import.' : 'Your library is ready for a JSON file.'}</span><div><button type="button" className="button secondary" disabled={importing} onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={!plan?.hasChanges || busy} onClick={applyImport}>{importing ? 'Importing…' : 'Import'}</button></div></footer>
    </section>
  </div>;
}
