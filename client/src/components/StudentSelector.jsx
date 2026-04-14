// =============================================================================
// StudentSelector.jsx
// A dropdown that loads all students and calls onSelect(studentId) when
// the user makes a choice.
// =============================================================================

import { useEffect, useState } from 'react';
import { getStudents } from '../api';

export default function StudentSelector({ onSelect }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    getStudents()
      .then(data => setStudents(data))
      .catch(() => setError('Could not load students. Is the backend server running?'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="loading-msg">Loading students...</p>;
  if (error)   return <p className="error-msg">{error}</p>;

  return (
    <select
      className="student-selector"
      defaultValue=""
      onChange={e => {
        if (e.target.value) onSelect(Number(e.target.value));
      }}
    >
      <option value="" disabled>Select your name...</option>
      {students.map(s => (
        <option key={s.id} value={s.id}>
          {s.last_name}, {s.first_name} — {s.major_name}
        </option>
      ))}
    </select>
  );
}
