// =============================================================================
// StudentOnboarding.jsx
// Multi-step profile setup wizard aligned with the PostgreSQL schema.
// =============================================================================

import { useState, useEffect } from 'react';
import { getMajors, updateStudentProfile, generatePlan } from '../api';

const UPCOMING_TERMS = [
  { code: '252', label: 'Spring 2026' },
  { code: '253', label: 'Summer 2026' },
  { code: '261', label: 'Fall 2026'   },
  { code: '262', label: 'Spring 2027' },
  { code: '263', label: 'Summer 2027' },
  { code: '271', label: 'Fall 2027'   },
  { code: '272', label: 'Spring 2028' },
];

const STEPS = ['type', 'program', 'load', 'term'];

export default function StudentOnboarding({ user, onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [majors, setMajors] = useState([]);
  const [slideDir, setSlideDir] = useState('forward');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state precisely mapped to PostgreSQL student_profiles columns
  const [form, setForm] = useState({
    is_transfer: false,
    degree_code: 'BS-SE',
    target_credits: 3,     // Used to be load/courses_per_semester
    starting_term: '261'
  });

  useEffect(() => {
    getMajors().then(setMajors).catch(console.error);
  }, []);

  const currentStep = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  function goNext() {
    if (!isLast) {
      setSlideDir('forward');
      setStepIdx(i => i + 1);
    }
  }

  function goBack() {
    if (!isFirst) {
      setSlideDir('backward');
      setStepIdx(i => i - 1);
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError('');
    try {
      // 1. Update the profile with all schema fields
      await updateStudentProfile(user.id, form);
      // 2. Generate their initial plan based on these preferences
      await generatePlan(user.id);
      // 3. Move them to the dashboard
      if (onComplete) onComplete();
    } catch (err) {
      setError('Failed to save profile. Please try again.');
      setSaving(false);
    }
  }

  function renderStepContent() {
    switch (currentStep) {
      case 'type':
        return (
          <div className="ob-step-content">
            <h3>Welcome! Let's get your profile set up.</h3>
            <p>Are you a new student or transferring credits from another institution?</p>
            <div className="ob-options">
              <button 
                className={`ob-option-btn ${!form.is_transfer ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_transfer: false }))}
              >
                New Student
              </button>
              <button 
                className={`ob-option-btn ${form.is_transfer ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_transfer: true }))}
              >
                Transfer Student
              </button>
            </div>
          </div>
        );

      case 'program':
        return (
          <div className="ob-step-content">
            <h3>What is your intended major?</h3>
            <select 
              value={form.degree_code || ''} 
              onChange={e => setForm(f => ({ ...f, degree_code: e.target.value }))}
            >
              {majors.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        );

      case 'load':
        return (
          <div className="ob-step-content">
            <h3>How many courses do you plan to take per semester?</h3>
            <p>Full-time is typically 4-5 courses (12-15 credits).</p>
            {/* THE NAN FIX: Safely falls back to 3 if the value is weird */}
            <select 
              value={Number.isNaN(form.target_credits) || !form.target_credits ? 3 : form.target_credits} 
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                // Ensure NaN is completely avoided in the state update
                setForm(f => ({ ...f, target_credits: Number.isNaN(val) ? 3 : val }));
              }}
            >
              {[1, 2, 3, 4, 5, 6].map(num => (
                <option key={num} value={num}>{num} {num === 1 ? 'Course' : 'Courses'}</option>
              ))}
            </select>
          </div>
        );

      case 'term':
        return (
          <div className="ob-step-content">
            <h3>When are you starting?</h3>
            <select 
              value={form.starting_term || '261'} 
              onChange={e => setForm(f => ({ ...f, starting_term: e.target.value }))}
            >
              {UPCOMING_TERMS.map(term => (
                <option key={term.code} value={term.code}>{term.label}</option>
              ))}
            </select>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="onboard-root">
      <div className="ob-progress">
        <div className="ob-progress-bar-wrap">
          <div 
            className="ob-progress-bar-fill" 
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }} 
          />
        </div>
        <span className="ob-progress-label">Step {stepIdx + 1} of {STEPS.length}</span>
      </div>

      <div className="onboard-card-wrap">
        <div key={currentStep} className={`onboard-card slide-${slideDir}`}>
          {renderStepContent()}
        </div>
      </div>

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
            {saving ? 'Saving...' : 'Finish Setup →'}
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