// =============================================================================
// StudentOnboarding.jsx
// Full-preference setup wizard for new and transfer students.
//
// Steps (new):      type → program → load → modality → schedule → term
// Steps (transfer): type → program → load → modality → schedule → term → courses
// =============================================================================

import { useState, useEffect } from 'react';
import { getMajors, getDegreeCourses, updateStudentProfile, generatePlan } from '../api';

// ── Constants ────────────────────────────────────────────────────────────────

const UPCOMING_TERMS = [
  { code: '252', label: 'Spring 2026' },
  { code: '253', label: 'Summer 2026' },
  { code: '261', label: 'Fall 2026'   },
  { code: '262', label: 'Spring 2027' },
  { code: '263', label: 'Summer 2027' },
  { code: '271', label: 'Fall 2027'   },
  { code: '272', label: 'Spring 2028' },
];

const CREDIT_OPTIONS = [
  { value: 9,  num: '9',  label: 'Part-time',  hint: '~3 courses' },
  { value: 12, num: '12', label: 'Full-time',   hint: '~4 courses' },
  { value: 15, num: '15', label: 'Heavy load',  hint: '~5 courses' },
  { value: 18, num: '18', label: 'Overload',    hint: '~6 courses' },
];

const TERM_DURATIONS = [
  { value: 12, label: '12-week' },
  { value: 14, label: '14-week' },
  { value: 16, label: '16-week' },
];

const MODALITIES = [
  { value: 'In-Person', icon: '🏫', desc: 'On-campus classes' },
  { value: 'Online',    icon: '💻', desc: 'Fully remote'      },
  { value: 'Blended',   icon: '🔀', desc: 'Mix of both'       },
];

const CAMPUSES = ['Homestead', 'North', 'Kendall', 'Wolfson', 'Padron', 'West'];

const TIME_PERIODS = [
  { key: 'Morning',   label: 'Morning',   sub: '8:00 AM – 12:15 PM' },
  { key: 'Afternoon', label: 'Afternoon', sub: '12:30 PM – 4:45 PM' },
  { key: 'Evening',   label: 'Evening',   sub: '5:00 PM – 7:40 PM'  },
];

const TIME_BLOCKS = {
  Morning:   ['8:00–9:15 AM', '9:30–10:45 AM', '11:00 AM–12:15 PM'],
  Afternoon: ['12:30–1:45 PM', '2:00–3:15 PM', '3:30–4:45 PM'],
  Evening:   ['5:00–6:15 PM', '6:25–7:40 PM'],
};

const WEEKLY_PATTERNS = [
  { value: 'MWF',  label: 'MWF',         sub: 'Mon / Wed / Fri — 50–75 min' },
  { value: 'TTh',  label: 'T/Th',        sub: 'Tue / Thu — 75–90 min'       },
  { value: '',     label: 'No preference', sub: 'Either works'               },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function StudentOnboarding({ user, onComplete }) {
  const [stepIdx, setStepIdx]             = useState(0);
  const [majors, setMajors]               = useState([]);
  const [degreeCourses, setDegreeCourses] = useState([]);
  const [slideDir, setSlideDir]           = useState('forward');
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  const [form, setForm] = useState({
    is_transfer:               false,
    degree_code:               '',
    target_credits:            12,        // financial-aid baseline default
    opt_out_summer:            false,
    preferred_term_durations:  [16],
    preferred_modality:        [],
    preferred_campus_location: '',
    preferred_time_slot:       { blocks: [], pattern: '' },
    starting_term:             '261',
    completed_courses:         [],
  });

  // Dynamic step list based on student type
  const STEPS = form.is_transfer
    ? ['type', 'program', 'load', 'modality', 'schedule', 'term', 'courses']
    : ['type', 'program', 'load', 'modality', 'schedule', 'term'];

  const currentStep = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast  = stepIdx === STEPS.length - 1;

  // Load majors on mount; pre-select first
  useEffect(() => {
    getMajors().then(data => {
      setMajors(data);
      if (data.length > 0 && !form.degree_code) {
        setForm(f => ({ ...f, degree_code: data[0].id }));
      }
    }).catch(console.error);
  }, []);

  // Load degree courses when transfer course step becomes active
  useEffect(() => {
    if (currentStep === 'courses' && form.degree_code) {
      setDegreeCourses([]);
      getDegreeCourses(form.degree_code).then(setDegreeCourses).catch(console.error);
    }
  }, [currentStep, form.degree_code]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goNext() {
    if (!isLast) { setSlideDir('forward'); setStepIdx(i => i + 1); }
  }

  function goBack() {
    if (!isFirst) { setSlideDir('backward'); setStepIdx(i => i - 1); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleMulti(field, value) {
    setForm(f => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  function toggleCourse(code) {
    setForm(f => {
      const arr = f.completed_courses;
      return { ...f, completed_courses: arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code] };
    });
  }

  function toggleTimeBlock(block) {
    setForm(f => {
      const blocks = f.preferred_time_slot.blocks;
      return {
        ...f,
        preferred_time_slot: {
          ...f.preferred_time_slot,
          blocks: blocks.includes(block) ? blocks.filter(b => b !== block) : [...blocks, block],
        },
      };
    });
  }

  function setTimePeriod(periodKey) {
    // Toggle the whole period — select all its blocks or deselect them
    const periodBlocks = TIME_BLOCKS[periodKey];
    setForm(f => {
      const current = f.preferred_time_slot.blocks;
      const allSelected = periodBlocks.every(b => current.includes(b));
      const next = allSelected
        ? current.filter(b => !periodBlocks.includes(b))
        : [...new Set([...current, ...periodBlocks])];
      return { ...f, preferred_time_slot: { ...f.preferred_time_slot, blocks: next } };
    });
  }

  function isPeriodActive(periodKey) {
    return TIME_BLOCKS[periodKey].some(b => form.preferred_time_slot.blocks.includes(b));
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  async function handleFinish() {
    setSaving(true);
    setError('');
    try {
      await updateStudentProfile(user.id, form);
      await generatePlan(user.id);
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.message || 'Failed to save profile. Please try again.');
      setSaving(false);
    }
  }

  // ── Step Renders ───────────────────────────────────────────────────────────

  function renderStep() {
    switch (currentStep) {

      // ── Step 1: Student Type ──────────────────────────────────────────────
      case 'type':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Welcome</p>
            <h2 className="ob-step-title">Let's set up your profile</h2>
            <p className="ob-step-sub">Are you starting fresh or bringing credits from another school?</p>
            <div className="ob-type-cards">
              <div
                className={`ob-type-card${!form.is_transfer ? ' selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_transfer: false, completed_courses: [] }))}
                style={!form.is_transfer ? { borderColor: '#2e5496', background: '#eef4fb' } : {}}
              >
                <div className="ob-type-icon" style={{ fontSize: 28 }}>🎓</div>
                <div className="ob-type-label">New Student</div>
                <div className="ob-type-desc">Starting my first semester at MDC</div>
              </div>
              <div
                className={`ob-type-card${form.is_transfer ? ' selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_transfer: true }))}
                style={form.is_transfer ? { borderColor: '#2e5496', background: '#eef4fb' } : {}}
              >
                <div className="ob-type-icon" style={{ fontSize: 28 }}>🔄</div>
                <div className="ob-type-label">Transfer Student</div>
                <div className="ob-type-desc">Bringing credits from another institution</div>
              </div>
            </div>
          </div>
        );

      // ── Step 2: Program ───────────────────────────────────────────────────
      case 'program':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Degree Program</p>
            <h2 className="ob-step-title">What's your intended major?</h2>
            <p className="ob-step-sub">Your degree model determines which courses appear in your plan.</p>
            <select
              className="ob-select"
              value={form.degree_code || ''}
              onChange={e => setForm(f => ({ ...f, degree_code: e.target.value, completed_courses: [] }))}
            >
              {majors.length === 0 && <option value="">Loading programs…</option>}
              {majors.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        );

      // ── Step 3: Course Load ───────────────────────────────────────────────
      case 'load':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Course Load</p>
            <h2 className="ob-step-title">How do you plan to take classes?</h2>
            <p className="ob-step-sub">12 credits is the full-time baseline required for financial aid.</p>

            <p className="ob-sub-label">Credits per semester</p>
            <div className="ob-load-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {CREDIT_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className={`ob-load-card${form.target_credits === opt.value ? ' selected' : ''}`}
                  onClick={() => setForm(f => ({ ...f, target_credits: opt.value }))}
                >
                  <div className="ob-load-num">{opt.num}</div>
                  <div className="ob-load-label">{opt.label}</div>
                  <div className="ob-load-hint">{opt.hint}</div>
                </div>
              ))}
            </div>

            <hr className="ob-section-divider" />

            <p className="ob-sub-label">Preferred term duration</p>
            <div className="ob-pills">
              {TERM_DURATIONS.map(td => (
                <button
                  key={td.value}
                  className={`ob-pill${form.preferred_term_durations.includes(td.value) ? ' selected' : ''}`}
                  onClick={() => {
                    // Single-select: replace array with just this value
                    setForm(f => ({ ...f, preferred_term_durations: [td.value] }));
                  }}
                >
                  {td.label}
                </button>
              ))}
            </div>

            <hr className="ob-section-divider" />

            <label className="ob-toggle">
              <input
                type="checkbox"
                checked={form.opt_out_summer}
                onChange={e => setForm(f => ({ ...f, opt_out_summer: e.target.checked }))}
              />
              Skip summer semesters
            </label>
          </div>
        );

      // ── Step 4: Modality ──────────────────────────────────────────────────
      case 'modality':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Delivery Format</p>
            <h2 className="ob-step-title">How do you prefer to take classes?</h2>
            <p className="ob-step-sub">Select all formats you're open to.</p>
            <div className="ob-time-cards">
              {MODALITIES.map(m => (
                <div
                  key={m.value}
                  className={`ob-time-card${form.preferred_modality.includes(m.value) ? ' selected' : ''}`}
                  onClick={() => toggleMulti('preferred_modality', m.value)}
                >
                  <div style={{ fontSize: 28, marginBottom: 4 }}>{m.icon}</div>
                  <div className="ob-time-label">{m.value}</div>
                  <div className="ob-time-sub">{m.desc}</div>
                </div>
              ))}
            </div>
            <p className="ob-no-pref-note">You can always update this later from your profile.</p>
          </div>
        );

      // ── Step 5: Schedule Preferences ─────────────────────────────────────
      case 'schedule':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Schedule Preferences</p>
            <h2 className="ob-step-title">When and where do you want to study?</h2>

            <p className="ob-sub-label">Preferred campus</p>
            <div className="ob-pills ob-pills-lg">
              {CAMPUSES.map(campus => (
                <button
                  key={campus}
                  className={`ob-pill${form.preferred_campus_location === campus ? ' selected' : ''}`}
                  onClick={() => setForm(f => ({
                    ...f,
                    preferred_campus_location: f.preferred_campus_location === campus ? '' : campus,
                  }))}
                >
                  {campus}
                </button>
              ))}
            </div>

            <hr className="ob-section-divider" />

            <p className="ob-sub-label">Preferred time of day</p>
            <div className="ob-time-cards">
              {TIME_PERIODS.map(p => (
                <div
                  key={p.key}
                  className={`ob-time-card${isPeriodActive(p.key) ? ' selected' : ''}`}
                  onClick={() => setTimePeriod(p.key)}
                >
                  <div className="ob-time-label">{p.label}</div>
                  <div className="ob-time-sub">{p.sub}</div>
                </div>
              ))}
            </div>

            {/* Show specific blocks for active periods */}
            {TIME_PERIODS.filter(p => isPeriodActive(p.key)).map(p => (
              <div key={p.key} className="ob-time-period-section">
                <div className="ob-time-period-label">{p.label} blocks</div>
                <div className="ob-time-block-pills">
                  {TIME_BLOCKS[p.key].map(block => (
                    <button
                      key={block}
                      className={`ob-pill${form.preferred_time_slot.blocks.includes(block) ? ' selected' : ''}`}
                      onClick={() => toggleTimeBlock(block)}
                    >
                      {block}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <hr className="ob-section-divider" />

            <p className="ob-sub-label">Weekly meeting pattern</p>
            <div className="ob-time-cards">
              {WEEKLY_PATTERNS.map(p => (
                <div
                  key={p.value}
                  className={`ob-time-card${form.preferred_time_slot.pattern === p.value ? ' selected' : ''}`}
                  onClick={() => setForm(f => ({
                    ...f,
                    preferred_time_slot: { ...f.preferred_time_slot, pattern: p.value },
                  }))}
                >
                  <div className="ob-time-label">{p.label}</div>
                  <div className="ob-time-sub">{p.sub}</div>
                </div>
              ))}
            </div>
          </div>
        );

      // ── Step 6: Starting Term ─────────────────────────────────────────────
      case 'term':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Starting Term</p>
            <h2 className="ob-step-title">When are you starting?</h2>
            <p className="ob-step-sub">Your plan will begin from this semester.</p>
            <select
              className="ob-select"
              value={form.starting_term || '261'}
              onChange={e => setForm(f => ({ ...f, starting_term: e.target.value }))}
            >
              {UPCOMING_TERMS.map(t => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
        );

      // ── Step 7: Transfer Courses (transfer only) ──────────────────────────
      case 'courses':
        return (
          <div className="ob-step">
            <p className="ob-step-eyebrow">Transfer Credits</p>
            <h2 className="ob-step-title">Which courses have you completed?</h2>
            <p className="ob-step-sub">Check all courses you've already passed — these will be skipped in your plan.</p>

            {degreeCourses.length === 0 ? (
              <p className="ob-loading">Loading degree courses…</p>
            ) : (
              <div className="ob-course-list">
                {degreeCourses.map(c => (
                  <label key={c.course_code} className="ob-course-item">
                    <input
                      type="checkbox"
                      checked={form.completed_courses.includes(c.course_code)}
                      onChange={() => toggleCourse(c.course_code)}
                    />
                    <span className="ob-course-code">{c.course_code}</span>
                    <span className="ob-course-name">{c.course_name}</span>
                  </label>
                ))}
              </div>
            )}

            {form.completed_courses.length > 0 && (
              <p className="ob-selected-count">
                {form.completed_courses.length} course{form.completed_courses.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="onboard-root">

      {/* Progress bar */}
      <div className="ob-progress">
        <div className="ob-progress-bar-wrap">
          <div
            className="ob-progress-bar-fill"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <span className="ob-progress-label">Step {stepIdx + 1} of {STEPS.length}</span>
      </div>

      {/* Slide card */}
      <div className="onboard-card-wrap">
        <div key={currentStep} className={`onboard-card slide-${slideDir}`}>
          {renderStep()}
        </div>
      </div>

      {/* Navigation */}
      <div className="ob-nav">
        <button
          className="ob-nav-back"
          onClick={goBack}
          style={{ visibility: isFirst ? 'hidden' : 'visible' }}
        >
          ← Back
        </button>

        {error && <p className="auth-error ob-nav-error">{error}</p>}

        {isLast ? (
          <button className="ob-nav-next finish-btn" onClick={handleFinish} disabled={saving}>
            {saving ? 'Saving…' : 'Finish Setup →'}
          </button>
        ) : (
          <button className="ob-nav-next" onClick={goNext}>
            Next →
          </button>
        )}
      </div>

    </div>
  );
}
