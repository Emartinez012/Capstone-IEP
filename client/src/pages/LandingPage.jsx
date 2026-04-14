// =============================================================================
// LandingPage.jsx
// The first page users see. Lets them choose their role — Student, Advisor,
// or Faculty — before proceeding to their login or dashboard.
// =============================================================================

export default function LandingPage({ onSelect }) {
  return (
    <div className="landing-root">

      {/* ---- Branding / Hero -------------------------------------------- */}
      <div className="landing-hero">
        <div className="landing-shield">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 className="landing-title">Expert Advisor</h1>
        <p className="landing-subtitle">Miami-Dade College &nbsp;·&nbsp; Academic Planning System</p>
      </div>

      {/* ---- Role Selection --------------------------------------------- */}
      <div className="landing-content">
        <p className="landing-prompt">Select how you will be signing in today</p>

        <div className="role-grid">

          {/* Student */}
          <button className="role-card" onClick={() => onSelect('student')}>
            <div className="role-icon-wrap role-icon-student">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <span className="role-label">Student</span>
            <span className="role-desc">View your personalized course plan and academic schedule</span>
            <span className="role-action">Sign In or Create Account →</span>
          </button>

          {/* Advisor */}
          <button className="role-card" onClick={() => onSelect('advisor')}>
            <div className="role-icon-wrap role-icon-advisor">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <span className="role-label">Advisor</span>
            <span className="role-desc">Manage students and generate personalized academic plans</span>
            <span className="role-action">Sign In →</span>
          </button>

          {/* Faculty — Coming Soon */}
          <div className="role-card role-card-disabled">
            <span className="role-coming-soon">Coming Soon</span>
            <div className="role-icon-wrap role-icon-faculty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="role-label">Faculty Staff</span>
            <span className="role-desc">Access program analytics and institutional reporting</span>
          </div>

        </div>
      </div>

      {/* ---- Footer ----------------------------------------------------- */}
      <footer className="landing-footer">
        © {new Date().getFullYear()} Miami-Dade College &nbsp;·&nbsp; Expert Advisor System
      </footer>

    </div>
  );
}
