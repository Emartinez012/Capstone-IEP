// =============================================================================
// SemesterCard.jsx
// Displays one semester: header, course list, optional edit-mode controls.
// =============================================================================

import { useState } from 'react';
import { termCodeToLabel } from '../utils';
import ElectivePicker from './ElectivePicker';

// Tiny inline form an advisor uses to fill an unresolved slot. Hidden behind
// a "Resolve" button until clicked so the read-only view stays uncluttered.
function UnresolvedSlotResolver({ sourceRowId, onResolve }) {
  const [open, setOpen]   = useState(false);
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState('');

  if (!sourceRowId) return null;

  if (!open) {
    return (
      <button
        className="resolve-btn"
        type="button"
        onClick={() => setOpen(true)}
      >Resolve</button>
    );
  }

  async function submit() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setErr('Enter a course code.'); return; }
    setBusy(true);
    setErr('');
    try {
      await onResolve(sourceRowId, trimmed);
      setOpen(false);
      setCode('');
    } catch (e) {
      setErr(e.message || 'Could not resolve slot.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="resolve-form">
      <input
        type="text"
        className="resolve-input"
        placeholder="COURSE_CODE"
        value={code}
        onChange={e => setCode(e.target.value)}
        disabled={busy}
      />
      <button className="resolve-confirm" type="button" disabled={busy} onClick={submit}>
        {busy ? '…' : 'Save'}
      </button>
      <button className="resolve-cancel" type="button" disabled={busy} onClick={() => { setOpen(false); setErr(''); }}>
        Cancel
      </button>
      {err && <span className="resolve-error">{err}</span>}
    </span>
  );
}

export default function SemesterCard({
  semester_number, term_code, courses, notes = [],
  editMode, onRemove, onAddCourse,
  // Phase 8 — elective picker wiring. When onElectiveChange is provided, any
  // course with is_elective=true and allowed_courses renders an inline picker.
  completed_courses = [], onElectiveChange, disablePicker = false,
  // Phase 9 — advisor resolve action. When supplied, unresolved slots get an
  // inline input + button to fill the slot with a chosen course code.
  onResolveSlot,
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
        {courses.map((course, idx) => {
          // Phase 8/9: an elective with a populated course_code AND allowed_courses
          // renders the inline picker. An elective with a null course_code is
          // either a legacy placeholder or an unresolved slot.
          const hasPicker = course.is_elective
            && course.course_code
            && Array.isArray(course.allowed_courses)
            && course.allowed_courses.length > 0;

          if (hasPicker) {
            return (
              <li
                key={course.item_id || `elective-${semester_number}-${idx}`}
                className={`course-item elective-row${course.is_student_override ? ' override' : ''}`}
              >
                <ElectivePicker
                  course_code={course.course_code}
                  default_course_id={course.default_course_id}
                  allowed_courses={course.allowed_courses}
                  completed_courses={completed_courses}
                  is_student_override={course.is_student_override}
                  disabled={disablePicker || !onElectiveChange}
                  onChange={newCode => onElectiveChange && onElectiveChange(course.source_row_id, newCode)}
                />
                <span className="course-name">{course.title ?? 'Elective'}</span>
              </li>
            );
          }

          if (course.is_unresolved) {
            return (
              <li
                key={`unresolved-${semester_number}-${course.source_row_id || idx}`}
                className="course-item unresolved-placeholder"
                data-reason-code={course.reason ? 'present' : 'missing'}
              >
                <span className="course-code">UNRESOLVED</span>
                <span className="course-name">
                  {course.reason || 'Advisor review needed'}
                </span>
                {onResolveSlot && (
                  <UnresolvedSlotResolver
                    sourceRowId={course.source_row_id}
                    onResolve={onResolveSlot}
                  />
                )}
              </li>
            );
          }

          if (course.is_elective) {
            return (
              <li key={`elective-${semester_number}-${idx}`} className="course-item elective-placeholder">
                <span className="course-code">ELECTIVE</span>
                <span className="course-name">
                  {editMode
                    ? <button className="course-pick-btn" onClick={onAddCourse}>Choose course +</button>
                    : 'Elective — to be determined'}
                </span>
              </li>
            );
          }

          return (
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
          );
        })}
      </ul>
      {notes.length > 0 && (
        <ul className="semester-notes">
          {notes.map((note, idx) => (
            <li key={`note-${semester_number}-${idx}`} className={`semester-note severity-${note.severity}`}>
              <span className="note-icon" aria-hidden="true">
                {note.severity === 'warning' ? '⚠' : 'ℹ'}
              </span>
              <span className="note-message">{note.message}</span>
            </li>
          ))}
        </ul>
      )}
      {editMode && (
        <button className="course-add-btn" onClick={onAddCourse}>+ Add Course</button>
      )}
    </div>
  );
}
