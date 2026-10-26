import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import TagPicker, { TagBadges } from './TagPicker.jsx';
import IconPicker from './IconPicker.jsx';
import { getFileTags } from './lib/tags.js';
import FileNotes from './FileNotes.jsx';
import { notesFromItem, equalNotes } from './lib/notes.js';

const MetadataPanel = forwardRef(function MetadataPanel({ item, tags, onSave, onToggleTag, onCreateTag }, ref) {
  const [description, setDescription] = useState(item.description || '');
  const [notes, setNotes] = useState(() => notesFromItem(item));
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { setDescription(item.description || ''); setNotes(notesFromItem(item)); setMessage(''); }, [item.id, item.description, item.descriptionFormat]);
  const dirty = item.type === 'file' ? !equalNotes(notes, item) : description !== (item.description || '');
  const descriptionPatch = item.type === 'file' ? notes : { description };
  function save(patch) {
    const result = onSave(item.id, patch);
    setFailed(!result?.ok);
    setMessage(result?.ok ? 'Saved.' : result?.message || 'Could not save.');
    return result;
  }
  useImperativeHandle(ref, () => ({ requestSave: () => dirty ? save(descriptionPatch) : { ok: true } }));
  return <div className="metadata-panel" data-metadata="">
    <section className="metadata-section">
      <label htmlFor={`description-${item.id}`}>Description</label>
      {item.type === 'file' ? <div className="metadata-rich-description" onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save(notes); }
      }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && dirty) save(notes);
      }}><FileNotes value={notes} label="File description" onChange={next => { setNotes(next); setMessage(''); }} /></div> : <textarea id={`description-${item.id}`} value={description} maxLength={4000} rows={4}
        placeholder="Add a description"
        onChange={event => { setDescription(event.target.value); setMessage(''); }}
        onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save({ description }); } }}
        onBlur={() => { if (dirty) save({ description }); }} />}
      <div className="metadata-save-row"><span className={failed ? 'metadata-error' : ''} role="status">{message || (dirty ? 'Unsaved description' : '')}</span><button className="button secondary" disabled={!dirty} onClick={() => save(descriptionPatch)}>Save description</button></div>
    </section>
    <section className="metadata-section"><h3>Tags</h3>
      <TagBadges tags={getFileTags(item, tags)} />
      <TagPicker label="Edit tags" tags={tags} selectedIds={item.tagIds || []} onToggle={id => onToggleTag(item.id, id)} onCreate={name => onCreateTag(name, item.id)} />
    </section>
    <section className="metadata-section"><h3>Appearance</h3><IconPicker item={item} onChange={iconId => save({ iconId: iconId || '' })} /></section>
  </div>;
});

export default MetadataPanel;
