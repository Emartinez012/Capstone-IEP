// =============================================================================
// StudentView.jsx
// A student selects their name from a dropdown and sees their course plan.
// If no plan exists yet, one is generated automatically.
// =============================================================================

import { useState } from 'react';
import { getStudentById, getPlan, generatePlan } from '../api';
import StudentSelector from '../components/StudentSelector';
import PlanDisplay from '../components/PlanDisplay';
import Toast from '../components/Toast';

export default function StudentView() {
  const [student, setStudent] = useState(null);
  const [plan,    setPlan]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [toast,   setToast]   = useState({ message: '', type: 'success' });

  async function handleSelect(studentId) {
    setLoading(true);
    setPlan(null);
    setStudent(null);
    setError(null);

    try {
      // Fetch the student's name and their existing plan at the same time.
      const [studentData, existingPlan] = await Promise.all([
        getStudentById(studentId),
        getPlan(studentId)
      ]);

      setStudent(studentData);

      if (existingPlan) {
        // A plan already exists — use it.
        setPlan(existingPlan.plan);
        setToast({ message: 'Plan loaded successfully.', type: 'success' });
      } else {
        // No plan yet — generate one now.
        const generated = await generatePlan(studentId);
        setPlan(generated.plan);
        setToast({ message: 'New plan generated successfully.', type: 'success' });
      }
    } catch {
      setError('Could not load your plan. Please try again.');
      setToast({ message: 'Error loading plan.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h2>My Course Plan</h2>
      <p>Select your name below to view your personalized semester schedule.</p>

      <StudentSelector onSelect={handleSelect} />

      {error && <p className="error-msg">{error}</p>}

      {loading && (
        <p className="loading-msg">
          <span className="spinner spinner-dark" />Loading your plan...
        </p>
      )}

      {student && plan && (
        <div className="plan-section">
          <PlanDisplay
            plan={plan}
            studentName={`${student.first_name} ${student.last_name}`}
          />
        </div>
      )}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, message: '' })} />
    </div>
  );
}
