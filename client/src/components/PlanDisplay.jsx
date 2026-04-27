// =============================================================================
// PlanDisplay.jsx
// Receives a plan array from the API and renders one SemesterCard per semester.
// =============================================================================

import SemesterCard from './SemesterCard';

export default function PlanDisplay({
  plan, studentName,
  // Phase 8: forwarded to each SemesterCard so elective rows can render the
  // inline picker. Advisor view leaves these undefined and the picker stays
  // disabled. Student dashboard supplies completed_courses + onElectiveChange.
  completed_courses, onElectiveChange, disablePicker,
  // Phase 9: credit-total banner + advisor "resolve" action.
  total_credits_scheduled, total_credits_required, onResolveSlot,
}) {
  if (!plan || plan.length === 0) {
    return <p className="empty-message">No courses remaining — this student has completed their degree!</p>;
  }

  const totalCourses = plan.reduce((sum, sem) => sum + sem.courses.length, 0);
  const hasTotals    = total_credits_scheduled !== undefined && total_credits_scheduled !== null
                    && total_credits_required  !== undefined && total_credits_required  !== null;
  const isShort      = hasTotals && total_credits_scheduled < total_credits_required;
  const isOver       = hasTotals && total_credits_scheduled > total_credits_required;
  const bannerClass  = `plan-credit-banner ${isShort ? 'short' : isOver ? 'over' : 'on-target'}`;

  return (
    <div className="plan-display">
      <div className="plan-summary">
        {studentName && <h3 className="plan-student-name">{studentName}</h3>}
        <p className="plan-stats">
          {plan.length} semester{plan.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
          {totalCourses} course{totalCourses !== 1 ? 's' : ''} remaining
        </p>
      </div>
      {hasTotals && (
        <div className={bannerClass} role="status">
          <strong>{total_credits_scheduled}</strong> / {total_credits_required} credits planned
          {isShort && <span className="banner-tag">— short by {total_credits_required - total_credits_scheduled}</span>}
          {isOver  && <span className="banner-tag">— over by {total_credits_scheduled - total_credits_required}</span>}
        </div>
      )}
      <div className="semester-grid">
        {plan.map(semester => (
          <SemesterCard
            key={semester.semester}
            semester_number={semester.semester}
            term_code={semester.term_code}
            courses={semester.courses}
            notes={semester.notes}
            completed_courses={completed_courses}
            onElectiveChange={onElectiveChange}
            disablePicker={disablePicker}
            onResolveSlot={onResolveSlot}
          />
        ))}
      </div>
    </div>
  );
}
