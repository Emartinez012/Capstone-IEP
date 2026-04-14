// =============================================================================
// AdvisorView.jsx
// The advisor's dashboard: a table of all students with a "Generate Plan"
// button on each row. Clicking shows that student's plan below the table.
// =============================================================================

import { useEffect, useState } from 'react';
import { getStudents, generatePlan } from '../api';
import PlanDisplay from '../components/PlanDisplay';
import Toast from '../components/Toast';

export default function AdvisorView() {
  const [students,     setStudents]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [active,       setActive]       = useState(null);   // { student, plan }
  const [generatingId, setGeneratingId] = useState(null);   // id of student being generated
  const [toast,        setToast]        = useState({ message: '', type: 'success' });

  useEffect(() => {
    getStudents()
      .then(data => setStudents(data))
      .catch(() => setError('Could not load students. Is the backend server running?'))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate(student) {
    setActive(null);
    setGeneratingId(student.id);
    setError(null);
    try {
      const result = await generatePlan(student.id);
      setActive({ student, plan: result.plan });
      // Mark this student as having a plan in local state
      setStudents(prev =>
        prev.map(s => s.id === student.id ? { ...s, has_plan: 1 } : s)
      );
      setToast({ message: `Successfully generated plan for ${student.first_name}.`, type: 'success' });
    } catch {
      setToast({ message: 'Failed to generate plan. Please try again.', type: 'error' });
    } finally {
      setGeneratingId(null);
    }
  }

  const plansCount = students.filter(s => s.has_plan).length;

  return (
    <div className="page">
      <h2>Advisor Dashboard</h2>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p className="loading-msg">Loading students...</p>
      ) : (
        <p className="record-count">
          {students.length} students &nbsp;·&nbsp; {plansCount} plan{plansCount !== 1 ? 's' : ''} generated
        </p>
      )}

      {!loading && (
        <div className="table-wrapper">
          <table className="student-table">
            <thead>
              <tr>
                <th>
                  <div className="th-content">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Name
                  </div>
                </th>
                <th>
                  <div className="th-content">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    Major
                  </div>
                </th>
                <th className="cell-center">
                   <div className="th-content center-content">
                     <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                     Courses / Semester
                   </div>
                </th>
                <th className="cell-center">
                   <div className="th-content center-content">
                     <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                     Starting Term
                   </div>
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr
                  key={s.id}
                  className={active?.student.id === s.id ? 'row-active' : ''}
                >
                  <td>{s.last_name}, {s.first_name}</td>
                  <td><span className="major-badge">{s.major_name}</span></td>
                  <td className="cell-center">{s.courses_per_semester}</td>
                  <td className="cell-center">{s.starting_term}</td>
                  <td>
                    <button
                      className={s.has_plan ? 'btn-regenerate' : 'btn-generate'}
                      onClick={() => handleGenerate(s)}
                      disabled={generatingId !== null}
                    >
                      {generatingId === s.id ? (
                        <><span className="spinner" />Generating...</>
                      ) : s.has_plan ? (
                        <><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Regenerate Plan</>
                      ) : (
                        <><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg> Generate Plan</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div className="plan-section">
          <PlanDisplay
            plan={active.plan}
            studentName={`${active.student.first_name} ${active.student.last_name}`}
          />
        </div>
      )}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, message: '' })} />
    </div>
  );
}
