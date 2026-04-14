// =============================================================================
// SemesterCard.jsx
// Displays one semester: its label and the list of courses scheduled for it.
// =============================================================================

import { termCodeToLabel } from '../utils';

export default function SemesterCard({ semester_number, term_code, courses }) {
  const termLabel = termCodeToLabel(term_code);
  let termClass = 'term-default';
  if (termLabel.includes('Fall')) termClass = 'term-fall';
  if (termLabel.includes('Spring')) termClass = 'term-spring';
  if (termLabel.includes('Summer')) termClass = 'term-summer';

  return (
    <div className="semester-card">
      <div className="semester-header">
        <span className="semester-number">Semester {semester_number}</span>
        <span className={`semester-term ${termClass}`}>{termLabel}</span>
      </div>
      <ul className="course-list">
        {courses.map(course => (
          <li key={course.course_id} className="course-item">
            <span className="course-code">{course.course_code}</span>
            <span className="course-name">{course.course_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
