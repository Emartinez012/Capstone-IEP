// =============================================================================
// AdvisorDashboard.jsx
// Advisor's personal dashboard — caseload, pending IEP approvals, substitutions.
// Clicking a student (or a pending item) opens a full review modal.
// =============================================================================

import { useState, useEffect } from 'react';
import {
  getAdvisorCaseload, getAdvisorPending, getFacultySubstitutions,
  getPlan, savePlan, getDegreeCourses, advisorReviewIEP,
} from '../api';
import PlanDisplay from '../components/PlanDisplay';
import SemesterCard from '../components/SemesterCard';
import Toast from '../components/Toast';

// ── Helpers ──────────────────────────────────────────────────────────────────

function termLabel(code) {
  if (!code) return '—';
  const s  = String(code);
  const yy = parseInt(s.slice(0, 2), 10);
  const t  = s.slice(2);
  const yr = 2000 + yy;
  if (t === '1') return `Fall ${yr}`;
  if (t === '2') return `Spring ${yr + 1}`;
  if (t === '3') return `Summer ${yr + 1}`;
  return code;
}

const STATUS_META = {
  'on-track':     { label: 'On Track',     cls: 'badge-on-track',     icon: '✓' },
  'needs-review': { label: 'Needs Review', cls: 'badge-needs-review', icon: '⏳' },
  'at-risk':      { label: 'At Risk',      cls: 'badge-at-risk',      icon: '⚠' },
  'no-plan':      { label: 'No Plan',      cls: 'badge-no-plan',      icon: '—' },
  'approved':     { label: 'Approved',     cls: 'badge-approved',     icon: '✓' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: '' };
  return <span className={`status-badge ${m.cls}`}>{m.label}</span>;
}

// ── Student Snapshot / Review Modal ──────────────────────────────────────────

function StudentSnapshot({ student, advisorId, onClose, onReview }) {
  const [plan,         setPlan]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [notes,        setNotes]        = useState('');
  const [editMode,     setEditMode]     = useState(false);
  const [editPlan,     setEditPlan]     = useState(null);
  const [degreeCourses, setDegreeCourses] = useState([]);
  const [pickerSem,    setPickerSem]    = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [submitting,   setSubmitting]   = useState(false);

  useEffect(() => {
    getPlan(student.user_id)
      .then(data => setPlan(data))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [student.user_id]);

  // ── Edit mode helpers ──────────────────────────────────────────────────────

  async function startEdit() {
    if (!plan?.plan) return;
    setEditPlan(JSON.parse(JSON.stringify(plan.plan)));
    setEditMode(true);
    if (!degreeCourses.length && student.degree_code) {
      try {
        const courses = await getDegreeCourses(student.degree_code);
        setDegreeCourses(Array.isArray(courses) ? courses : []);
      } catch { /* non-fatal */ }
    }
  }

  function cancelEdit() {
    setEditPlan(null);
    setEditMode(false);
    setPickerSem(null);
  }

  function removeCourse(semNum, code) {
    setEditPlan(prev => prev.map(s =>
      s.semester === semNum
        ? { ...s, courses: s.courses.filter(c => c.course_code !== code) }
        : s
    ));
  }

  function addCourse(semNum, course) {
    setEditPlan(prev => prev.map(s =>
      s.semester === semNum
        ? { ...s, courses: [...s.courses, {
            course_code: course.course_code,
            title:       course.course_name ?? course.title ?? course.course_code,
            credits:     course.credits ?? 3,
          }] }
        : s
    ));
    setPickerSem(null);
    setPickerSearch('');
  }

  function scheduledCodes() {
    return new Set((editPlan ?? []).flatMap(s => s.courses.map(c => c.course_code)));
  }

  async function saveEdits() {
    setSaving(true);
    try {
      const result = await savePlan(student.user_id, editPlan);
      setPlan(result);
      setEditMode(false);
      setEditPlan(null);
    } catch { /* ignore — parent will toast on review */ }
    finally { setSaving(false); }
  }

  // ── Review actions ─────────────────────────────────────────────────────────

  async function handleReview(decision) {
    setSubmitting(true);
    try {
      await onReview(student.user_id, decision, notes);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const isPending = student.status === 'needs-review';

  return (
    <div className="snapshot-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="snapshot-modal">

        {/* Header */}
        <div className="snapshot-header">
          <div>
            <h3 className="snapshot-name">{student.first_name} {student.last_name}</h3>
            <p className="snapshot-sub">{student.program_name || student.degree_code}</p>
          </div>
          <button className="snapshot-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Info grid */}
        <div className="snapshot-info-grid">
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Status</span>
            <StatusBadge status={student.status} />
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Degree</span>
            <span className="snapshot-info-val">{student.degree_code || '—'}</span>
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Starting Term</span>
            <span className="snapshot-info-val">{termLabel(student.starting_term)}</span>
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Est. Graduation</span>
            <span className="snapshot-info-val">{termLabel(student.projected_graduation_term)}</span>
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Target Credits/Sem</span>
            <span className="snapshot-info-val">{student.target_credits || '—'}</span>
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Campus</span>
            <span className="snapshot-info-val">{student.preferred_campus_location || '—'}</span>
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Transfer</span>
            <span className="snapshot-info-val">{student.is_transfer ? 'Yes' : 'No'}</span>
          </div>
          <div className="snapshot-info-item">
            <span className="snapshot-info-label">Email</span>
            <span className="snapshot-info-val">{student.email || '—'}</span>
          </div>
        </div>

        {/* Review panel — only shown when IEP is pending */}
        {isPending && (
          <div className="snapshot-actions">
            <p className="snapshot-action-note">
              This student has submitted their IEP for review.
            </p>
            <textarea
              className="snapshot-note-input"
              placeholder="Add a note for the student (optional)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
            <div className="snapshot-action-btns">
              {!editMode ? (
                <button className="btn-edit-plan-sm" onClick={startEdit} disabled={loading || !plan}>
                  ✎ Edit Plan
                </button>
              ) : (
                <>
                  <button className="btn-cancel-sm" onClick={cancelEdit}>Cancel Edits</button>
                  <button className="btn-save-sm" onClick={saveEdits} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Plan Changes'}
                  </button>
                </>
              )}
              <button className="btn-reject" onClick={() => handleReview('decline')} disabled={submitting}>
                ✕ Request Changes
              </button>
              <button className="btn-approve" onClick={() => handleReview('approve')} disabled={submitting}>
                ✓ Approve IEP
              </button>
            </div>
          </div>
        )}

        {/* Plan display */}
        <div className="snapshot-plan">
          <h4 className="snapshot-plan-title">
            Course Plan
            {editMode && <span style={{ color: '#d35400', marginLeft: 8, fontSize: 13 }}>(Editing)</span>}
          </h4>
          {loading
            ? <p className="loading-msg"><span className="spinner spinner-dark" />Loading plan…</p>
            : editMode && editPlan
              ? (
                <div className="semester-grid">
                  {editPlan.map(sem => (
                    <SemesterCard
                      key={sem.semester}
                      semester_number={sem.semester}
                      term_code={sem.term_code}
                      courses={sem.courses}
                      editMode={true}
                      onRemove={code => removeCourse(sem.semester, code)}
                      onAddCourse={() => setPickerSem(sem)}
                    />
                  ))}
                </div>
              )
              : plan
                ? <PlanDisplay plan={plan.plan} studentName={`${student.first_name} ${student.last_name}`} />
                : <p style={{ color: '#888', fontStyle: 'italic' }}>No plan has been generated yet.</p>
          }
        </div>
      </div>

      {/* Course picker modal */}
      {pickerSem && (
        <div className="picker-overlay" onClick={() => { setPickerSem(null); setPickerSearch(''); }}>
          <div className="picker-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#1f3864' }}>Add a Course</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888' }}
                      onClick={() => { setPickerSem(null); setPickerSearch(''); }}>✕</button>
            </div>
            <input
              className="picker-search"
              placeholder="Search by code or title…"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              autoFocus
            />
            <ul className="picker-list">
              {degreeCourses
                .filter(c => !scheduledCodes().has(c.course_code))
                .filter(c => {
                  const q = pickerSearch.toLowerCase();
                  return !q || c.course_code.toLowerCase().includes(q)
                    || (c.course_name ?? c.title ?? '').toLowerCase().includes(q);
                })
                .map(c => (
                  <li key={c.course_code} className="picker-item"
                      onClick={() => addCourse(pickerSem.semester, c)}>
                    <span className="picker-code">{c.course_code}</span>
                    <span className="picker-title">{c.course_name ?? c.title}</span>
                    <span className="picker-cr">{c.credits} cr</span>
                  </li>
                ))
              }
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Caseload List ─────────────────────────────────────────────────────────────

function CaseloadList({ students, onSelectStudent }) {
  const [search, setSearch] = useState('');

  const filtered = students.filter(s =>
    `${s.first_name} ${s.last_name} ${s.degree_code}`.toLowerCase().includes(search.toLowerCase())
  );

  if (students.length === 0) {
    return (
      <div className="caseload-empty">
        <svg width="40" height="40" fill="none" stroke="#bbb" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <p>No students are currently assigned to you.</p>
        <p className="caseload-empty-sub">Contact your department chair to have students assigned to your caseload.</p>
      </div>
    );
  }

  return (
    <div className="caseload-section">
      <div className="caseload-search-wrap">
        <svg width="15" height="15" fill="none" stroke="#aaa" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          className="caseload-search"
          type="text"
          placeholder="Search by name or program…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <p className="record-count">{filtered.length} of {students.length} students</p>

      <div className="caseload-list">
        {filtered.map(s => (
          <div key={s.user_id} className="caseload-row" onClick={() => onSelectStudent(s)}>
            <div className="caseload-avatar">{s.first_name[0]}{s.last_name[0]}</div>
            <div className="caseload-info">
              <span className="caseload-name">{s.last_name}, {s.first_name}</span>
              <span className="caseload-program">{s.program_name || s.degree_code}</span>
              <span className="caseload-details">
                {termLabel(s.starting_term)}
                {s.preferred_campus_location && ` · ${s.preferred_campus_location}`}
                {s.projected_graduation_term && ` · Grad: ${termLabel(s.projected_graduation_term)}`}
              </span>
            </div>
            <div className="caseload-right">
              <StatusBadge status={s.status} />
              <svg width="14" height="14" fill="none" stroke="#bbb" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action Center ─────────────────────────────────────────────────────────────

function ActionCenter({ pending, subs, onReview, onSelectStudent, caseload }) {
  const [actionLoading, setActionLoading] = useState(null);

  async function quickApprove(studentUserId, scheduleId) {
    setActionLoading(scheduleId);
    try { await onReview(studentUserId, 'approve', ''); }
    finally { setActionLoading(null); }
  }

  function openReview(studentUserId) {
    const student = caseload.find(s => s.user_id === studentUserId);
    if (student) onSelectStudent(student);
  }

  return (
    <div className="action-center">

      {/* Pending IEP Approvals */}
      <div className="action-section">
        <h3 className="action-section-title">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          IEPs Awaiting Approval
          {pending.length > 0 && <span className="action-badge">{pending.length}</span>}
        </h3>

        {pending.length === 0
          ? <p className="action-empty">No IEPs awaiting approval.</p>
          : (
            <div className="action-list">
              {pending.map(p => (
                <div key={p.schedule_id} className="action-item">
                  <div className="action-item-info">
                    <span className="action-student-name">{p.last_name}, {p.first_name}</span>
                    <span className="action-item-meta">
                      {p.program_name || p.degree_code}
                      {p.projected_graduation_term && ` · Grad: ${termLabel(p.projected_graduation_term)}`}
                    </span>
                  </div>
                  <div className="action-item-btns">
                    <button className="btn-view-sm" onClick={() => openReview(p.student_user_id)}>
                      View
                    </button>
                    <button
                      className="btn-approve-sm"
                      onClick={() => quickApprove(p.student_user_id, p.schedule_id)}
                      disabled={actionLoading === p.schedule_id}
                    >
                      {actionLoading === p.schedule_id ? '…' : '✓ Approve'}
                    </button>
                    <button className="btn-view-sm" onClick={() => openReview(p.student_user_id)}>
                      ✎ Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Substitution Requests */}
      <div className="action-section">
        <h3 className="action-section-title">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
          </svg>
          Course Substitution Requests
          {subs.length > 0 && <span className="action-badge">{subs.length}</span>}
        </h3>

        {subs.length === 0
          ? <p className="action-empty">No pending substitution requests.</p>
          : (
            <div className="action-list">
              {subs.map(sub => (
                <div key={sub.substitution_id} className="action-item sub-item">
                  <div className="action-item-info">
                    <span className="action-student-name">{sub.student_last}, {sub.student_first}</span>
                    <div className="sub-courses">
                      <span className="sub-course-code">{sub.original_course_code || '—'}</span>
                      <svg width="12" height="12" fill="none" stroke="#888" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      <span className="sub-course-code">{sub.substitute_course_code || '—'}</span>
                    </div>
                    {sub.reason && <span className="sub-reason">{sub.reason}</span>}
                    <span className="action-item-meta">{sub.degree_code} · {sub.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdvisorDashboard({ user, onSignOut }) {
  const [caseload, setCaseload] = useState([]);
  const [pending,  setPending]  = useState([]);
  const [subs,     setSubs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [toast,    setToast]    = useState({ message: '', type: 'success' });

  const advisorId = user?.id;

  async function fetchAll() {
    if (!advisorId) return;
    try {
      const [cl, pend, substitutions] = await Promise.all([
        getAdvisorCaseload(advisorId),
        getAdvisorPending(advisorId),
        getFacultySubstitutions(),
      ]);
      setCaseload(cl);
      setPending(pend);
      setSubs(substitutions);
    } catch (err) {
      console.error('Advisor fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, [advisorId]);

  async function handleReview(studentUserId, decision, notes) {
    try {
      await advisorReviewIEP(studentUserId, decision, notes, advisorId);
      setToast({
        message: decision === 'approve'
          ? 'IEP approved — student notified.'
          : 'Changes requested — plan returned to student.',
        type: 'success',
      });
      fetchAll();
    } catch {
      setToast({ message: 'Action failed. Please try again.', type: 'error' });
    }
  }

  const statsOnTrack = caseload.filter(s => s.status === 'on-track').length;
  const statsReview  = caseload.filter(s => s.status === 'needs-review').length;
  const statsNoPlan  = caseload.filter(s => s.status === 'no-plan').length;

  return (
    <div className="faculty-root">

      <header className="faculty-header">
        <div className="faculty-header-left">
          <div className="faculty-header-icon">
            <svg width="20" height="20" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div>
            <div className="faculty-header-title">Advisor Dashboard</div>
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
            <span className="faculty-stat-val">{caseload.length}</span>
            <span className="faculty-stat-lbl">My Students</span>
          </div>
          <div className="faculty-stat">
            <span className="faculty-stat-val">{statsOnTrack}</span>
            <span className="faculty-stat-lbl">On Track</span>
          </div>
          <div className="faculty-stat">
            <span className="faculty-stat-val">{statsReview}</span>
            <span className="faculty-stat-lbl">Needs Review</span>
          </div>
          <div className="faculty-stat">
            <span className="faculty-stat-val">{statsNoPlan}</span>
            <span className="faculty-stat-lbl">No Plan Yet</span>
          </div>
          {pending.length > 0 && (
            <div className="faculty-stat faculty-stat-alert">
              <span className="faculty-stat-val">{pending.length}</span>
              <span className="faculty-stat-lbl">Pending Approvals</span>
            </div>
          )}
        </div>
      )}

      <main className="faculty-content">
        {loading
          ? <p className="loading-msg"><span className="spinner spinner-dark" />Loading your dashboard…</p>
          : (
            <div className="advisor-layout">
              <div className="advisor-col-left">
                <h3 className="advisor-section-title">My Caseload</h3>
                <CaseloadList students={caseload} onSelectStudent={setSelected} />
              </div>
              <div className="advisor-col-right">
                <h3 className="advisor-section-title">Action Center</h3>
                <ActionCenter
                  pending={pending}
                  subs={subs}
                  onReview={handleReview}
                  onSelectStudent={setSelected}
                  caseload={caseload}
                />
              </div>
            </div>
          )
        }
      </main>

      {selected && (
        <StudentSnapshot
          student={selected}
          advisorId={advisorId}
          onClose={() => setSelected(null)}
          onReview={handleReview}
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </div>
  );
}
