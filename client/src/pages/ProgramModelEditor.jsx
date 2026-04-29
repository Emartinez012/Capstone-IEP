// =============================================================================
// ProgramModelEditor.jsx — Phase 10
//
// Faculty-facing modal that lets a chair/admin edit the rows of a program's
// active program_model. Opens against a programId; locates the active version,
// fetches its rows, and renders an inline-editable table. Per-row save calls
// PATCH; activate-version calls POST /:id/activate. Add/delete row is out of
// scope (Phase 12 stretch) — banner makes that explicit.
// =============================================================================

import { useEffect, useState } from 'react';
import {
  listProgramModels, getProgramModel,
  patchProgramModelRow, activateProgramModel,
} from '../api';

const TERM_LENGTHS = ['FULL_16_WEEK', 'FIRST_8_WEEK', 'SECOND_8_WEEK'];

function parseAllowed(text) {
  if (!text) return null;
  const arr = text.split(',').map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function formatAllowed(arr) {
  if (!arr || !arr.length) return '';
  return arr.join(', ');
}

export default function ProgramModelEditor({ programId, onClose }) {
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [model,      setModel]      = useState(null);   // { id, program_name, version, is_active, rows }
  const [editingId,  setEditingId]  = useState(null);   // row.id currently in edit mode
  const [draft,      setDraft]      = useState(null);   // working copy of the row being edited
  const [rowError,   setRowError]   = useState('');     // server / client error for the current edit
  const [activating, setActivating] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [programId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const versions = await listProgramModels(programId);
      const active = versions.find(v => v.is_active) || versions[0];
      if (!active) {
        setError(`No program_model exists for ${programId}. Re-run server/seed.js to populate it.`);
        setModel(null);
      } else {
        const full = await getProgramModel(active.id);
        setModel(full);
      }
    } catch (e) {
      setError(e.message || 'Could not load program model.');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setDraft({
      priority:           row.priority ?? 1,
      course_id:          row.course_id || '',
      category:           row.category || '',
      level:              row.level ?? 1,
      is_elective:        !!row.is_elective,
      default_course_id:  row.default_course_id || '',
      allowed_text:       formatAllowed(row.allowed_course_ids),
      term_length:        row.term_length || 'FULL_16_WEEK',
      offered_in_summer:  !!row.offered_in_summer,
    });
    setRowError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setRowError('');
  }

  // Client-side guard mirrors validateRowPatch on the server. Used to
  // grey out Save when the input clearly violates the elective rule.
  function clientGuard() {
    if (!draft) return null;
    if (draft.is_elective && draft.default_course_id) {
      const allowed = (draft.allowed_text || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!allowed.includes(draft.default_course_id)) {
        return 'default_course_id must appear in allowed_course_ids.';
      }
    }
    if (!Number.isInteger(Number(draft.priority)) || Number(draft.priority) < 1) {
      return 'priority must be a positive integer.';
    }
    if (!Number.isInteger(Number(draft.level)) || Number(draft.level) < 1) {
      return 'level must be a positive integer.';
    }
    return null;
  }

  async function save(rowId) {
    const guardMsg = clientGuard();
    if (guardMsg) { setRowError(guardMsg); return; }

    const patch = {
      priority:           Number(draft.priority),
      course_id:          draft.course_id ? draft.course_id.toUpperCase() : null,
      category:           draft.category || null,
      level:              Number(draft.level),
      is_elective:        draft.is_elective,
      default_course_id:  draft.default_course_id ? draft.default_course_id.toUpperCase() : null,
      allowed_course_ids: parseAllowed(draft.allowed_text),
      term_length:        draft.term_length,
      offered_in_summer:  draft.offered_in_summer,
    };

    try {
      const updated = await patchProgramModelRow(model.id, rowId, patch);
      setModel(m => ({
        ...m,
        rows: m.rows
          .map(r => r.id === rowId ? { ...r, ...updated } : r)
          .sort((a, b) => a.priority - b.priority),
      }));
      cancelEdit();
    } catch (e) {
      setRowError(e.message || 'Save failed.');
    }
  }

  async function activate() {
    if (!model || model.is_active) return;
    setActivating(true);
    try {
      await activateProgramModel(model.id);
      setModel(m => ({ ...m, is_active: true }));
    } catch (e) {
      setError(e.message || 'Activation failed.');
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="pme-overlay" onClick={onClose}>
      <div className="pme-modal" onClick={e => e.stopPropagation()}>
        <div className="pme-header">
          <div>
            <h2 className="pme-title">
              Program Model — {model?.program_name || programId}
            </h2>
            {model && (
              <div className="pme-subtitle">
                Version {model.version}{' '}
                {model.is_active
                  ? <span className="pme-badge active">Active</span>
                  : <span className="pme-badge inactive">Inactive</span>}
                {model.is_active ? null : (
                  <button
                    className="pme-activate-btn"
                    onClick={activate}
                    disabled={activating}
                  >{activating ? 'Activating…' : 'Activate this version'}</button>
                )}
              </div>
            )}
          </div>
          <button className="pme-close-btn" onClick={onClose}>✕</button>
        </div>

        <p className="pme-banner">
          ⓘ Edits to the active model affect <strong>new plan generations only</strong>.
          Existing student plans aren't auto-updated until they regenerate.
          Adding or removing rows is not yet supported through this UI.
        </p>

        {loading && <div className="pme-loading">Loading…</div>}
        {error   && <div className="pme-error">{error}</div>}

        {model && model.rows && (
          <div className="pme-table-wrap">
            <table className="pme-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Priority</th>
                  <th>Course</th>
                  <th style={{ width: 60 }}>Level</th>
                  <th>Category</th>
                  <th style={{ width: 70 }}>Elective?</th>
                  <th>Default</th>
                  <th>Allowed</th>
                  <th>Term Length</th>
                  <th style={{ width: 70 }}>Summer?</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map(row => {
                  const isEditing = editingId === row.id;
                  if (!isEditing) {
                    return (
                      <tr key={row.id} className="pme-row">
                        <td>{row.priority}</td>
                        <td>
                          <strong>{row.course_id || '—'}</strong>
                          {row.course_title && <div className="pme-subtle">{row.course_title}</div>}
                        </td>
                        <td>{row.level}</td>
                        <td>{row.category || '—'}</td>
                        <td>{row.is_elective ? 'yes' : '—'}</td>
                        <td>
                          {row.default_course_id || '—'}
                          {row.default_course_title && <div className="pme-subtle">{row.default_course_title}</div>}
                        </td>
                        <td className="pme-allowed-cell">{formatAllowed(row.allowed_course_ids) || '—'}</td>
                        <td>{row.term_length || 'FULL_16_WEEK'}</td>
                        <td>{row.offered_in_summer ? 'yes' : 'no'}</td>
                        <td>
                          <button className="pme-edit-btn" onClick={() => startEdit(row)}>Edit</button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.id} className="pme-row editing">
                      <td>
                        <input className="pme-input" type="number" min="1" max="999"
                          value={draft.priority}
                          onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}
                        />
                      </td>
                      <td>
                        <input className="pme-input" type="text"
                          value={draft.course_id}
                          placeholder="COURSE_CODE"
                          onChange={e => setDraft(d => ({ ...d, course_id: e.target.value }))}
                        />
                      </td>
                      <td>
                        <input className="pme-input" type="number" min="1" max="9"
                          value={draft.level}
                          onChange={e => setDraft(d => ({ ...d, level: e.target.value }))}
                        />
                      </td>
                      <td>
                        <input className="pme-input" type="text"
                          value={draft.category}
                          onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={draft.is_elective}
                          onChange={e => setDraft(d => ({ ...d, is_elective: e.target.checked }))}
                        />
                      </td>
                      <td>
                        <input className="pme-input" type="text"
                          disabled={!draft.is_elective}
                          value={draft.default_course_id}
                          onChange={e => setDraft(d => ({ ...d, default_course_id: e.target.value }))}
                        />
                      </td>
                      <td>
                        <input className="pme-input" type="text"
                          placeholder="CODE_A, CODE_B"
                          value={draft.allowed_text}
                          onChange={e => setDraft(d => ({ ...d, allowed_text: e.target.value }))}
                        />
                      </td>
                      <td>
                        <select className="pme-input"
                          value={draft.term_length}
                          onChange={e => setDraft(d => ({ ...d, term_length: e.target.value }))}
                        >
                          {TERM_LENGTHS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={draft.offered_in_summer}
                          onChange={e => setDraft(d => ({ ...d, offered_in_summer: e.target.checked }))}
                        />
                      </td>
                      <td>
                        <button className="pme-save-btn" disabled={!!clientGuard()} onClick={() => save(row.id)}>Save</button>
                        <button className="pme-cancel-btn" onClick={cancelEdit}>Cancel</button>
                        {rowError   && <div className="pme-row-error">{rowError}</div>}
                        {!rowError && clientGuard() && <div className="pme-row-hint">{clientGuard()}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
