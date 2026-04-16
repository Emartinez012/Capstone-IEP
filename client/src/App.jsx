// =============================================================================
// App.jsx
// Root component. Manages top-level navigation between all views.
//
// View flow:
//   landing → student-auth → student-onboarding → student-dashboard
//                          ↘ (returning login)  → student-dashboard
//             advisor      → AdvisorView  (standard app header)
//             faculty      → Coming Soon  (standard app header)
// =============================================================================

import { useState } from 'react';
import LandingPage       from './pages/LandingPage';
import AdvisorView       from './pages/AdvisorView';
import StudentAuth       from './pages/StudentAuth';
import StudentOnboarding from './pages/StudentOnboarding';
import StudentDashboard  from './pages/StudentDashboard';

export default function App() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);

  // Landing page → student role goes to auth, not old StudentView
  function handleLandingSelect(role) {
    setView(role === 'student' ? 'student-auth' : role);
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
          // Route students who haven't completed onboarding back to it
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
    // If user session was lost (e.g. hot-reload reset state), bounce back to auth
    if (!user) {
      setView('student-auth');
      return null;
    }
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

  // ── Advisor / Faculty views (shared app header) ───────────────────────────

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
        {view === 'faculty' && (
          <div className="page">
            <h2>Faculty Staff Portal</h2>
            <p>This section is currently under development. Please check back soon.</p>
          </div>
        )}
      </main>
    </>
  );
}
