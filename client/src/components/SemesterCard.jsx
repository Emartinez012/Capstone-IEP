// =============================================================================
// SemesterCard.jsx
// Displays one semester: header, course list, optional edit-mode controls.
// =============================================================================

import { termCodeToLabel } from '../utils';

export default function SemesterCard({
  semester_number, term_code, courses,
  editMode, onRemove, onAddCourse,
}) {
  const termLabel = termCodeToLabel(term_code);
  let termClass = 'term-default';
  if (termLabel.includes('Fall'))   termClass = 'term-fall';
  if (termLabel.includes('Spring')) termClass = 'term-spring';
  if (termLabel.includes('Summer')) termClass = 'term-summer';

  return (
    <div className="semester-card">
      <div className="semester-header">
        <span className="semester-number">Semester {semester_number}</span>
        <span className={`semester-term ${termClass}`}>{termLabel}</span>
      </div>
      <ul className="course-list">
        {courses.map((course, idx) =>
          course.is_elective ? (
            <li key={`elective-${semester_number}-${idx}`} className="course-item elective-placeholder">
              <span className="course-code">ELECTIVE</span>
              <span className="course-name">
                {editMode
                  ? <button className="course-pick-btn" onClick={onAddCourse}>Choose course +</button>
                  : 'Elective — to be determined'}
              </span>
            </li>
          ) : (
            <li key={course.course_code} className={`course-item${editMode ? ' editable' : ''}`}>
              <span className="course-code">{course.course_code}</span>
              <span className="course-name">{course.title ?? course.course_name}</span>
              {editMode && (
                <button
                  className="course-remove-btn"
                  onClick={() => onRemove(course.course_code)}
                  title="Remove"
                >✕</button>
              )}
            </li>
          )
        )}
      </ul>
      {editMode && (
        <button className="course-add-btn" onClick={onAddCourse}>+ Add Course</button>
      )}
    </div>
  );
}
