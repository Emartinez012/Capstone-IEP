// =============================================================================
// StudentDashboard.jsx — Student home: My Plan, Profile, History tabs
// =============================================================================

import { useState, useEffect } from 'react';
import SemesterCard from '../components/SemesterCard';
import {
  getPlan, generatePlan, getStudentProfile, getDegreeCourses,
  savePlan, getIEPStatus, submitIEP, respondToIEP, updateStudentProfile,
  setElectiveChoice,
} from '../api';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  Draft:     { label: 'Draft',                   color: '#555',    bg: '#f8f9fa' },
  Submitted: { label: 'Awaiting Advisor Review',  color: '#1a56db', bg: '#eff6ff' },
  Approved:  { label: 'Approved by Advisor',      color: '#166534', bg: '#f0fdf4' },
  Declined:  { label: 'Changes Requested',        color: '#991b1b', bg: '#fef2f2' },
  Accepted:  { label: 'Officially Accepted',      color: '#5b21b6', bg: '#f5f3ff' },
  Revised:   { label: 'Revision in Progress',     color: '#92400e', bg: '#fffbeb' },
};

const STATUS_SUBTEXT = {
  Draft:     'Your plan is ready to edit. Submit to your advisor when ready.',
  Submitted: 'Your advisor will review your plan and get back to you soon.',
  Approved:  'Your advisor approved your plan — accept it to finalize your IEP.',
  Declined:  'Your advisor has requested changes. Edit your plan and resubmit.',
  Accepted:  "Your IEP has been officially accepted. You're all set!",
  Revised:   'You\'re revising your plan. Submit again when ready.',
};

const CAMPUSES = ['Homestead', 'North', 'Kendall', 'Wolfson', 'Padron', 'West'];
const MODALITIES = ['In-Person', 'Online', 'Blended'];
const CREDIT_OPTIONS = [9, 12, 15, 18];
const TABS = [
  { id: 'plan',    label: 'My Plan'  },
  { id: 'profile', label: 'Profile'  },
  { id: 'history', label: 'History'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function termCodeToLabel(code) {
  if (!code) return '';
  const s  = String(code);
  const yy = parseInt(s.slice(0, 2), 10);
  const t  = parseInt(s.slice(-1), 10);
  const names = { 1: 'Fall', 2: 'Spring', 3: 'Summer' };
  const year  = t === 1 ? 2000 + yy : 2000 + yy + 1;
  return `${names[t] ?? '?'} ${year}`;
}

function gradeClass(grade) {
  if (!grade)                    return 'grade-other';
  if (grade === 'W')             return 'grade-w';
  if (grade === 'TR')            return 'grade-transfer';
  if (grade.startsWith('A'))     return 'grade-a';
  if (grade.startsWith('B'))     return 'grade-b';
  if (grade.startsWith('C'))     return 'grade-c';
  if (grade.startsWith('D'))     return 'grade-d';
  return 'grade-other';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudentDashboard({ user, onSignOut }) {
  const [activeTab,     setActiveTab]     = useState('plan');
  const [plan,          setPlan]          = useState(null);
  const [graduation,    setGraduation]    = useState(null);
  const [iepStatus,     setIepStatus]     = useState(null);
  const [profile,       setProfile]       = useState(null);
  const [degreeCourses, setDegreeCourses] = useState([]);
  const [creditsScheduled, setCreditsScheduled] = useState(null);
  const [creditsRequired,  setCreditsRequired]  = useState(null);

  const [editMode,      setEditMode]      = useState(false);
  const [editPlan,      setEditPlan]      = useState(null);
  const [picker,        setPicker]        = useState(null);
  const [pickerSearch,  setPickerSearch]  = useState('');

  const [profileForm,   setProfileForm]   = useState(null);

  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [error,         setError]         = useState('');
  const [toast,         setToast]         = useState('');

  useEffect(() => { loadAll(); }, [user.id]);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [planData, statusData, profileData] = await Promise.all([
        getPlan(user.id),
        getIEPStatus(user.id),
        getStudentProfile(user.id),
      ]);
      setPlan(planData?.plan ?? null);
      setGraduation(planData?.graduation_term ?? null);
      setCreditsScheduled(planData?.total_credits_scheduled ?? null);
      setCreditsRequired(planData?.total_credits_required ?? null);
      setIepStatus(statusData);
      setProfile(profileData);
      if (profileData?.degree_code) {
        const courses = await getDegreeCourses(profileData.degree_code);
        setDegreeCourses(Array.isArray(courses) ? courses : []);
      }
    } catch {
      setError('Could not load your dashboard. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // ── Plan editing ──────────────────────────────────────────────────────────

  function startEdit() {
    setEditPlan(JSON.parse(JSON.stringify(plan)));
    setEditMode(true);
  }

  function cancelEdit() {
    setEditPlan(null);
    setEditMode(false);
    setPicker(null);
  }

  function removeCourse(semNum, courseCode) {
    setEditPlan(prev => prev.map(s =>
      s.semester === semNum
        ? { ...s, courses: s.courses.filter(c => c.course_code !== courseCode) }
        : s
    ));
  }

  function addCourseToSemester(semNum, course) {
    setEditPlan(prev => prev.map(s =>
      s.semester === semNum
        ? { ...s, courses: [...s.courses, {
            course_code: course.course_code,
            title:       course.course_name ?? course.title ?? course.course_code,
            credits:     course.credits ?? 3,
          }] }
        : s
    ));
    setPicker(null);
    setPickerSearch('');
  }

  function scheduledCodes() {
    if (!editPlan) return new Set();
    return new Set(editPlan.flatMap(s => s.courses.map(c => c.course_code)));
  }

  // Phase 8 — student picks an alternative for an elective slot. Optimistically
  // updates the displayed plan, then persists via PATCH. On failure, reloads
  // from the server so the UI matches reality.
  async function handleElectiveChange(sourceRowId, newCourseId) {
    if (!sourceRowId || !newCourseId) return;
    setPlan(prev => prev?.map(sem => ({
      ...sem,
      courses: sem.courses.map(c =>
        c.source_row_id === sourceRowId
          ? {
              ...c,
              course_code: newCourseId,
              is_student_override: newCourseId !== c.default_course_id,
              resolution_source:   newCourseId !== c.default_course_id ? 'elective_chosen' : 'elective_default',
            }
          : c
      ),
    })));
    try {
      await setElectiveChoice(user.id, sourceRowId, newCourseId);
      showToast('Elective updated.');
    } catch (e) {
      setError(e.message || 'Could not update elective.');
      const refreshed = await getPlan(user.id);
      if (refreshed) setPlan(refreshed.plan);
    }
  }

  // Set of courses the student has already completed — fed to the picker so
  // it filters out courses the student can't retake.
  const completedCourseCodes = (profile?.academic_history || []).map(c => c.course_code);

  async function saveEdits() {
    setSaving(true);
    setError('');
    try {
      const result = await savePlan(user.id, editPlan);
      setPlan(result.plan);
      setGraduation(result.graduation_term);
      const sd = await getIEPStatus(user.id);
      setIepStatus(sd);
      setEditMode(false);
      setEditPlan(null);
      showToast('Plan saved.');
    } catch {
      setError('Could not save plan. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── IEP workflow ──────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      await submitIEP(user.id);
      const sd = await getIEPStatus(user.id);
      setIepStatus(sd);
      showToast('Plan submitted to your advisor!');
    } catch {
      setError('Could not submit plan. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespond(response) {
    setSubmitting(true);
    setError('');
    try {
      await respondToIEP(user.id, response);
      const sd = await getIEPStatus(user.id);
      setIepStatus(sd);
      showToast(response === 'accept'
        ? 'Plan accepted — your IEP is now official!'
        : 'Plan returned to draft for revision.');
    } catch {
      setError('Could not process your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const data = await generatePlan(user.id);
      setPlan(data.plan);
      setGraduation(data.graduation_term);
      setCreditsScheduled(data.total_credits_scheduled ?? null);
      setCreditsRequired(data.total_credits_required ?? null);
      const sd = await getIEPStatus(user.id);
      setIepStatus(sd);
      showToast('Plan generated!');
    } catch {
      setError('Could not generate plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Profile editing ───────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'profile' && profile && !profileForm) {
      setProfileForm({
        target_credits:            profile.target_credits            ?? 12,
        opt_out_summer:            profile.opt_out_summer            ?? false,
        preferred_modality:        profile.preferred_modality        ?? [],
        preferred_campus_location: profile.preferred_campus_location ?? '',
        secondary_campus_location: profile.secondary_campus_location ?? null,
        preferred_time_slot:       profile.preferred_time_slot       ?? { blocks: [], pattern: '' },
        preferred_term_durations:  profile.preferred_term_durations  ?? [16],
      });
    }
  }, [activeTab, profile]);

  async function saveProfile() {
    setSaving(true);
    setError('');
    try {
      await updateStudentProfile(user.id, {
        ...profileForm,
        degree_code:   profile.degree_code,
        starting_term: profile.starting_term,
        is_transfer:   profile.is_transfer,
      });
      const updated = await getStudentProfile(user.id);
      setProfile(updated);
      setProfileForm(null);
      showToast('Profile updated.');
    } catch {
      setError('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const currentStatus = iepStatus?.current_status ?? 'Draft';
  const statusMeta    = STATUS_META[currentStatus]  ?? STATUS_META.Draft;
  const totalCourses  = plan ? plan.reduce((sum, s) => sum + s.courses.length, 0) : 0;
  const displayPlan   = editMode ? editPlan : plan;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Header */}
      <header className="app-header">
        <div className="header-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{ marginRight: 10, flexShrink: 0 }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <h1>Expert Advisor</h1>
            <p className="header-subtitle">Student Portal</p>
          </div>
        </div>
        <nav className="app-nav">
          <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 14 }}>
            Hey, {user.first_name}
          </span>
          <button className="nav-btn" onClick={onSignOut}>Sign Out</button>
        </nav>
      </header>

      {/* Tab bar */}
      <div className="dash-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`dash-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => { setActiveTab(t.id); setError(''); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && <div className="dash-toast">{toast}</div>}

      {/* Main content */}
      <main className="app-main">
        {loading
          ? <p style={{ padding: '48px 0', textAlign: 'center', color: '#888' }}>Loading…</p>
          : (
            <>
              {activeTab === 'plan'    && <PlanTab    />}
              {activeTab === 'profile' && <ProfileTab />}
              {activeTab === 'history' && <HistoryTab />}
            </>
          )
        }
      </main>

      {/* Course picker modal */}
      {picker && (
        <div className="picker-overlay" onClick={() => { setPicker(null); setPickerSearch(''); }}>
          <div className="picker-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#1f3864' }}>Add a Course</h3>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888' }}
                onClick={() => { setPicker(null); setPickerSearch(''); }}
              >✕</button>
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
                  return !q
                    || c.course_code.toLowerCase().includes(q)
                    || (c.course_name ?? c.title ?? '').toLowerCase().includes(q);
                })
                .map(c => (
                  <li
                    key={c.course_code}
                    className="picker-item"
                    onClick={() => addCourseToSemester(picker.semester, c)}
                  >
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

  // ==========================================================================
  // Plan Tab
  // ==========================================================================
  function PlanTab() {
    const canEdit   = ['Draft', 'Revised', 'Declined'].includes(currentStatus);
    const canSubmit = ['Draft', 'Revised'].includes(currentStatus) && !editMode;
    const canAccept = currentStatus === 'Approved';

    return (
      <div>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5',
                        borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                        color: '#991b1b', fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Status banner */}
        {plan && (
          <div className="dash-status-bar"
               style={{ borderLeftColor: statusMeta.color, background: statusMeta.bg }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: statusMeta.color }}>{statusMeta.label}</strong>
              <span className="status-sub">{STATUS_SUBTEXT[currentStatus]}</span>
              {iepStatus?.advisor_notes && ['Approved', 'Declined'].includes(currentStatus) && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#444' }}>
                  <em>Advisor note:</em> {iepStatus.advisor_notes}
                </p>
              )}
            </div>
            <div className="dash-status-actions">
              {canEdit && !editMode && (
                <button className="btn-regenerate" onClick={startEdit}>Edit Plan</button>
              )}
              {editMode && (
                <>
                  <button className="btn-regenerate" onClick={cancelEdit}>Cancel</button>
                  <button className="btn-generate" onClick={saveEdits} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
              {canSubmit && (
                <button className="btn-generate" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit to Advisor →'}
                </button>
              )}
              {currentStatus === 'Submitted' && (
                <button className="btn-regenerate" onClick={() => handleRespond('revise')}
                        disabled={submitting}>
                  Cancel Submission
                </button>
              )}
              {canAccept && (
                <>
                  <button className="btn-regenerate"
                          style={{ borderColor: '#dc2626', color: '#dc2626' }}
                          onClick={() => handleRespond('revise')} disabled={submitting}>
                    Request Changes
                  </button>
                  <button className="btn-generate"
                          style={{ background: '#166534' }}
                          onClick={() => handleRespond('accept')} disabled={submitting}>
                    Accept Plan ✓
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Plan stats */}
        {plan && (
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
            {plan.length} semester{plan.length !== 1 ? 's' : ''}
            {' · '}{totalCourses} course{totalCourses !== 1 ? 's' : ''}
            {graduation && <> · <strong>Graduating {termCodeToLabel(graduation)}</strong></>}
          </p>
        )}

        {/* No plan */}
        {!plan && (
          <div className="dash-empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <h3>No plan yet</h3>
            <p>Generate your personalized course schedule to get started.</p>
            <button className="btn-generate" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate My Plan'}
            </button>
          </div>
        )}

        {/* Phase 9 — credit-total banner */}
        {displayPlan?.length > 0 && creditsScheduled !== null && creditsRequired !== null && (() => {
          const isShort = creditsScheduled < creditsRequired;
          const isOver  = creditsScheduled > creditsRequired;
          const cls     = `plan-credit-banner ${isShort ? 'short' : isOver ? 'over' : 'on-target'}`;
          return (
            <div className={cls} role="status">
              <strong>{creditsScheduled}</strong> / {creditsRequired} credits planned
              {isShort && <span className="banner-tag">— short by {creditsRequired - creditsScheduled}</span>}
              {isOver  && <span className="banner-tag">— over by {creditsScheduled - creditsRequired}</span>}
            </div>
          );
        })()}

        {/* Semester grid */}
        {displayPlan?.length > 0 && (
          <div className="semester-grid">
            {displayPlan.map(sem => (
              <SemesterCard
                key={sem.semester}
                semester_number={sem.semester}
                term_code={sem.term_code}
                courses={sem.courses}
                notes={sem.notes}
                editMode={editMode}
                onRemove={code => removeCourse(sem.semester, code)}
                onAddCourse={() => setPicker({ semester: sem.semester, term_code: sem.term_code })}
                completed_courses={completedCourseCodes}
                onElectiveChange={editMode ? undefined : handleElectiveChange}
                disablePicker={editMode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // Profile Tab
  // ==========================================================================
  function ProfileTab() {
    if (!profile || !profileForm) {
      return <p style={{ padding: '32px 0', color: '#888' }}>Loading…</p>;
    }

    function toggleModality(m) {
      const arr = profileForm.preferred_modality;
      setProfileForm(f => ({
        ...f,
        preferred_modality: arr.includes(m) ? arr.filter(x => x !== m) : [...arr, m],
      }));
    }

    return (
      <div>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5',
                        borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                        color: '#991b1b', fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Identity */}
        <div className="profile-card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#2e5496', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, flexShrink: 0,
          }}>
            {(user.first_name?.[0] ?? '')}
            {(user.last_name?.[0] ?? '')}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#1f3864' }}>
              {user.first_name} {user.last_name}
            </p>
            <p style={{ margin: '2px 0', fontSize: 13, color: '#555' }}>{profile.email}</p>
            {profile.major_name && (
              <p style={{ margin: '2px 0', fontSize: 13, color: '#777' }}>{profile.major_name}</p>
            )}
          </div>
        </div>

        {/* Advisor */}
        {profile.advisor && (
          <div className="profile-card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="#2e5496" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                 style={{ marginTop: 2, flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Your Academic Advisor
              </p>
              <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#1f3864', fontSize: 14 }}>
                {profile.advisor.first_name} {profile.advisor.last_name}
              </p>
              <a href={`mailto:${profile.advisor.email}`}
                 style={{ fontSize: 13, color: '#2e5496' }}>
                {profile.advisor.email}
              </a>
            </div>
          </div>
        )}

        {/* Editable preferences */}
        <div className="profile-grid">

          {/* Academic */}
          <div className="profile-card">
            <h3>Academic</h3>

            <div className="pref-section">
              <p className="pref-label">GPA</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1f3864' }}>
                {profile.gpa != null
                  ? <>{parseFloat(profile.gpa).toFixed(2)}<span style={{ fontSize: 13, color: '#888', fontWeight: 400 }}> / 4.00</span></>
                  : <span style={{ fontSize: 14, color: '#aaa', fontWeight: 400 }}>No graded courses on record</span>
                }
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#aaa' }}>
                Calculated from history. W and transfer credits excluded.
              </p>
            </div>

            <div className="pref-section">
              <p className="pref-label">Credits per Semester</p>
              <div className="pref-chip-row">
                {CREDIT_OPTIONS.map(v => (
                  <button
                    key={v}
                    className={`pref-chip${profileForm.target_credits === v ? ' active' : ''}`}
                    onClick={() => setProfileForm(f => ({ ...f, target_credits: v }))}
                  >
                    {v} cr
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={profileForm.opt_out_summer}
                onChange={e => setProfileForm(f => ({ ...f, opt_out_summer: e.target.checked }))}
              />
              Skip summer semesters
            </label>
          </div>

          {/* Preferences */}
          <div className="profile-card">
            <h3>Preferences</h3>

            <div className="pref-section">
              <p className="pref-label">Delivery Format</p>
              <div className="pref-chip-row">
                {MODALITIES.map(m => (
                  <button
                    key={m}
                    className={`pref-chip${profileForm.preferred_modality.includes(m) ? ' active' : ''}`}
                    onClick={() => toggleModality(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <p className="pref-label">Primary Campus</p>
              <div className="pref-chip-row">
                {CAMPUSES.map(c => (
                  <button
                    key={c}
                    className={`pref-chip${profileForm.preferred_campus_location === c ? ' active' : ''}`}
                    onClick={() => setProfileForm(f => ({
                      ...f,
                      preferred_campus_location: f.preferred_campus_location === c ? '' : c,
                      secondary_campus_location: null,
                    }))}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {profileForm.preferred_campus_location && (
              <div className="pref-section">
                <p className="pref-label">Secondary Campus <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></p>
                <div className="pref-chip-row">
                  {CAMPUSES
                    .filter(c => c !== profileForm.preferred_campus_location)
                    .map(c => (
                      <button
                        key={c}
                        className={`pref-chip${profileForm.secondary_campus_location === c ? ' active' : ''}`}
                        onClick={() => setProfileForm(f => ({
                          ...f,
                          secondary_campus_location: f.secondary_campus_location === c ? null : c,
                        }))}
                      >
                        {c}
                      </button>
                    ))}
                  <button
                    className={`pref-chip${!profileForm.secondary_campus_location ? ' active' : ''}`}
                    onClick={() => setProfileForm(f => ({ ...f, secondary_campus_location: null }))}
                  >
                    None
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <button className="btn-generate" onClick={saveProfile} disabled={saving}
                style={{ marginTop: 4 }}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    );
  }

  // ==========================================================================
  // History Tab
  // ==========================================================================
  function HistoryTab() {
    const history      = profile?.academic_history ?? [];
    const earnedRows   = history.filter(c => c.grade !== 'W');
    const totalCredits = earnedRows.reduce((sum, c) => sum + (c.credits ?? 0), 0);
    const withdrawals  = history.filter(c => c.grade === 'W');

    return (
      <div>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5',
                        borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                        color: '#991b1b', fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#1f3864' }}>Course History</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
            {history.length} course{history.length !== 1 ? 's' : ''}
            {' · '}{totalCredits} credit{totalCredits !== 1 ? 's' : ''} earned
            {profile?.gpa != null
              ? <> · <strong>GPA {parseFloat(profile.gpa).toFixed(2)}</strong></>
              : ' · GPA —'
            }
          </p>
        </div>

        {withdrawals.length > 0 && (
          <div className="w-callout">
            <span style={{ fontSize: 18, color: '#b45309' }}>ℹ</span>
            <div>
              <strong>Withdrawal ({withdrawals.length} course{withdrawals.length !== 1 ? 's' : ''})</strong>
              <p style={{ margin: '4px 0 0' }}>
                A <strong>W</strong> means you withdrew after the add/drop deadline. It appears on your
                transcript but <em>does not affect your GPA</em>.
              </p>
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="dash-empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
            <h3>No history on record</h3>
            <p>{profile?.is_transfer
              ? 'Transfer courses will appear here after your credits are processed.'
              : 'Completed courses will appear here as you progress through your program.'
            }</p>
          </div>
        ) : (
          <table className="student-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Title</th>
                <th>Credits</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {history.map(c => (
                <tr key={c.course_code} className={c.grade === 'W' ? 'row-withdrawn' : ''}>
                  <td style={{ fontWeight: 600, color: '#2e5496' }}>{c.course_code}</td>
                  <td>
                    {c.title ?? '—'}
                    {c.grade === 'W' && (
                      <span style={{ marginLeft: 8, fontSize: 11, background: '#f1f5f9',
                                     color: '#64748b', padding: '2px 6px', borderRadius: 10 }}>
                        Withdrawn
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{c.grade === 'W' ? '—' : (c.credits ?? '—')}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`grade-badge ${gradeClass(c.grade)}`}>{c.grade ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
}
