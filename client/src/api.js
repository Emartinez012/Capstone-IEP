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

// Returns the saved plan for a student, or null if none has been generated yet.
export async function getPlan(studentId) {
  const res = await fetch(`${BASE}/plans/${studentId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
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
