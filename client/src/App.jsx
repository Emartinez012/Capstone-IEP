// =============================================================================
// App.jsx
// Root component. Manages top-level navigation between all views.
//
// View flow:
//   landing → student-auth → student-onboarding → student-dashboard
//                          ↘ (returning login)  → student-dashboard
//             faculty-auth → advisor-dashboard   (Advisor role)
//             faculty-auth → chairperson         (Faculty role)
// =============================================================================

import { useState } from 'react';
import LandingPage           from './pages/LandingPage';
import FacultyAuth           from './pages/FacultyAuth';
import AdvisorView           from './pages/AdvisorView';
import AdvisorDashboard      from './pages/AdvisorDashboard';
import ChairpersonDashboard  from './pages/ChairpersonDashboard';
import StudentAuth           from './pages/StudentAuth';
import StudentOnboarding     from './pages/StudentOnboarding';
import StudentDashboard      from './pages/StudentDashboard';

export default function App() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);

  function handleLandingSelect(role) {
    if (role === 'student')       setView('student-auth');
    else if (role === 'advisor')  setView('faculty-auth');
    else if (role === 'faculty')  setView('faculty-auth');
    else                          setView(role);
  }

  // ── Full-screen views (no shared header) ──────────────────────────────────

  if (view === 'landing') {
    return <LandingPage onSelect={handleLandingSelect} />;
  }

  if (view === 'student-auth') {
    return (
      <StudentAuth
        onLogin={(u) => {
          setUser(u);
          if (u.role === 'Student' && !u.degree_code) {
            setView('student-onboarding');
          } else {
            setView('student-dashboard');
          }
        }}
        onSignup={(u) => { setUser(u); setView('student-onboarding'); }}
        onBack={()    => setView('landing')}
      />
    );
  }

  if (view === 'student-onboarding') {
    if (!user) { setView('student-auth'); return null; }
    return (
      <StudentOnboarding
        user={user}
        onComplete={() => setView('student-dashboard')}
      />
    );
  }

  if (view === 'student-dashboard') {
    return (
      <StudentDashboard
        user={user}
        onSignOut={() => { setUser(null); setView('landing'); }}
      />
    );
  }

  // ── Faculty / Advisor Auth ────────────────────────────────────────────────

  if (view === 'faculty-auth') {
    return (
      <FacultyAuth
        onLogin={(u) => {
          setUser(u);
          if (u.role === 'Faculty')  setView('chairperson');
          else                       setView('advisor-dashboard');
        }}
        onBack={() => setView('landing')}
      />
    );
  }

  // ── Authenticated Staff Dashboards ────────────────────────────────────────

  if (view === 'chairperson') {
    return (
      <ChairpersonDashboard
        user={user}
        onSignOut={() => { setUser(null); setView('landing'); }}
      />
    );
  }

  if (view === 'advisor-dashboard') {
    return (
      <AdvisorDashboard
        user={user}
        onSignOut={() => { setUser(null); setView('landing'); }}
      />
    );
  }

  // ── Legacy unauthenticated advisor view (kept for backward compat) ────────

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <button className="header-back-btn" onClick={() => setView('landing')}>
            ← Home
          </button>
          <div className="header-title">
            <h1>Expert Advisor</h1>
            <span className="header-subtitle">Miami-Dade College — Student Course Planner</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {view === 'advisor' && <AdvisorView />}
      </main>
    </>
  );
}
