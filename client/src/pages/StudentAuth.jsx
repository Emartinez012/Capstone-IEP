// =============================================================================
// StudentAuth.jsx
// The student entry point. Shows a choice between Log In and Create Account,
// then renders the appropriate form with a slide animation between modes.
// =============================================================================

import { useState } from 'react';
import { login, signup } from '../api';

export default function StudentAuth({ onLogin, onSignup, onBack }) {
  const [mode,         setMode]         = useState('choose'); // 'choose' | 'login' | 'signup'
  const [slideDir,     setSlideDir]     = useState('forward');
  const [form,         setForm]         = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // Utility: field change handler
  function set(field) {
    return e => { setForm(f => ({ ...f, [field]: e.target.value })); setError(''); };
  }

  // Navigate between modes with a slide animation
  function goTo(newMode, dir = 'forward') {
    setSlideDir(dir);
    setError('');
    setMode(newMode);
  }

  // --- Login submit ---
  async function handleLogin(e) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const result = await login(form.email, form.password);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Signup submit ---
  async function handleSignup(e) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.confirmPassword) {
      setError('Please fill in all fields.'); return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.'); return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }
    setLoading(true);
    try {
      const result = await signup(form.firstName, form.lastName, form.email, form.password);
      onSignup(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Shared eye-icon SVGs ---
  const EyeOpen = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
  const EyeOff = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  return (
    <div className="auth-root">

      {/* Branding */}
      <div className="auth-brand">
        <div className="auth-brand-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <span className="auth-brand-name">Expert Advisor</span>
      </div>

      {/* ---- CHOOSE MODE -------------------------------------------------- */}
      {mode === 'choose' && (
        <div key="choose" className={`auth-panel slide-${slideDir}`}>
          <h2 className="auth-heading">Student Portal</h2>
          <p className="auth-subheading">Sign in or create a new account to get started</p>

          <div className="auth-choose-cards">

            <button className="auth-choose-card" onClick={() => goTo('login')}>
              <div className="auth-choose-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
              </div>
              <span className="auth-choose-title">Log In</span>
              <span className="auth-choose-desc">Already have an account? Sign in with your email.</span>
              <span className="auth-choose-cta">Sign In →</span>
            </button>

            <button className="auth-choose-card" onClick={() => goTo('signup')}>
              <div className="auth-choose-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
              </div>
              <span className="auth-choose-title">Create Account</span>
              <span className="auth-choose-desc">New here? Set up your profile and get your course plan.</span>
              <span className="auth-choose-cta">Get Started →</span>
            </button>

          </div>

          <button className="auth-back-link" onClick={onBack}>← Back to Home</button>
        </div>
      )}

      {/* ---- LOGIN FORM --------------------------------------------------- */}
      {mode === 'login' && (
        <form key="login" className={`auth-form-card slide-${slideDir}`} onSubmit={handleLogin} noValidate>
          <button type="button" className="auth-form-back" onClick={() => goTo('choose', 'back')}>← Back</button>

          <h2 className="auth-heading">Welcome Back</h2>
          <p className="auth-subheading">Sign in to your Expert Advisor account</p>

          {error && <p className="auth-error">{error}</p>}

          <div className="auth-field">
            <label>Email Address</label>
            <input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
              />
              <button type="button" className="auth-eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                {showPassword ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? <><span className="spinner" /> Signing in…</> : 'Log In'}
          </button>

          <p className="auth-switch">
            Don't have an account?&nbsp;
            <button type="button" onClick={() => { setForm(f => ({ ...f, password: '' })); goTo('signup'); }}>
              Create one →
            </button>
          </p>
        </form>
      )}

      {/* ---- SIGNUP FORM -------------------------------------------------- */}
      {mode === 'signup' && (
        <form key="signup" className={`auth-form-card slide-${slideDir}`} onSubmit={handleSignup} noValidate>
          <button type="button" className="auth-form-back" onClick={() => goTo('choose', 'back')}>← Back</button>

          <h2 className="auth-heading">Create Your Account</h2>
          <p className="auth-subheading">Use your personal or institution email&nbsp;(@mdc.edu)</p>

          {error && <p className="auth-error">{error}</p>}

          <div className="auth-field-row">
            <div className="auth-field">
              <label>First Name</label>
              <input type="text" placeholder="Maria" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
            </div>
            <div className="auth-field">
              <label>Last Name</label>
              <input type="text" placeholder="Garcia" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
            </div>
          </div>

          <div className="auth-field">
            <label>Email Address</label>
            <input type="email" placeholder="you@example.com or you@mdc.edu" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
              <button type="button" className="auth-eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                {showPassword ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Re-enter your password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? <><span className="spinner" /> Creating account…</> : 'Create Account'}
          </button>

          <p className="auth-switch">
            Already have an account?&nbsp;
            <button type="button" onClick={() => { setForm(f => ({ ...f, password: '', confirmPassword: '' })); goTo('login'); }}>
              Log in →
            </button>
          </p>
        </form>
      )}

    </div>
  );
}
