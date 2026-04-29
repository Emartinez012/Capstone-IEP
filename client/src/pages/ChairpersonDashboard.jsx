// =============================================================================
// ChairpersonDashboard.jsx — Four tabs:
//   1. Drill-Down  — dept → program → advisor → student hierarchy (with reassign)
//   2. Population  — filtered student grid + CSV export
//   3. Heatmap     — day × time-block campus utilization
//   4. Management  — create/edit advisors, assign programs, bulk auto-assign
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  getFacultyOverview, getFacultyStudents, getFacultyHeatmap,
  getFacultyPrograms, getFacultyTerms, getFacultyCampuses,
  getFacultyAdvisors, createAdvisor, updateAdvisorPrograms,
  assignStudentToAdvisor, autoAssignProgram,
  getProgramCourses, addProgramCourse, removeProgramCourse, updateCourse,
  getCourseSections, addCourseSection, updateCourseSection, deleteCourseSection,
  createProgram, deleteProgram,
} from '../api';
import ProgramModelEditor from './ProgramModelEditor';

// ── Shared helpers ────────────────────────────────────────────────────────────

function termLabel(code) {
  if (!code) return '—';
  const s = String(code);
  const yy = parseInt(s.slice(0, 2), 10);
  const t  = s.slice(2);
  const yr = 2000 + yy;
  if (t === '1') return `Fall ${yr}`;
  if (t === '2') return `Spring ${yr + 1}`;
  if (t === '3') return `Summer ${yr + 1}`;
  return code;
}

const STATUS_META = {
  'on-track':     { label: 'On Track',    cls: 'badge-on-track'     },
  'needs-review': { label: 'Needs Review', cls: 'badge-needs-review' },
  'at-risk':      { label: 'At Risk',      cls: 'badge-at-risk'      },
  'no-plan':      { label: 'No Plan',      cls: 'badge-no-plan'      },
  'approved':     { label: 'Approved',     cls: 'badge-approved'     },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: '' };
  return <span className={`status-badge ${m.cls}`}>{m.label}</span>;
}

function LoadBar({ current, max }) {
  const pct  = Math.min(100, Math.round((current / (max || 50)) * 100));
  const warn = pct >= 90;
  return (
    <div className="load-bar-wrap">
      <div className="load-bar">
        <div className={`load-fill ${warn ? 'load-warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="load-label">{current}/{max || 50}</span>
    </div>
  );
}

// ── Drill-Down Tab ────────────────────────────────────────────────────────────

function DrillDownTab({ data, loading, advisors, onReassign }) {
  const [expanded,      setExpanded]      = useState(new Set());
  const [reassigning,   setReassigning]   = useState(null); // student user_id being reassigned
  const [reassignBusy,  setReassignBusy]  = useState(false);

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function expandAll() {
    const keys = new Set();
    for (const d of data) {
      keys.add(`dept_${d.dept_id}`);
      for (const p of d.programs) {
        keys.add(`prog_${p.degree_code}`);
        for (const a of p.advisors) keys.add(`adv_${a.advisor_id}`);
        if (p.unassigned?.length) keys.add(`unassigned_${p.degree_code}`);
      }
    }
    setExpanded(keys);
  }

  function collapseAll() { setExpanded(new Set()); }

  async function handleReassign(studentId, newAdvisorId) {
    setReassignBusy(true);
    try {
      await assignStudentToAdvisor(studentId, newAdvisorId || null);
      onReassign(); // refresh overview
    } catch { /* silently fail; parent will show error state */ }
    finally { setReassignBusy(false); setReassigning(null); }
  }

  if (loading) return <p className="loading-msg"><span className="spinner spinner-dark" />Loading overview…</p>;
  if (!data.length) return <p className="empty-message">No department data available.</p>;

  function StudentRow({ s, programCode }) {
    const isOpen = reassigning === s.user_id;
    return (
      <div className="drill-student-row">
        <svg width="13" height="13" fill="none" stroke="#888" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <span className="drill-student-name">{s.name}</span>
        <StatusBadge status={s.status} />
        <button
          className="drill-reassign-btn"
          title="Reassign advisor"
          onClick={() => setReassigning(isOpen ? null : s.user_id)}
        >⇄</button>
        {isOpen && (
          <div className="drill-reassign-popover">
            <span className="drill-reassign-label">Assign to:</span>
            {advisors.map(a => (
              <button
                key={a.user_id}
                className="drill-reassign-option"
                disabled={reassignBusy}
                onClick={() => handleReassign(s.user_id, a.user_id)}
              >
                {a.first_name} {a.last_name}
                <span className="drill-reassign-programs">
                  {(a.programs || []).map(p => p.code).join(', ')}
                </span>
              </button>
            ))}
            <button
              className="drill-reassign-option drill-reassign-unassign"
              disabled={reassignBusy}
              onClick={() => handleReassign(s.user_id, null)}
            >
              — Unassign
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="drill-section">
      <div className="drill-controls">
        <button className="drill-btn" onClick={expandAll}>Expand All</button>
        <button className="drill-btn" onClick={collapseAll}>Collapse All</button>
        <span className="drill-hint">Click ⇄ on any student to reassign their advisor.</span>
      </div>

      {data.map(dept => {
        const dKey  = `dept_${dept.dept_id}`;
        const dOpen = expanded.has(dKey);
        return (
          <div key={dept.dept_id} className="drill-dept">
            <div className="drill-row drill-row-dept" onClick={() => toggle(dKey)}>
              <span className={`drill-chevron ${dOpen ? 'open' : ''}`}>›</span>
              <div className="drill-row-main">
                <span className="drill-name">{dept.dept_name}</span>
                <span className="drill-meta">
                  {dept.total_students} students · {dept.total_advisors} advisor{dept.total_advisors !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {dOpen && dept.programs.map(prog => {
              const pKey  = `prog_${prog.degree_code}`;
              const pOpen = expanded.has(pKey);
              return (
                <div key={prog.degree_code} className="drill-program">
                  <div className="drill-row drill-row-prog" onClick={() => toggle(pKey)}>
                    <span className={`drill-chevron ${pOpen ? 'open' : ''}`}>›</span>
                    <div className="drill-row-main">
                      <span className="drill-name">{prog.program_name}</span>
                      <div className="drill-badges">
                        <span className="drill-code-badge">{prog.degree_code}</span>
                        <span className="drill-meta">{prog.student_count} students</span>
                      </div>
                    </div>
                  </div>

                  {pOpen && (
                    <>
                      {prog.advisors.map(adv => {
                        const aKey  = `adv_${adv.advisor_id}`;
                        const aOpen = expanded.has(aKey);
                        return (
                          <div key={adv.advisor_id} className="drill-advisor">
                            <div className="drill-row drill-row-adv" onClick={() => toggle(aKey)}>
                              <span className={`drill-chevron ${aOpen ? 'open' : ''}`}>›</span>
                              <div className="drill-row-main">
                                <span className="drill-name">{adv.name}</span>
                                <div className="drill-adv-meta">
                                  <LoadBar current={adv.current_load} max={adv.max_capacity} />
                                </div>
                              </div>
                            </div>
                            {aOpen && (
                              <div className="drill-students">
                                {adv.students.length === 0
                                  ? <p className="drill-empty">No students assigned.</p>
                                  : adv.students.map(s => (
                                      <StudentRow key={s.user_id} s={s} programCode={prog.degree_code} />
                                    ))
                                }
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Unassigned bucket */}
                      {prog.unassigned?.length > 0 && (
                        <div className="drill-advisor">
                          <div
                            className="drill-row drill-row-adv"
                            onClick={() => toggle(`unassigned_${prog.degree_code}`)}
                          >
                            <span className={`drill-chevron ${expanded.has(`unassigned_${prog.degree_code}`) ? 'open' : ''}`}>›</span>
                            <div className="drill-row-main">
                              <span className="drill-name" style={{ color: '#e65100', fontStyle: 'italic' }}>
                                Unassigned ({prog.unassigned.length})
                              </span>
                            </div>
                          </div>
                          {expanded.has(`unassigned_${prog.degree_code}`) && (
                            <div className="drill-students">
                              {prog.unassigned.map(s => (
                                <StudentRow key={s.user_id} s={s} programCode={prog.degree_code} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Population Tab ─────────────────────────────────────────────────────────────

function PopulationTab({ programs, terms, campuses }) {
  const [filters,  setFilters]  = useState({ term: '', program: '', campus: '' });
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try { setStudents(await getFacultyStudents(filters)); }
    catch { setStudents([]); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  function exportCSV() {
    const headers = ['Last Name','First Name','Program','Degree','Starting Term','Campus','Modality','Status','Est. Graduation'];
    const rows = students.map(s => [
      s.last_name, s.first_name,
      (s.program_name || '').replace(/,/g, ' '), s.degree_code || '',
      termLabel(s.starting_term), s.preferred_campus_location || 'N/A',
      (Array.isArray(s.preferred_modality) ? s.preferred_modality : []).join('/') || 'N/A',
      s.plan_status || '', termLabel(s.projected_graduation_term),
    ]);
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `students_${Date.now()}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="pop-section">
      <div className="pop-filters">
        <select className="pop-filter-select" value={filters.term} onChange={e => setFilters(p => ({ ...p, term: e.target.value }))}>
          <option value="">All Starting Terms</option>
          {terms.map(t => <option key={t} value={t}>{termLabel(t)}</option>)}
        </select>
        <select className="pop-filter-select" value={filters.program} onChange={e => setFilters(p => ({ ...p, program: e.target.value }))}>
          <option value="">All Programs</option>
          {programs.map(p => <option key={p.degree_code} value={p.degree_code}>{p.degree_code} — {p.program_name}</option>)}
        </select>
        <select className="pop-filter-select" value={filters.campus} onChange={e => setFilters(p => ({ ...p, campus: e.target.value }))}>
          <option value="">All Campuses</option>
          {campuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="pop-export-btn" onClick={exportCSV} disabled={!students.length}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>
      {loading
        ? <p className="loading-msg"><span className="spinner spinner-dark" />Loading…</p>
        : <>
            <p className="record-count">{students.length} student{students.length !== 1 ? 's' : ''} matching filters</p>
            <div className="table-wrapper">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Program</th>
                    <th className="cell-center">Starting Term</th>
                    <th className="cell-center">Campus</th>
                    <th className="cell-center">Modality</th>
                    <th className="cell-center">Status</th>
                    <th className="cell-center">Est. Graduation</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0
                    ? <tr><td colSpan="7" style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No students match the selected filters.</td></tr>
                    : students.map(s => (
                        <tr key={s.user_id}>
                          <td>{s.last_name}, {s.first_name}</td>
                          <td><span className="major-badge">{s.degree_code}</span></td>
                          <td className="cell-center">{termLabel(s.starting_term)}</td>
                          <td className="cell-center">{s.preferred_campus_location || <span style={{ color: '#bbb' }}>—</span>}</td>
                          <td className="cell-center">{Array.isArray(s.preferred_modality) && s.preferred_modality.length ? s.preferred_modality.join(', ') : <span style={{ color: '#bbb' }}>—</span>}</td>
                          <td className="cell-center">
                            <StatusBadge status={
                              s.plan_status === 'Needs Review' ? 'needs-review' :
                              s.plan_status === 'No Plan'      ? 'no-plan'      :
                              s.plan_status === 'Approved'     ? 'approved'     : 'on-track'
                            } />
                          </td>
                          <td className="cell-center">{termLabel(s.projected_graduation_term)}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </>
      }
    </div>
  );
}

// ── Heatmap Tab ────────────────────────────────────────────────────────────────

const DAYS        = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIME_BLOCKS = ['Morning', 'Afternoon', 'Evening'];
const BLOCK_HOURS = { Morning: '8 AM – 12 PM', Afternoon: '12 PM – 5 PM', Evening: '5 PM – 9 PM' };

function HeatmapTab({ programs, campuses }) {
  const [filters,       setFilters]       = useState({ program: 'all', campus: 'all' });
  const [includeOnline, setIncludeOnline] = useState(false);
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(false);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    try { setData(await getFacultyHeatmap({ ...filters, include_online: includeOnline })); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [filters, includeOnline]);

  useEffect(() => { fetchHeatmap(); }, [fetchHeatmap]);

  const maxVal = data ? Math.max(1, ...TIME_BLOCKS.flatMap(b => DAYS.map(d => data.grid[b]?.[d] ?? 0))) : 1;

  function cellStyle(count) {
    const i = count / maxVal;
    const r = Math.round(255 - i * (255 - 31));
    const g = Math.round(255 - i * (255 - 56));
    const b = Math.round(255 - i * (255 - 100));
    return { backgroundColor: `rgb(${r},${g},${b})`, color: i > 0.55 ? '#fff' : '#1f3864' };
  }

  return (
    <div className="heatmap-section">
      <div className="heatmap-controls">
        <select className="pop-filter-select" value={filters.campus} onChange={e => setFilters(p => ({ ...p, campus: e.target.value }))}>
          <option value="all">All Campuses</option>
          {campuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="pop-filter-select" value={filters.program} onChange={e => setFilters(p => ({ ...p, program: e.target.value }))}>
          <option value="all">All Programs</option>
          {programs.map(p => <option key={p.degree_code} value={p.degree_code}>{p.degree_code}</option>)}
        </select>
        <label className="heatmap-toggle-label">
          <input type="checkbox" checked={includeOnline} onChange={e => setIncludeOnline(e.target.checked)} />
          Include Online students
        </label>
        {data && (
          <span className="heatmap-summary-pill">
            {data.total_in_person} in-person
            {data.online_count > 0 && ` · ${data.online_count} online (${includeOnline ? 'shown' : 'hidden'})`}
          </span>
        )}
      </div>
      {loading
        ? <p className="loading-msg"><span className="spinner spinner-dark" />Calculating…</p>
        : !data
          ? <p className="error-msg">Could not load heatmap data.</p>
          : <>
              <p className="heatmap-desc">Darker cells = more students prefer that day + time block. Use this to plan section offerings.</p>
              <div className="heatmap-wrap">
                <table className="heatmap-table">
                  <thead>
                    <tr>
                      <th className="heatmap-th-corner" />
                      {DAYS.map(d => <th key={d} className="heatmap-th-day">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_BLOCKS.map(block => (
                      <tr key={block}>
                        <td className="heatmap-label-cell">
                          <span className="heatmap-block-name">{block}</span>
                          <span className="heatmap-block-hours">{BLOCK_HOURS[block]}</span>
                        </td>
                        {DAYS.map(day => {
                          const count = data.grid[block]?.[day] ?? 0;
                          return <td key={day} className="heatmap-cell" style={cellStyle(count)}><span className="heatmap-count">{count}</span></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="heatmap-legend">
                <span className="legend-label">Low demand</span>
                <div className="legend-gradient" />
                <span className="legend-label">High demand</span>
              </div>
            </>
      }
    </div>
  );
}

// ── Management Tab ─────────────────────────────────────────────────────────────

function EditProgramsModal({ advisor, programs, onSave, onClose }) {
  const [selected, setSelected] = useState(
    new Set((advisor.programs || []).map(p => p.code))
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function toggleProgram(code) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      await updateAdvisorPrograms(advisor.user_id, [...selected]);
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="mgmt-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mgmt-modal">
        <div className="mgmt-modal-header">
          <h3>Edit Programs — {advisor.first_name} {advisor.last_name}</h3>
          <button className="snapshot-close" onClick={onClose}>✕</button>
        </div>
        <p className="mgmt-modal-sub">Select all programs this advisor oversees.</p>
        {error && <div className="auth-error">{error}</div>}
        <div className="mgmt-program-list">
          {programs.map(p => (
            <label key={p.degree_code} className="mgmt-program-row">
              <input
                type="checkbox"
                checked={selected.has(p.degree_code)}
                onChange={() => toggleProgram(p.degree_code)}
              />
              <span className="mgmt-program-code">{p.degree_code}</span>
              <span className="mgmt-program-name">{p.program_name}</span>
            </label>
          ))}
        </div>
        <div className="mgmt-modal-footer">
          <button className="drill-btn" onClick={onClose}>Cancel</button>
          <button className="btn-approve" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Programs'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAdvisorModal({ programs, onSave, onClose }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '',
    max_student_load: 50,
  });
  const [selectedPrograms, setSelectedPrograms] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function setField(key, val) { setForm(p => ({ ...p, [key]: val })); }
  function toggleProgram(code) {
    setSelectedPrograms(prev => {
      const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError('');
    if (!form.first_name || !form.last_name || !form.email) {
      setError('First name, last name, and email are required.'); return;
    }
    setSaving(true);
    try {
      await createAdvisor({ ...form, programs: [...selectedPrograms] });
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="mgmt-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mgmt-modal">
        <div className="mgmt-modal-header">
          <h3>Add New Advisor</h3>
          <button className="snapshot-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mgmt-form-grid">
            <div className="auth-field">
              <label>First Name</label>
              <input value={form.first_name} onChange={e => setField('first_name', e.target.value)} placeholder="First name" />
            </div>
            <div className="auth-field">
              <label>Last Name</label>
              <input value={form.last_name} onChange={e => setField('last_name', e.target.value)} placeholder="Last name" />
            </div>
            <div className="auth-field" style={{ gridColumn: '1 / -1' }}>
              <label>MDC Email</label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="name@mdc.edu" />
            </div>
            <div className="auth-field">
              <label>Temporary Password</label>
              <input type="password" value={form.password} onChange={e => setField('password', e.target.value)} placeholder="Leave blank for default" />
            </div>
            <div className="auth-field">
              <label>Max Student Load</label>
              <input type="number" min="1" max="200" value={form.max_student_load} onChange={e => setField('max_student_load', parseInt(e.target.value, 10) || 50)} />
            </div>
          </div>
          <div className="mgmt-section-label">Assign to Programs</div>
          <div className="mgmt-program-list">
            {programs.map(p => (
              <label key={p.degree_code} className="mgmt-program-row">
                <input type="checkbox" checked={selectedPrograms.has(p.degree_code)} onChange={() => toggleProgram(p.degree_code)} />
                <span className="mgmt-program-code">{p.degree_code}</span>
                <span className="mgmt-program-name">{p.program_name}</span>
              </label>
            ))}
          </div>
          <div className="mgmt-modal-footer">
            <button type="button" className="drill-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-approve" disabled={saving}>
              {saving ? 'Creating…' : 'Create Advisor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManagementTab({ programs, onRefresh }) {
  const [advisors,    setAdvisors]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editAdvisor, setEditAdvisor] = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [autoMsg,     setAutoMsg]     = useState({});
  const [autoBusy,    setAutoBusy]    = useState(null);

  async function fetchAdvisors() {
    setLoading(true);
    try { setAdvisors(await getFacultyAdvisors()); }
    catch { setAdvisors([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAdvisors(); }, []);

  async function handleAutoAssign(code) {
    setAutoBusy(code);
    try {
      const r = await autoAssignProgram(code);
      setAutoMsg(p => ({ ...p, [code]: `${r.assigned} student${r.assigned !== 1 ? 's' : ''} assigned.` }));
      onRefresh();
      fetchAdvisors();
    } catch (err) {
      setAutoMsg(p => ({ ...p, [code]: err.message }));
    } finally { setAutoBusy(null); }
  }

  function afterSave() {
    setEditAdvisor(null); setShowAdd(false);
    fetchAdvisors(); onRefresh();
  }

  return (
    <div className="mgmt-section">
      {/* Advisor Roster */}
      <div className="mgmt-block">
        <div className="mgmt-block-header">
          <h3 className="mgmt-block-title">Advisor Roster</h3>
          <button className="mgmt-add-btn" onClick={() => setShowAdd(true)}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Advisor
          </button>
        </div>

        {loading
          ? <p className="loading-msg"><span className="spinner spinner-dark" />Loading advisors…</p>
          : advisors.length === 0
            ? <p className="action-empty">No advisors found.</p>
            : (
              <div className="mgmt-advisor-grid">
                {advisors.map(a => (
                  <div key={a.user_id} className="mgmt-advisor-card">
                    <div className="mgmt-advisor-avatar">
                      {a.first_name[0]}{a.last_name[0]}
                    </div>
                    <div className="mgmt-advisor-info">
                      <span className="mgmt-advisor-name">{a.first_name} {a.last_name}</span>
                      <span className="mgmt-advisor-email">{a.email}</span>
                      <div className="mgmt-program-pills">
                        {(a.programs || []).length === 0
                          ? <span className="mgmt-no-programs">No programs assigned</span>
                          : (a.programs || []).map(p => (
                              <span key={p.code} className="mgmt-program-pill">{p.code}</span>
                            ))
                        }
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <LoadBar current={a.current_load} max={a.max_student_load || 50} />
                      </div>
                    </div>
                    <button
                      className="mgmt-edit-btn"
                      onClick={() => setEditAdvisor(a)}
                      title="Edit program assignments"
                    >
                      Edit Programs
                    </button>
                  </div>
                ))}
              </div>
            )
        }
      </div>

      {/* Bulk Auto-Assignment */}
      <div className="mgmt-block">
        <h3 className="mgmt-block-title">Bulk Auto-Assignment</h3>
        <p className="mgmt-block-sub">
          Automatically assigns all <strong>unassigned</strong> students in a program to that program's advisor.
          Only students without an advisor are affected.
        </p>
        <div className="mgmt-autoassign-list">
          {programs.map(p => (
            <div key={p.degree_code} className="mgmt-autoassign-row">
              <div className="mgmt-autoassign-info">
                <span className="mgmt-program-code">{p.degree_code}</span>
                <span className="mgmt-program-name">{p.program_name}</span>
              </div>
              <div className="mgmt-autoassign-right">
                {autoMsg[p.degree_code] && (
                  <span className="mgmt-autoassign-msg">{autoMsg[p.degree_code]}</span>
                )}
                <button
                  className="btn-approve-sm"
                  onClick={() => handleAutoAssign(p.degree_code)}
                  disabled={autoBusy === p.degree_code}
                >
                  {autoBusy === p.degree_code ? 'Assigning…' : 'Auto-Assign'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {editAdvisor && (
        <EditProgramsModal
          advisor={editAdvisor}
          programs={programs}
          onSave={afterSave}
          onClose={() => setEditAdvisor(null)}
        />
      )}
      {showAdd && (
        <AddAdvisorModal
          programs={programs}
          onSave={afterSave}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ── Curriculum Tab ─────────────────────────────────────────────────────────────

const CAMPUSES_LIST = ['Homestead', 'North', 'Kendall', 'Wolfson', 'Padron', 'West', 'Online'];
const MODALITIES    = ['In-Person', 'Online', 'Blended'];
const DAY_PATTERNS  = ['MWF', 'TTh', 'SAT', 'Daily', 'Online'];

function ProgramModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    degree_code:     '',
    program_name:    '',
    department_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSave() {
    if (!form.degree_code.trim() || !form.program_name.trim()) {
      setErr('Degree code and program name are required.'); return;
    }
    setSaving(true); setErr('');
    try { await onSave(form); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="snapshot-overlay" onClick={onClose}>
      <div className="snapshot-modal curr-modal" onClick={e => e.stopPropagation()}>
        <div className="snapshot-header">
          <h3>New Program</h3>
          <button className="snapshot-close" onClick={onClose}>✕</button>
        </div>
        <div className="curr-modal-body">
          {err && <div className="curr-modal-err">{err}</div>}
          <div className="curr-field">
            <label>Degree Code</label>
            <input className="curr-input" placeholder="e.g. BS-XYZ" value={form.degree_code}
              onChange={e => setForm(f => ({ ...f, degree_code: e.target.value.toUpperCase() }))} />
          </div>
          <div className="curr-field">
            <label>Program Name</label>
            <input className="curr-input" placeholder="Bachelor of Science in …" value={form.program_name}
              onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} />
          </div>
          <div className="curr-field">
            <label>Department</label>
            <input className="curr-input" placeholder="School of …" value={form.department_name}
              onChange={e => setForm(f => ({ ...f, department_name: e.target.value }))} />
          </div>
        </div>
        <div className="snapshot-footer">
          <button className="drill-btn" onClick={onClose}>Cancel</button>
          <button className="btn-approve" onClick={handleSave}
            disabled={saving || !form.degree_code.trim() || !form.program_name.trim()}>
            {saving ? 'Creating…' : 'Create Program'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseModal({ course, onSave, onClose }) {
  const isNew = !course;
  const [form, setForm] = useState({
    course_code:        course?.course_code        ?? '',
    title:              course?.title              ?? '',
    credits:            course?.credits            ?? 3,
    description:        course?.description        ?? '',
    prerequisite_codes: course?.prerequisite_codes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSave() {
    if (!form.course_code.trim() || !form.title.trim()) {
      setErr('Course code and title are required.'); return;
    }
    setSaving(true); setErr('');
    try { await onSave(form); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="snapshot-overlay" onClick={onClose}>
      <div className="snapshot-modal curr-modal" onClick={e => e.stopPropagation()}>
        <div className="snapshot-header">
          <h3>{isNew ? 'Add Course to Program' : `Edit — ${course.course_code}`}</h3>
          <button className="snapshot-close" onClick={onClose}>✕</button>
        </div>
        <div className="curr-modal-body">
          {err && <div className="curr-modal-err">{err}</div>}
          <div className="curr-field">
            <label>Course Code</label>
            <input className="curr-input" placeholder="e.g. COP2800" value={form.course_code}
              disabled={!isNew}
              onChange={e => setForm(f => ({ ...f, course_code: e.target.value.toUpperCase() }))} />
          </div>
          <div className="curr-field">
            <label>Title</label>
            <input className="curr-input" placeholder="Course title" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="curr-field">
            <label>Credits</label>
            <input className="curr-input" type="number" min="1" max="6" style={{ width: 90 }}
              value={form.credits}
              onChange={e => setForm(f => ({ ...f, credits: parseInt(e.target.value) || 3 }))} />
          </div>
          <div className="curr-field">
            <label>Description</label>
            <textarea className="curr-textarea" rows={3} placeholder="Brief course description…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="curr-field">
            <label>
              Prerequisites
              <span className="curr-hint"> — boolean expression, e.g. "COP1334 OR COP1047C"</span>
            </label>
            <input className="curr-input" placeholder="e.g. MAC1105" value={form.prerequisite_codes}
              onChange={e => setForm(f => ({ ...f, prerequisite_codes: e.target.value }))} />
          </div>
        </div>
        <div className="snapshot-footer">
          <button className="drill-btn" onClick={onClose}>Cancel</button>
          <button className="btn-approve" onClick={handleSave}
            disabled={saving || !form.course_code.trim() || !form.title.trim()}>
            {saving ? 'Saving…' : isNew ? 'Add Course' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionModal({ section, courseCode, onSave, onClose }) {
  const isNew = !section;
  const [form, setForm] = useState({
    section_number: section?.section_number ?? '',
    instructor:     section?.instructor     ?? '',
    campus:         section?.campus         ?? '',
    modality:       section?.modality       ?? 'In-Person',
    days:           section?.days           ?? '',
    start_time:     section?.start_time     ?? '',
    end_time:       section?.end_time       ?? '',
    term_code:      section?.term_code      ?? '',
    capacity:       section?.capacity       ?? 30,
    enrolled:       section?.enrolled       ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  function field(key, label, input) {
    return (
      <div className="curr-field">
        <label>{label}</label>
        {input}
      </div>
    );
  }

  async function handleSave() {
    if (!form.section_number.trim()) { setErr('Section number is required.'); return; }
    setSaving(true); setErr('');
    try { await onSave(form); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="snapshot-overlay" onClick={onClose}>
      <div className="snapshot-modal curr-modal curr-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="snapshot-header">
          <h3>{isNew ? `Add Section — ${courseCode}` : `Edit Section ${section.section_number} — ${courseCode}`}</h3>
          <button className="snapshot-close" onClick={onClose}>✕</button>
        </div>
        <div className="curr-modal-body curr-modal-grid">
          {err && <div className="curr-modal-err" style={{ gridColumn: '1/-1' }}>{err}</div>}
          {field('section_number', 'Section #',
            <input className="curr-input" placeholder="e.g. 001" value={form.section_number}
              onChange={e => setForm(f => ({ ...f, section_number: e.target.value }))} />)}
          {field('term_code', 'Term Code',
            <input className="curr-input" placeholder="e.g. 261 (Fall 2026)" value={form.term_code}
              onChange={e => setForm(f => ({ ...f, term_code: e.target.value }))} />)}
          {field('instructor', 'Instructor',
            <input className="curr-input" placeholder="Full name" value={form.instructor}
              onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} />)}
          {field('campus', 'Campus',
            <select className="curr-input" value={form.campus}
              onChange={e => setForm(f => ({ ...f, campus: e.target.value }))}>
              <option value="">— Select —</option>
              {CAMPUSES_LIST.map(c => <option key={c} value={c}>{c}</option>)}
            </select>)}
          {field('modality', 'Modality',
            <select className="curr-input" value={form.modality}
              onChange={e => setForm(f => ({ ...f, modality: e.target.value }))}>
              {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>)}
          {field('days', 'Meeting Days',
            <select className="curr-input" value={form.days}
              onChange={e => setForm(f => ({ ...f, days: e.target.value }))}>
              <option value="">— Select —</option>
              {DAY_PATTERNS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>)}
          {field('start_time', 'Start Time',
            <input className="curr-input" type="time" value={form.start_time}
              onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />)}
          {field('end_time', 'End Time',
            <input className="curr-input" type="time" value={form.end_time}
              onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />)}
          {field('capacity', 'Capacity',
            <input className="curr-input" type="number" min="1" style={{ width: 90 }} value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 30 }))} />)}
          {field('enrolled', 'Enrolled',
            <input className="curr-input" type="number" min="0" style={{ width: 90 }} value={form.enrolled}
              onChange={e => setForm(f => ({ ...f, enrolled: parseInt(e.target.value) || 0 }))} />)}
        </div>
        <div className="snapshot-footer">
          <button className="drill-btn" onClick={onClose}>Cancel</button>
          <button className="btn-approve" onClick={handleSave}
            disabled={saving || !form.section_number.trim()}>
            {saving ? 'Saving…' : isNew ? 'Add Section' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CurriculumTab({ programs, onProgramsChanged }) {
  const [selProgram,    setSelProgram]    = useState(programs[0]?.degree_code ?? '');
  const [courses,       setCourses]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [expanded,      setExpanded]      = useState(new Set());
  const [sections,      setSections]      = useState({});
  const [secLoading,    setSecLoading]    = useState({});

  const [showAddCourse, setShowAddCourse] = useState(false);
  const [editCourse,    setEditCourse]    = useState(null);
  const [confirmDel,    setConfirmDel]    = useState(null);  // course_code

  const [addSecFor,     setAddSecFor]     = useState(null);  // course_code
  const [editSec,       setEditSec]       = useState(null);  // section obj

  const [editingProgramModel, setEditingProgramModel] = useState(null); // programId | null
  const [showAddProgram,    setShowAddProgram]    = useState(false);
  const [confirmDelProgram, setConfirmDelProgram] = useState(false);
  const [delProgramErr,     setDelProgramErr]     = useState('');

  const [error,  setError]  = useState('');
  const [toast,  setToast]  = useState('');

  useEffect(() => { if (selProgram) load(selProgram); }, [selProgram]);

  // Keep selProgram aligned with the programs list (pick first if current is gone).
  useEffect(() => {
    if (!programs.length) { setSelProgram(''); return; }
    if (!programs.some(p => p.degree_code === selProgram)) {
      setSelProgram(programs[0].degree_code);
    }
  }, [programs, selProgram]);

  const currentProgram = programs.find(p => p.degree_code === selProgram);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function load(code) {
    setLoading(true); setError('');
    setExpanded(new Set()); setSections({});
    try { setCourses(await getProgramCourses(code)); }
    catch { setError('Could not load courses. Please try again.'); }
    finally { setLoading(false); }
  }

  async function toggleExpand(code) {
    const next = new Set(expanded);
    if (next.has(code)) { next.delete(code); setExpanded(next); return; }
    next.add(code); setExpanded(next);
    if (sections[code] !== undefined) return;
    setSecLoading(p => ({ ...p, [code]: true }));
    try { setSections(p => ({ ...p, [code]: [] }));
          const data = await getCourseSections(code);
          setSections(p => ({ ...p, [code]: data })); }
    catch { setSections(p => ({ ...p, [code]: [] })); }
    finally { setSecLoading(p => ({ ...p, [code]: false })); }
  }

  async function handleAddCourse(form) {
    await addProgramCourse(selProgram, form);
    await load(selProgram);
    setShowAddCourse(false);
    flash('Course added to program.');
  }

  async function handleEditCourse(form) {
    await updateCourse(editCourse.course_code, form);
    await load(selProgram);
    setEditCourse(null);
    flash('Course updated.');
  }

  async function handleRemoveCourse() {
    await removeProgramCourse(selProgram, confirmDel);
    await load(selProgram);
    setConfirmDel(null);
    flash('Course removed from program.');
  }

  async function handleAddSection(form) {
    await addCourseSection(addSecFor, form);
    const updated = await getCourseSections(addSecFor);
    setSections(p => ({ ...p, [addSecFor]: updated }));
    setCourses(prev => prev.map(c =>
      c.course_code === addSecFor ? { ...c, section_count: String(parseInt(c.section_count || 0) + 1) } : c
    ));
    setAddSecFor(null);
    flash('Section added.');
  }

  async function handleEditSection(form) {
    await updateCourseSection(editSec.section_id, form);
    const updated = await getCourseSections(editSec.course_code);
    setSections(p => ({ ...p, [editSec.course_code]: updated }));
    setEditSec(null);
    flash('Section updated.');
  }

  async function handleCreateProgram(form) {
    const created = await createProgram(form);
    await onProgramsChanged?.();
    setSelProgram(created.degree_code);
    setShowAddProgram(false);
    flash(`Program ${created.degree_code} created.`);
  }

  async function handleDeleteProgram() {
    setDelProgramErr('');
    try {
      await deleteProgram(selProgram);
      const removed = selProgram;
      await onProgramsChanged?.();
      setConfirmDelProgram(false);
      flash(`Program ${removed} deleted.`);
    } catch (e) {
      setDelProgramErr(e.message);
    }
  }

  async function handleDeleteSection(sec) {
    await deleteCourseSection(sec.section_id);
    setSections(p => ({ ...p, [sec.course_code]: p[sec.course_code].filter(s => s.section_id !== sec.section_id) }));
    setCourses(prev => prev.map(c =>
      c.course_code === sec.course_code ? { ...c, section_count: String(Math.max(0, parseInt(c.section_count || 0) - 1)) } : c
    ));
    flash('Section deleted.');
  }

  function fmtTime(t) {
    if (!t) return null;
    const [h, m] = t.split(':');
    const hr = parseInt(h, 10);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }

  function modalityClass(m) {
    if (!m) return '';
    return { 'In-Person': 'mod-inperson', 'Online': 'mod-online', 'Blended': 'mod-blended' }[m] ?? '';
  }

  return (
    <div className="curr-root">
      {toast && <div className="curr-toast">{toast}</div>}

      {/* Toolbar */}
      <div className="curr-toolbar">
        <div className="curr-program-row">
          <span className="curr-select-lbl">Program</span>
          <select
            className="curr-select"
            value={selProgram}
            onChange={e => setSelProgram(e.target.value)}
            disabled={!programs.length}
          >
            {programs.length === 0 && <option value="">— No programs —</option>}
            {programs.map(p => (
              <option key={p.degree_code} value={p.degree_code}>{p.program_name}</option>
            ))}
          </select>
        </div>
        <button className="curr-add-btn" onClick={() => { setError(''); setShowAddProgram(true); }}>
          + New Program
        </button>
        <button
          className="curr-add-btn"
          onClick={() => { setError(''); setShowAddCourse(true); }}
          disabled={!selProgram}
        >
          + Add Course
        </button>
        <button
          className="curr-edit-model-btn"
          onClick={() => { setError(''); setEditingProgramModel(selProgram); }}
          disabled={!selProgram}
          title="Edit the priority-ordered program model used by the IEP generator"
        >
          Edit Program Model
        </button>
        <button
          className="curr-btn curr-btn-del"
          onClick={() => { setDelProgramErr(''); setConfirmDelProgram(true); }}
          disabled={!selProgram}
          title="Delete this program"
          style={{ marginLeft: 'auto' }}
        >
          Delete Program
        </button>
      </div>

      {/* Program info header */}
      {currentProgram && (
        <div className="curr-program-info">
          <div className="curr-program-info-main">
            <span className="curr-program-info-code">{currentProgram.degree_code}</span>
            <span className="curr-program-info-name">{currentProgram.program_name}</span>
          </div>
          <div className="curr-program-info-meta">
            <span><strong>Department:</strong> {currentProgram.department_name || '—'}</span>
            <span><strong>Courses:</strong> {currentProgram.course_count ?? courses.length}</span>
            <span><strong>Total credits:</strong> {currentProgram.total_credits ?? '—'}</span>
          </div>
        </div>
      )}

      {!programs.length && (
        <div className="curr-empty">No programs yet. Click <strong>+ New Program</strong> to create one.</div>
      )}

      {error && <div className="curr-error">{error}</div>}

      {loading ? (
        <div className="curr-loading"><span className="spinner" /> Loading courses…</div>
      ) : courses.length === 0 ? (
        <div className="curr-empty">No courses in this program yet. Add the first one.</div>
      ) : (
        <div className="curr-table-wrap">
          <table className="curr-table">
            <thead>
              <tr>
                <th style={{ width: 30 }} />
                <th>Code</th>
                <th>Title</th>
                <th style={{ width: 50 }}>Cr</th>
                <th>Description</th>
                <th style={{ width: 90 }}>Sections</th>
                <th style={{ width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(course => (
                <React.Fragment key={course.course_code}>
                  <tr className={`curr-row${expanded.has(course.course_code) ? ' curr-row-open' : ''}`}>
                    <td>
                      <button className="curr-expand-btn"
                        onClick={() => toggleExpand(course.course_code)}
                        title={expanded.has(course.course_code) ? 'Hide sections' : 'Show sections'}>
                        {expanded.has(course.course_code) ? '▾' : '▸'}
                      </button>
                    </td>
                    <td className="curr-code">{course.course_code}</td>
                    <td className="curr-title">{course.title}</td>
                    <td className="curr-cr">{course.credits}</td>
                    <td className="curr-desc">{course.description || <span className="curr-none">—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`curr-sec-badge ${parseInt(course.section_count) > 0 ? 'sec-has' : 'sec-zero'}`}>
                        {course.section_count} sec
                      </span>
                    </td>
                    <td>
                      <div className="curr-row-actions">
                        <button className="curr-btn curr-btn-edit" onClick={() => { setError(''); setEditCourse(course); }}>Edit</button>
                        <button className="curr-btn curr-btn-del"  onClick={() => setConfirmDel(course.course_code)}>Remove</button>
                      </div>
                    </td>
                  </tr>

                  {/* Sections panel */}
                  {expanded.has(course.course_code) && (
                    <tr className="curr-sec-row">
                      <td colSpan={7}>
                        <div className="curr-sec-panel">
                          <div className="curr-sec-panel-head">
                            <span className="curr-sec-panel-title">
                              Sections — <strong>{course.course_code}</strong>: {course.title}
                            </span>
                            <button className="curr-sec-add-btn" onClick={() => { setError(''); setAddSecFor(course.course_code); }}>
                              + Add Section
                            </button>
                          </div>

                          {secLoading[course.course_code] ? (
                            <p className="curr-sec-msg">Loading sections…</p>
                          ) : !sections[course.course_code]?.length ? (
                            <p className="curr-sec-msg">No sections yet — add the first one.</p>
                          ) : (
                            <table className="curr-sec-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Term</th>
                                  <th>Instructor</th>
                                  <th>Campus</th>
                                  <th>Modality</th>
                                  <th>Days</th>
                                  <th>Time</th>
                                  <th>Cap / Enrolled</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sections[course.course_code].map(sec => (
                                  <tr key={sec.section_id}>
                                    <td className="curr-sec-num">{sec.section_number}</td>
                                    <td>{termLabel(sec.term_code) || sec.term_code || '—'}</td>
                                    <td>{sec.instructor || '—'}</td>
                                    <td>{sec.campus || '—'}</td>
                                    <td>
                                      {sec.modality
                                        ? <span className={`curr-mod-badge ${modalityClass(sec.modality)}`}>{sec.modality}</span>
                                        : '—'}
                                    </td>
                                    <td>{sec.days || '—'}</td>
                                    <td className="curr-time-cell">
                                      {sec.start_time
                                        ? <>{fmtTime(sec.start_time)}<span className="curr-time-sep">–</span>{fmtTime(sec.end_time)}</>
                                        : '—'}
                                    </td>
                                    <td>
                                      <span className={sec.enrolled >= sec.capacity ? 'curr-full' : 'curr-cap'}>
                                        {sec.enrolled ?? 0}/{sec.capacity ?? 30}
                                      </span>
                                    </td>
                                    <td>
                                      <div className="curr-row-actions">
                                        <button className="curr-btn curr-btn-edit"
                                          onClick={() => setEditSec({ ...sec, course_code: course.course_code })}>Edit</button>
                                        <button className="curr-btn curr-btn-del"
                                          onClick={() => handleDeleteSection({ ...sec, course_code: course.course_code })}>Delete</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm remove */}
      {confirmDel && (
        <div className="snapshot-overlay" onClick={() => setConfirmDel(null)}>
          <div className="snapshot-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="snapshot-header">
              <h3>Remove Course from Program</h3>
              <button className="snapshot-close" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 14, color: '#374151' }}>
              Remove <strong>{confirmDel}</strong> from this program?
              The course will remain in the system but will no longer be required for this degree.
            </div>
            <div className="snapshot-footer">
              <button className="drill-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn-reject" onClick={handleRemoveCourse}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {showAddProgram && (
        <ProgramModal onSave={handleCreateProgram} onClose={() => setShowAddProgram(false)} />
      )}

      {confirmDelProgram && currentProgram && (
        <div className="snapshot-overlay" onClick={() => setConfirmDelProgram(false)}>
          <div className="snapshot-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="snapshot-header">
              <h3>Delete Program</h3>
              <button className="snapshot-close" onClick={() => setConfirmDelProgram(false)}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 14, color: '#374151' }}>
              Delete <strong>{currentProgram.degree_code}</strong> — {currentProgram.program_name}?
              This removes the program, its degree model, and its course requirements. Courses themselves remain in the system.
              {delProgramErr && <div className="curr-error" style={{ marginTop: 12 }}>{delProgramErr}</div>}
            </div>
            <div className="snapshot-footer">
              <button className="drill-btn" onClick={() => setConfirmDelProgram(false)}>Cancel</button>
              <button className="btn-reject" onClick={handleDeleteProgram}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showAddCourse && <CourseModal onSave={handleAddCourse} onClose={() => setShowAddCourse(false)} />}
      {editCourse    && <CourseModal course={editCourse}  onSave={handleEditCourse} onClose={() => setEditCourse(null)} />}
      {addSecFor     && <SectionModal courseCode={addSecFor}  onSave={handleAddSection} onClose={() => setAddSecFor(null)} />}
      {editSec       && <SectionModal section={editSec} courseCode={editSec.course_code} onSave={handleEditSection} onClose={() => setEditSec(null)} />}
      {editingProgramModel && (
        <ProgramModelEditor
          programId={editingProgramModel}
          onClose={() => { setEditingProgramModel(null); flash('Done editing program model.'); }}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',    label: 'Drill-Down Overview' },
  { id: 'population',  label: 'Population Grid'      },
  { id: 'heatmap',     label: 'Campus Heatmap'       },
  { id: 'management',  label: 'Management'            },
  { id: 'curriculum',  label: 'Curriculum'            },
];

export default function ChairpersonDashboard({ user, onSignOut }) {
  const [tab,      setTab]      = useState('overview');
  const [overview, setOverview] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [terms,    setTerms]    = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading,  setLoading]  = useState(true);

  async function loadOverview() {
    try {
      const [ov, adv] = await Promise.all([getFacultyOverview(), getFacultyAdvisors()]);
      setOverview(ov.departments || []);
      setAdvisors(adv);
    } catch { /* errors shown per-tab */ }
  }

  async function loadPrograms() {
    try { setPrograms(await getFacultyPrograms()); }
    catch { /* errors shown per-tab */ }
  }

  useEffect(() => {
    Promise.all([
      getFacultyOverview(),
      getFacultyAdvisors(),
      getFacultyPrograms(),
      getFacultyTerms(),
      getFacultyCampuses(),
    ]).then(([ov, adv, pr, te, ca]) => {
      setOverview(ov.departments || []);
      setAdvisors(adv);
      setPrograms(pr);
      setTerms(te);
      setCampuses(ca);
    }).finally(() => setLoading(false));
  }, []);

  const totalStudents = overview.reduce((s, d) => s + d.total_students, 0);
  const totalAdvisors = overview.reduce((s, d) => s + d.total_advisors, 0);
  const totalReview   = overview.reduce((s, d) =>
    s + d.programs.reduce((ps, p) =>
      ps + p.advisors.reduce((as, a) =>
        as + a.students.filter(st => st.status === 'needs-review').length, 0), 0), 0);
  const totalUnassigned = overview.reduce((s, d) =>
    s + d.programs.reduce((ps, p) => ps + (p.unassigned?.length || 0), 0), 0);

  return (
    <div className="faculty-root">
      <header className="faculty-header">
        <div className="faculty-header-left">
          <div className="faculty-header-icon">
            <svg width="20" height="20" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <div className="faculty-header-title">Chairperson Command Center</div>
            <div className="faculty-header-sub">Expert Advisor · Miami-Dade College</div>
          </div>
        </div>
        <div className="faculty-header-right">
          <span className="faculty-welcome">Welcome, {user?.first_name} {user?.last_name}</span>
          <button className="faculty-signout-btn" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>

      {!loading && (
        <div className="faculty-stats-bar">
          <div className="faculty-stat">
            <span className="faculty-stat-val">{totalStudents}</span>
            <span className="faculty-stat-lbl">Total Students</span>
          </div>
          <div className="faculty-stat">
            <span className="faculty-stat-val">{totalAdvisors}</span>
            <span className="faculty-stat-lbl">Advisors</span>
          </div>
          <div className="faculty-stat">
            <span className="faculty-stat-val">{programs.length}</span>
            <span className="faculty-stat-lbl">Programs</span>
          </div>
          <div className={`faculty-stat ${totalUnassigned > 0 ? 'faculty-stat-alert' : ''}`}>
            <span className="faculty-stat-val">{totalUnassigned}</span>
            <span className="faculty-stat-lbl">Unassigned</span>
          </div>
          <div className={`faculty-stat ${totalReview > 0 ? 'faculty-stat-alert' : ''}`}>
            <span className="faculty-stat-val">{totalReview}</span>
            <span className="faculty-stat-lbl">Awaiting Review</span>
          </div>
        </div>
      )}

      <nav className="faculty-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`faculty-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'management' && totalUnassigned > 0 && (
              <span className="tab-alert-dot" />
            )}
          </button>
        ))}
      </nav>

      <main className="faculty-content">
        {tab === 'overview' && (
          <DrillDownTab data={overview} loading={loading} advisors={advisors} onReassign={loadOverview} />
        )}
        {tab === 'population' && (
          <PopulationTab programs={programs} terms={terms} campuses={campuses} />
        )}
        {tab === 'heatmap' && (
          <HeatmapTab programs={programs} campuses={campuses} />
        )}
        {tab === 'management' && (
          <ManagementTab programs={programs} onRefresh={loadOverview} />
        )}
        {tab === 'curriculum' && (
          <CurriculumTab programs={programs} onProgramsChanged={loadPrograms} />
        )}
      </main>
    </div>
  );
}
