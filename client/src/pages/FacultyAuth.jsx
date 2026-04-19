// =============================================================================
// FacultyAuth.jsx
// Login page shared by Advisor and Faculty (Chairperson) roles.
// On success, calls onLogin({ user, role }) so App.jsx can route accordingly.
// =============================================================================

import { useState } from 'react';
import { login } from '../api';

export default function FacultyAuth({ onLogin, onBack }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }

    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role !== 'Advisor' && user.role !== 'Faculty') {
        setError('This portal is for Advisors and Faculty only. Students please use the Student portal.');
        return;
      }
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-root">

      {/* Branding */}
      <div className="auth-brand">
        <div className="auth-brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <span className="auth-brand-name">Expert Advisor</span>
      </div>

      {/* Login card */}
      <div className="auth-form-card">
        <button className="auth-form-back" onClick={onBack}>← Back to Home</button>

        <h2 className="auth-heading">Staff Sign In</h2>
        <p className="auth-subheading">
          Advisor &amp; Faculty Portal &nbsp;·&nbsp; Miami-Dade College
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="fa-email">MDC Email</label>
            <input
              id="fa-email"
              type="email"
              placeholder="you@mdc.edu"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="fa-pw">Password</label>
            <div className="auth-password-wrap">
              <input
                id="fa-pw"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" className="auth-eye-btn" onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw
                  ? <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading
              ? <><span className="spinner" /> Signing in…</>
              : 'Sign In to Staff Portal'
            }
          </button>
        </form>

        <div className="fa-demo-hint">
          <p>Demo accounts:</p>
          <p><strong>advisor1@mdc.edu</strong> — Advisor dashboard</p>
          <p><strong>chair1@mdc.edu</strong> — Chairperson command center</p>
          <p><em>password: password123</em></p>
        </div>
      </div>
    </div>
  );
}
