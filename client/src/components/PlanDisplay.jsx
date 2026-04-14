// =============================================================================
// PlanDisplay.jsx
// Receives a plan array from the API and renders one SemesterCard per semester.
// =============================================================================

import SemesterCard from './SemesterCard';

export default function PlanDisplay({ plan, studentName }) {
  if (!plan || plan.length === 0) {
    return <p className="empty-message">No courses remaining — this student has completed their degree!</p>;
  }

  const totalCourses = plan.reduce((sum, sem) => sum + sem.courses.length, 0);

  return (
    <div className="plan-display">
      <div className="plan-summary">
        {studentName && <h3 className="plan-student-name">{studentName}</h3>}
        <p className="plan-stats">
          {plan.length} semester{plan.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
          {totalCourses} course{totalCourses !== 1 ? 's' : ''} remaining
        </p>
      </div>
      <div className="semester-grid">
        {plan.map(semester => (
          <SemesterCard
            key={semester.semester_number}
            semester_number={semester.semester_number}
            term_code={semester.term_code}
            courses={semester.courses}
          />
        ))}
      </div>
    </div>
  );
}
