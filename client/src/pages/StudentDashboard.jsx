// =============================================================================
// StudentDashboard.jsx
// The student's home screen after login / onboarding.
// Shows their generated course plan and lets them regenerate it.
// =============================================================================

import { useState, useEffect } from 'react';
import { getPlan, generatePlan } from '../api';

// Mirror of the helper in real-data-test.js / utils.js
function termCodeToLabel(termCode) {
  const code = String(termCode);
  const yy   = parseInt(code.slice(0, 2), 10);
  const t    = parseInt(code.slice(-1),   10);
  const names = { 1: 'Fall', 2: 'Spring', 3: 'Summer' };
  const year  = t === 1 ? 2000 + yy : 2000 + yy + 1;
  return `${names[t] ?? '???'} ${year}`;
}

function termClass(termCode) {
  const t = String(termCode).slice(-1);
  return t === '1' ? 'term-fall' : t === '2' ? 'term-spring' : 'term-summer';
}

export default function StudentDashboard({ user, onSignOut }) {
  const [plan,       setPlan]       = useState(null);   // array of semester objects, or null
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => { fetchPlan(); }, [user.id]);

  async function fetchPlan() {
    setLoading(true);
    setError('');
    try {
      const data = await getPlan(user.id);
      setPlan(data ? data.plan : null);
    } catch {
      setError('Could not load your plan. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    setGenerating(true);
    setError('');
    try {
      const data = await generatePlan(user.id);
      setPlan(data.plan);
    } catch {
      setError('Could not regenerate your plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const totalCourses = plan ? plan.reduce((sum, s) => sum + s.courses.length, 0) : 0;

  return (
    <div className="dash-root">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-header-brand">
          <div className="dash-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <span className="dash-header-name">Expert Advisor</span>
        </div>
        <div className="dash-header-right">
          <span className="dash-welcome">Welcome, {user.first_name}</span>
          <button className="dash-signout-btn" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="dash-content">

        {/* Title row */}
        <div className="dash-plan-header">
          <div>
            <h2 className="dash-plan-title">Your Course Plan</h2>
            {!loading && plan && (
              <p className="dash-plan-sub">
                {plan.length} semester{plan.length !== 1 ? 's' : ''} · {totalCourses} courses scheduled
              </p>
            )}
          </div>
          {!loading && plan && (
            <button className="btn-regenerate" onClick={handleRegenerate} disabled={generating}>
              {generating ? <><span className="spinner" /> Updating…</> : '↻ Regenerate'}
            </button>
          )}
        </div>

        {/* Error */}
        {error && <p className="error-msg">{error}</p>}

        {/* Loading */}
        {loading && (
          <p className="loading-msg">
            <span className="spinner spinner-dark" /> Loading your plan…
          </p>
        )}

        {/* No plan yet */}
        {!loading && !plan && (
          <div className="dash-no-plan">
            <p>No plan found yet. Generate your course schedule to get started.</p>
            <button className="btn-generate" onClick={handleRegenerate} disabled={generating}>
              {generating ? <><span className="spinner" /> Generating…</> : 'Generate My Plan'}
            </button>
          </div>
        )}

        {/* All done */}
        {!loading && plan && plan.length === 0 && (
          <p className="empty-message">
            You have completed all required courses — congratulations!
          </p>
        )}

        {/* Semester grid */}
        {!loading && plan && plan.length > 0 && (
          <div className="semester-grid">
            {plan.map(sem => (
              <div key={sem.semester} className="semester-card">
                <div className="semester-header">
                  <span className="semester-number">Semester {sem.semester}</span>
                  <span className={`semester-term ${termClass(sem.term_code)}`}>
                    {termCodeToLabel(sem.term_code)}
                  </span>
                </div>
                <ul className="course-list">
                  {sem.courses.map(c => (
                    <li key={c.course_code} className="course-item">
                      <span className="course-code">{c.course_code}</span>
                      <span className="course-name">{c.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
