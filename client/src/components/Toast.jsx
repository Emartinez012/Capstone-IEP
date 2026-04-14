// =============================================================================
// Toast.jsx
// A lightweight component for non-blocking success/error notifications.
// =============================================================================

import { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-content">
        {type === 'success' ? (
          <svg className="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span>{message}</span>
      </div>
      <button onClick={onClose} className="toast-close" aria-label="Close">
        &times;
      </button>
    </div>
  );
}
