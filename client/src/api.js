// =============================================================================
// api.js
// All fetch calls to the backend in one place.
// The /api prefix is automatically proxied to http://localhost:3001 by Vite.
// =============================================================================

const BASE = '/api';

// --- Students ----------------------------------------------------------------

export async function getStudents() {
  const res = await fetch(`${BASE}/students`);
  if (!res.ok) throw new Error('Failed to fetch students');
  return res.json();
}

export async function getStudentById(id) {
  const res = await fetch(`${BASE}/students/${id}`);
  if (!res.ok) throw new Error('Failed to fetch student');
  return res.json();
}

export async function updateStudentProfile(studentId, data) {
  const res = await fetch(`${BASE}/students/${studentId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to save profile');
  return body;
}

// --- Majors ------------------------------------------------------------------

export async function getMajors() {
  const res = await fetch(`${BASE}/majors`);
  if (!res.ok) throw new Error('Failed to fetch programs');
  return res.json();
}

export async function getDegreeCourses(degreeCode) {
  const res = await fetch(`${BASE}/majors/${degreeCode}/model`);
  if (!res.ok) throw new Error('Failed to fetch degree courses');
  return res.json(); // [{course_code, course_name, priority_index, ...}]
}

// --- Plans -------------------------------------------------------------------

// Runs the scheduling algorithm, saves the result, and returns the grouped plan.
export async function generatePlan(studentId) {
  const res = await fetch(`${BASE}/plans/generate/${studentId}`, { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to generate plan');
  return body;
}

// Returns full student profile including advisor info and course history.
export async function getStudentProfile(studentId) {
  const res = await fetch(`${BASE}/students/${studentId}/profile`);
  if (!res.ok) throw new Error('Failed to fetch student profile');
  return res.json();
}

// Saves an edited plan (replaces all schedule items).
export async function savePlan(studentId, plan) {
  const res = await fetch(`${BASE}/plans/${studentId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ plan }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to save plan');
  return body;
}

// Returns the current IEP status and history for a student.
export async function getIEPStatus(studentId) {
  const res = await fetch(`${BASE}/plans/${studentId}/status`);
  if (!res.ok) throw new Error('Failed to fetch IEP status');
  return res.json();
}

// Submits the student's plan to their advisor for review.
export async function submitIEP(studentId) {
  const res = await fetch(`${BASE}/plans/${studentId}/submit`, { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to submit plan');
  return body;
}

// Student responds to advisor decision: 'accept' or 'revise'.
export async function respondToIEP(studentId, response) {
  const res = await fetch(`${BASE}/plans/${studentId}/respond`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ response }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to record response');
  return body;
}

// Advisor approves or declines a student's submitted plan.
export async function advisorReviewIEP(studentId, decision, notes, advisorId) {
  const res = await fetch(`${BASE}/plans/${studentId}/advisor-review`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ decision, notes, advisor_id: advisorId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to record review');
  return body;
}

// Returns the saved plan for a student, or null if none has been generated yet.
export async function getPlan(studentId) {
  const res = await fetch(`${BASE}/plans/${studentId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

// Records a student's elective override for a single program-model row.
export async function setElectiveChoice(studentId, sourceRowId, courseId) {
  const res = await fetch(`${BASE}/plans/${studentId}/electives`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ source_row_id: sourceRowId, course_id: courseId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to set elective choice');
  return body;
}

// --- Program Models (Phase 10) -----------------------------------------------

export async function listProgramModels(programId) {
  const params = programId ? `?program_id=${encodeURIComponent(programId)}` : '';
  const res = await fetch(`${BASE}/program-models${params}`);
  if (!res.ok) throw new Error('Failed to list program models');
  return res.json();
}

export async function getProgramModel(modelId) {
  const res = await fetch(`${BASE}/program-models/${modelId}`);
  if (!res.ok) throw new Error('Failed to fetch program model');
  return res.json();
}

export async function patchProgramModelRow(modelId, rowId, patch) {
  const res = await fetch(`${BASE}/program-models/${modelId}/rows/${rowId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to update row');
  return body;
}

export async function activateProgramModel(modelId) {
  const res = await fetch(`${BASE}/program-models/${modelId}/activate`, { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to activate model');
  return body;
}

// Advisor fills an unresolved slot with a chosen course.
export async function resolveSlot(studentId, sourceRowId, courseId, { advisorId, notes } = {}) {
  const res = await fetch(`${BASE}/plans/${studentId}/resolve-slot`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      source_row_id: sourceRowId,
      course_id:     courseId,
      advisor_id:    advisorId,
      notes,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to resolve slot');
  return body;
}

// --- Faculty / Advisor Dashboard ---------------------------------------------

export async function getFacultyOverview() {
  const res = await fetch(`${BASE}/faculty/overview`);
  if (!res.ok) throw new Error('Failed to fetch overview');
  return res.json();
}

export async function getFacultyStudents({ term = '', program = '', campus = '' } = {}) {
  const params = new URLSearchParams();
  if (term)    params.set('term',    term);
  if (program) params.set('program', program);
  if (campus)  params.set('campus',  campus);
  const res = await fetch(`${BASE}/faculty/students?${params}`);
  if (!res.ok) throw new Error('Failed to fetch students');
  return res.json();
}

export async function getFacultyHeatmap({ program = 'all', campus = 'all', include_online = false } = {}) {
  const params = new URLSearchParams({ program, campus, include_online });
  const res = await fetch(`${BASE}/faculty/heatmap?${params}`);
  if (!res.ok) throw new Error('Failed to fetch heatmap');
  return res.json();
}

export async function getFacultyPrograms() {
  const res = await fetch(`${BASE}/faculty/programs`);
  if (!res.ok) throw new Error('Failed to fetch programs');
  return res.json();
}

export async function getFacultyTerms() {
  const res = await fetch(`${BASE}/faculty/terms`);
  if (!res.ok) throw new Error('Failed to fetch terms');
  return res.json();
}

export async function getFacultyCampuses() {
  const res = await fetch(`${BASE}/faculty/campuses`);
  if (!res.ok) throw new Error('Failed to fetch campuses');
  return res.json();
}

export async function getAdvisorCaseload(advisorId) {
  const res = await fetch(`${BASE}/faculty/advisor/${advisorId}/caseload`);
  if (!res.ok) throw new Error('Failed to fetch caseload');
  return res.json();
}

export async function getAdvisorPending(advisorId) {
  const res = await fetch(`${BASE}/faculty/advisor/${advisorId}/pending`);
  if (!res.ok) throw new Error('Failed to fetch pending');
  return res.json();
}

export async function getFacultySubstitutions() {
  const res = await fetch(`${BASE}/faculty/substitutions`);
  if (!res.ok) throw new Error('Failed to fetch substitutions');
  return res.json();
}

export async function getFacultyAdvisors() {
  const res = await fetch(`${BASE}/faculty/advisors`);
  if (!res.ok) throw new Error('Failed to fetch advisors');
  return res.json();
}

export async function createAdvisor(data) {
  const res = await fetch(`${BASE}/faculty/advisors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to create advisor');
  return body;
}

export async function updateAdvisorPrograms(advisorId, programs) {
  const res = await fetch(`${BASE}/faculty/advisors/${advisorId}/programs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ programs }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to update programs');
  return body;
}

export async function assignStudentToAdvisor(studentId, advisorId) {
  const res = await fetch(`${BASE}/faculty/students/${studentId}/assign`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ advisor_id: advisorId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to assign student');
  return body;
}

export async function autoAssignProgram(degreeCode) {
  const res = await fetch(`${BASE}/faculty/programs/${degreeCode}/auto-assign`, {
    method: 'POST',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to auto-assign');
  return body;
}

export async function approveSchedule(scheduleId) {
  const res = await fetch(`${BASE}/faculty/schedule/${scheduleId}/approve`, { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to approve schedule');
  return res.json();
}

export async function rejectSchedule(scheduleId) {
  const res = await fetch(`${BASE}/faculty/schedule/${scheduleId}/reject`, { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to reject schedule');
  return res.json();
}

// --- Curriculum (Chairperson) ------------------------------------------------

export async function getProgramCourses(degreeCode) {
  const res = await fetch(`${BASE}/faculty/programs/${degreeCode}/courses`);
  if (!res.ok) throw new Error('Failed to fetch program courses');
  return res.json();
}

export async function addProgramCourse(degreeCode, data) {
  const res = await fetch(`${BASE}/faculty/programs/${degreeCode}/courses`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to add course');
  return body;
}

export async function removeProgramCourse(degreeCode, courseCode) {
  const res = await fetch(`${BASE}/faculty/programs/${degreeCode}/courses/${courseCode}`, { method: 'DELETE' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to remove course');
  return body;
}

export async function updateCourse(courseCode, data) {
  const res = await fetch(`${BASE}/faculty/courses/${courseCode}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to update course');
  return body;
}

export async function getCourseSections(courseCode) {
  const res = await fetch(`${BASE}/faculty/courses/${courseCode}/sections`);
  if (!res.ok) throw new Error('Failed to fetch sections');
  return res.json();
}

export async function addCourseSection(courseCode, data) {
  const res = await fetch(`${BASE}/faculty/courses/${courseCode}/sections`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to add section');
  return body;
}

export async function updateCourseSection(sectionId, data) {
  const res = await fetch(`${BASE}/faculty/sections/${sectionId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to update section');
  return body;
}

export async function deleteCourseSection(sectionId) {
  const res = await fetch(`${BASE}/faculty/sections/${sectionId}`, { method: 'DELETE' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to delete section');
  return body;
}

// --- Auth --------------------------------------------------------------------

export async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed. Please try again.');
  return data;
}

export async function signup(firstName, lastName, email, password) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ first_name: firstName, last_name: lastName, email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Signup failed. Please try again.');
  return data;
}
