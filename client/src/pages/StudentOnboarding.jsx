// =============================================================================
// StudentOnboarding.jsx
// Multi-step profile setup wizard shown after a student creates their account.
// Each step slides in horizontally. The user can go back and edit any answer.
//
// Steps (new student):    type → program → load → delivery → days → times → term → skip → done
// Steps (transfer):       type → transcript → program → load → delivery → days → times → term → skip → done
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { getMajors, updateStudentProfile, generatePlan } from '../api';

// Upcoming terms starting from Spring 2026 (current date: March 2026).
// Format: { code: YYT string, label: human-readable }
const UPCOMING_TERMS = [
  { code: '252', label: 'Spring 2026' },
  { code: '253', label: 'Summer 2026' },
  { code: '261', label: 'Fall 2026'   },
  { code: '262', label: 'Spring 2027' },
  { code: '263', label: 'Summer 2027' },
  { code: '271', label: 'Fall 2027'   },
  { code: '272', label: 'Spring 2028' },
];

const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMES = [
  { key: 'Morning',   label: 'Morning',   sub: '8 am – 12 pm' },
  { key: 'Afternoon', label: 'Afternoon', sub: '12 pm – 5 pm' },
  { key: 'Evening',   label: 'Evening',   sub: '5 pm – 9 pm'  },
];
const DELIVERY_MODES = [
  { key: 'Online',    label: 'Online',     icon: '🌐' },
  { key: 'Live',      label: 'Live',       icon: '📡' },
  { key: 'Blended',   label: 'Blended',    icon: '🔀' },
  { key: 'On-campus', label: 'On-Campus',  icon: '🏫' },
];

// Steps arrays — transcript is only inserted for transfer students.
const STEPS_NEW      = ['type', 'program', 'load', 'delivery', 'days', 'times', 'term', 'skip', 'done'];
const STEPS_TRANSFER = ['type', 'transcript', 'program', 'load', 'delivery', 'days', 'times', 'term', 'skip', 'done'];

export default function StudentOnboarding({ user, onComplete }) {
  const [formData, setFormData] = useState({
    isTransfer:          null,   // null | true | false
    major_id:            null,
    courses_per_semester: 3,
    employment:          null,   // 'none' | 'part-time' | 'full-time' — UI only, not saved to DB
    delivery_mode:       null,
    preferred_days:      [],
    preferred_times:     [],
    starting_term:       null,
    skipped_terms:       [],
  });

  const [stepIdx,       setStepIdx]       = useState(0);
  const [slideDir,      setSlideDir]      = useState('forward');
  const [majors,        setMajors]        = useState([]);
  const [transcriptFile, setTranscriptFile] = useState(null);
  const [dragOver,      setDragOver]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [error,         setError]         = useState('');
  const fileInputRef = useRef(null);

  // Fetch majors on mount
  useEffect(() => {
    getMajors().then(setMajors).catch(() => {});
  }, []);

  // Which steps array to use
  const steps = formData.isTransfer ? STEPS_TRANSFER : STEPS_NEW;
  const currentStep = steps[stepIdx];

  // Progress indicator: all steps except 'type' and 'done'
  const progressSteps  = steps.filter(s => s !== 'type' && s !== 'done');
  const progressIdx    = progressSteps.indexOf(currentStep); // -1 if on type or done
  const showProgress   = progressIdx >= 0;

  // --- Helpers ---------------------------------------------------------------

  function update(field, value) {
    setFormData(d => ({ ...d, [field]: value }));
  }

  function toggleArray(field, value) {
    setFormData(d => {
      const arr = d[field];
      return { ...d, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  function goNext() {
    setError('');
    const msg = validate(currentStep);
    if (msg) { setError(msg); return; }
    setSlideDir('forward');
    setStepIdx(i => i + 1);
  }

  function goBack() {
    setError('');
    setSlideDir('back');
    setStepIdx(i => i - 1);
  }

  // Auto-advance when user selects New or Transfer on the type step
  function selectType(isTransfer) {
    update('isTransfer', isTransfer);
    setSlideDir('forward');
    setStepIdx(1);
  }

  // --- Validation per step ---------------------------------------------------
  function validate(step) {
    switch (step) {
      case 'program':  return !formData.major_id            ? 'Please select your degree program.'         : '';
      case 'load':     return !formData.employment          ? 'Please indicate your employment status.'    : '';
      case 'delivery': return !formData.delivery_mode       ? 'Please select a delivery preference.'       : '';
      case 'term':     return !formData.starting_term       ? 'Please select your starting semester.'      : '';
      default:         return '';
    }
  }

  // --- Save profile then navigate to done step --------------------------------
  async function saveAndShowWelcome() {
    setError('');
    setSaving(true);
    try {
      await updateStudentProfile(user.student_id, {
        major_id:            formData.major_id,
        starting_term:       formData.starting_term,
        courses_per_semester: formData.courses_per_semester,
        delivery_mode:       formData.delivery_mode,
        preferred_days:      formData.preferred_days,
        preferred_times:     formData.preferred_times,
        skipped_terms:       formData.skipped_terms,
        career_goal:         null,
        transfer_goals:      formData.isTransfer ? 'Transfer student — transcript submitted for review.' : null,
      });
      setSlideDir('forward');
      setStepIdx(steps.length - 1); // jump to 'done'
    } catch (err) {
      setError('Failed to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // --- Generate plan from done screen ----------------------------------------
  async function handleGeneratePlan() {
    setGenerating(true);
    setError('');
    try {
      await generatePlan(user.student_id);
      onComplete();
    } catch {
      setError('Failed to generate your plan. Please try again.');
      setGenerating(false);
    }
  }

  // --- File upload handlers --------------------------------------------------
  function handleFileSelect(file) {
    if (file) setTranscriptFile(file);
  }

  // --- Render each step's content --------------------------------------------
  function renderStepContent() {
    switch (currentStep) {

      // ── Step: New or Transfer? ────────────────────────────────────────────
      case 'type': return (
        <div className="ob-step">
          <p className="ob-step-eyebrow">Welcome, {user.first_name}!</p>
          <h3 className="ob-step-title">Let's set up your profile</h3>
          <p className="ob-step-sub">Tell us about your student status so we can personalise your experience.</p>
          <div className="ob-type-cards">
            <button className="ob-type-card" onClick={() => selectType(false)}>
              <div className="ob-type-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <span className="ob-type-label">New Student</span>
              <span className="ob-type-desc">I'm enrolling for the first time and have no prior college credits.</span>
            </button>
            <button className="ob-type-card" onClick={() => selectType(true)}>
              <div className="ob-type-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                </svg>
              </div>
              <span className="ob-type-label">Transfer Student</span>
              <span className="ob-type-desc">I'm transferring from another institution and have completed courses already.</span>
            </button>
          </div>
        </div>
      );

      // ── Step: Transcript Upload (transfer only) ───────────────────────────
      case 'transcript': return (
        <div className="ob-step">
          <h3 className="ob-step-title">Upload Your Transcript</h3>
          <p className="ob-step-sub">
            Our AI system will automatically identify completed courses.
            Course substitutions will be reviewed and confirmed by your advisor.
          </p>

          {!transcriptFile ? (
            <div
              className={`ob-upload-zone${dragOver ? ' drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2e5496" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
              </svg>
              <p className="ob-upload-label">Drag &amp; drop your transcript here</p>
              <p className="ob-upload-hint">or <span>browse to select a file</span></p>
              <p className="ob-upload-formats">Accepted: PDF, DOC, DOCX, TXT</p>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
                onChange={e => handleFileSelect(e.target.files[0])} />
            </div>
          ) : (
            <div className="ob-upload-success">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <div>
                <p className="ob-upload-filename">{transcriptFile.name}</p>
                <p className="ob-upload-received">Received. Our team will process it and update your profile.</p>
              </div>
              <button type="button" className="ob-upload-change" onClick={() => setTranscriptFile(null)}>Change</button>
            </div>
          )}

          <button type="button" className="ob-skip-link" onClick={goNext}>
            Skip for now — I'll add courses manually later
          </button>
        </div>
      );

      // ── Step: Academic Program ─────────────────────────────────────────────
      case 'program': return (
        <div className="ob-step">
          <h3 className="ob-step-title">What are you studying?</h3>
          <p className="ob-step-sub">Select the degree program you plan to enroll in.</p>
          <select
            className="ob-select"
            value={formData.major_id ?? ''}
            onChange={e => update('major_id', parseInt(e.target.value))}
          >
            <option value="" disabled>— Select a program —</option>
            {majors.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      );

      // ── Step: Course Load + Employment ────────────────────────────────────
      case 'load': return (
        <div className="ob-step">
          <h3 className="ob-step-title">How much can you take on?</h3>
          <p className="ob-step-sub">Choose your preferred course load per semester.</p>

          <div className="ob-load-cards">
            {[2, 3, 4].map(n => (
              <button
                key={n}
                className={`ob-load-card${formData.courses_per_semester === n ? ' selected' : ''}`}
                onClick={() => update('courses_per_semester', n)}
              >
                <span className="ob-load-num">{n}</span>
                <span className="ob-load-label">courses</span>
                <span className="ob-load-hint">
                  {n === 2 ? 'Light load' : n === 3 ? 'Recommended' : 'Full load'}
                </span>
              </button>
            ))}
          </div>

          <p className="ob-step-sub" style={{ marginTop: '28px' }}>Are you currently employed?</p>
          <div className="ob-pills">
            {[
              { key: 'none',      label: 'Not Working'   },
              { key: 'part-time', label: 'Part-Time'     },
              { key: 'full-time', label: 'Full-Time'     },
            ].map(opt => (
              <button
                key={opt.key}
                className={`ob-pill${formData.employment === opt.key ? ' selected' : ''}`}
                onClick={() => update('employment', opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {formData.employment === 'full-time' && formData.courses_per_semester === 4 && (
            <div className="ob-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Taking 4 courses while working full-time is demanding. Make sure you have enough time to commit.
            </div>
          )}
        </div>
      );

      // ── Step: Delivery Mode ───────────────────────────────────────────────
      case 'delivery': return (
        <div className="ob-step">
          <h3 className="ob-step-title">How do you prefer to learn?</h3>
          <p className="ob-step-sub">Select your preferred course delivery format.</p>
          <div className="ob-delivery-grid">
            {DELIVERY_MODES.map(m => (
              <button
                key={m.key}
                className={`ob-delivery-card${formData.delivery_mode === m.key ? ' selected' : ''}`}
                onClick={() => update('delivery_mode', m.key)}
              >
                <span className="ob-delivery-label">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      );

      // ── Step: Preferred Days ──────────────────────────────────────────────
      case 'days': return (
        <div className="ob-step">
          <h3 className="ob-step-title">Which days work for you?</h3>
          <p className="ob-step-sub">Select all that apply. You can skip this if you have no preference.</p>
          <div className="ob-pills ob-pills-lg">
            {DAYS.map(d => (
              <button
                key={d}
                className={`ob-pill${formData.preferred_days.includes(d) ? ' selected' : ''}`}
                onClick={() => toggleArray('preferred_days', d)}
              >
                {d}
              </button>
            ))}
          </div>
          {formData.preferred_days.length === 0 && (
            <p className="ob-no-pref-note">No preference selected — any day works.</p>
          )}
        </div>
      );

      // ── Step: Preferred Times ─────────────────────────────────────────────
      case 'times': return (
        <div className="ob-step">
          <h3 className="ob-step-title">What time of day do you prefer?</h3>
          <p className="ob-step-sub">Select all that apply. You can skip this if you have no preference.</p>
          <div className="ob-time-cards">
            {TIMES.map(t => (
              <button
                key={t.key}
                className={`ob-time-card${formData.preferred_times.includes(t.key) ? ' selected' : ''}`}
                onClick={() => toggleArray('preferred_times', t.key)}
              >
                <span className="ob-time-label">{t.label}</span>
                <span className="ob-time-sub">{t.sub}</span>
              </button>
            ))}
          </div>
          {formData.preferred_times.length === 0 && (
            <p className="ob-no-pref-note">No preference selected — any time works.</p>
          )}
        </div>
      );

      // ── Step: Starting Term ───────────────────────────────────────────────
      case 'term': return (
        <div className="ob-step">
          <h3 className="ob-step-title">When are you planning to start?</h3>
          <p className="ob-step-sub">Select the semester you plan to begin your studies.</p>
          <select
            className="ob-select"
            value={formData.starting_term ?? ''}
            onChange={e => update('starting_term', e.target.value)}
          >
            <option value="" disabled>— Select a semester —</option>
            {UPCOMING_TERMS.map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
        </div>
      );

      // ── Step: Terms to Skip ───────────────────────────────────────────────
      case 'skip': return (
        <div className="ob-step">
          <h3 className="ob-step-title">Any terms you'd like to skip?</h3>
          <p className="ob-step-sub">
            Your plan will avoid scheduling courses in these terms. You can change this later.
          </p>
          <div className="ob-pills ob-pills-lg">
            {['Summer', 'Spring', 'Fall'].map(t => (
              <button
                key={t}
                className={`ob-pill${formData.skipped_terms.includes(t) ? ' selected' : ''}`}
                onClick={() => toggleArray('skipped_terms', t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="ob-no-pref-note" style={{ marginTop: '12px' }}>
            Tip: Many students skip Summer to take a well-earned break.
          </p>
        </div>
      );

      // ── Step: Done / Welcome ──────────────────────────────────────────────
      case 'done': {
        const major = majors.find(m => m.id === formData.major_id);
        const term  = UPCOMING_TERMS.find(t => t.code === formData.starting_term);
        return (
          <div className="ob-done">
            <div className="ob-done-check">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 className="ob-done-title">You're all set, {user.first_name}!</h3>
            <p className="ob-done-sub">Your profile has been created. Here's a summary:</p>
            <ul className="ob-done-summary">
              {major   && <li><strong>Program:</strong> {major.name}</li>}
              {term    && <li><strong>Starting:</strong> {term.label}</li>}
              <li><strong>Course load:</strong> {formData.courses_per_semester} courses per semester</li>
              {formData.delivery_mode && <li><strong>Delivery:</strong> {formData.delivery_mode}</li>}
              {formData.preferred_days.length  > 0 && <li><strong>Preferred days:</strong> {formData.preferred_days.join(', ')}</li>}
              {formData.preferred_times.length > 0 && <li><strong>Preferred times:</strong> {formData.preferred_times.join(', ')}</li>}
              {formData.skipped_terms.length   > 0 && <li><strong>Skipping:</strong> {formData.skipped_terms.join(', ')}</li>}
            </ul>
            {error && <p className="auth-error">{error}</p>}
            <button className="ob-generate-btn" onClick={handleGeneratePlan} disabled={generating}>
              {generating ? <><span className="spinner" /> Generating your plan…</> : 'Generate My Plan →'}
            </button>
          </div>
        );
      }

      default: return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Determine whether to show nav buttons
  const showNav     = currentStep !== 'type' && currentStep !== 'done';
  const isLastReal  = currentStep === 'skip';  // last step before done
  const isFirst     = stepIdx === 1;           // first step after type

  return (
    <div className="onboard-root">

      {/* Progress bar — only shown between type and done */}
      {showProgress && (
        <div className="ob-progress">
          <div className="ob-progress-bar-wrap">
            <div
              className="ob-progress-bar-fill"
              style={{ width: `${((progressIdx + 1) / progressSteps.length) * 100}%` }}
            />
          </div>
          <span className="ob-progress-label">
            Step {progressIdx + 1} of {progressSteps.length}
          </span>
        </div>
      )}

      {/* Sliding step card */}
      <div className="onboard-card-wrap">
        <div key={`${currentStep}-${stepIdx}`} className={`onboard-card slide-${slideDir}`}>
          {renderStepContent()}
        </div>
      </div>

      {/* Navigation buttons */}
      {showNav && (
        <div className="ob-nav">
          <button
            className="ob-nav-back"
            onClick={goBack}
            disabled={isFirst}
            style={{ visibility: isFirst ? 'hidden' : 'visible' }}
          >
            ← Back
          </button>

          {error && <p className="auth-error ob-nav-error">{error}</p>}

          {isLastReal ? (
            <button className="ob-nav-next" onClick={saveAndShowWelcome} disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : 'Finish Setup →'}
            </button>
          ) : (
            <button className="ob-nav-next" onClick={goNext}>
              Continue →
            </button>
          )}
        </div>
      )}

    </div>
  );
}
