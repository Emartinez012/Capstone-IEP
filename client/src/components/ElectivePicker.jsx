// =============================================================================
// ElectivePicker.jsx
// Inline dropdown for one elective slot. Renders the slot's allowed courses,
// filtered against the student's completed courses, and calls onChange when
// the student picks a different course. The component is read-only when
// `disabled` is true (e.g., advisor view).
// =============================================================================

export default function ElectivePicker({
  course_code,
  default_course_id,
  allowed_courses = [],
  completed_courses = [],
  is_student_override = false,
  disabled = false,
  onChange,
}) {
  const completed = new Set(completed_courses);
  const options = (allowed_courses || []).filter(c => !completed.has(c));

  // Always include the currently-chosen course even if it's somehow missing
  // from allowed_courses (e.g. faculty trimmed the list after the student chose).
  if (course_code && !options.includes(course_code)) options.unshift(course_code);

  return (
    <span className="elective-picker">
      <select
        className="elective-select"
        value={course_code || ''}
        disabled={disabled}
        onChange={e => onChange && onChange(e.target.value)}
      >
        {options.map(code => (
          <option key={code} value={code}>
            {code}{code === default_course_id ? ' (default)' : ''}
          </option>
        ))}
      </select>
      {is_student_override && (
        <span className="elective-override-badge" title="Student-chosen alternative">override</span>
      )}
    </span>
  );
}
