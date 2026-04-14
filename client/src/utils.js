// =============================================================================
// utils.js
// Shared helper functions used across components.
// =============================================================================

/**
 * Converts a YYT term code into a human-readable label.
 *
 * Term code format: YYT
 *   YY = last two digits of the academic year (e.g., 24 for 2024)
 *   T  = term: 1 = Fall, 2 = Spring, 3 = Summer
 *
 * Year rule:
 *   Fall   (T=1): calendar year = 2000 + YY       e.g. "241" → Fall 2024
 *   Spring (T=2): calendar year = 2000 + YY + 1   e.g. "242" → Spring 2025
 *   Summer (T=3): calendar year = 2000 + YY + 1   e.g. "243" → Summer 2025
 *
 * @param {string|number} termCode  e.g. "241" or 241
 * @returns {string}  e.g. "Fall 2024"
 */
export function termCodeToLabel(termCode) {
  const code = String(termCode);
  const yy = parseInt(code.slice(0, 2), 10);
  const t  = parseInt(code.slice(-1),   10);

  const termNames = { 1: 'Fall', 2: 'Spring', 3: 'Summer' };
  const year = t === 1 ? 2000 + yy : 2000 + yy + 1;

  return `${termNames[t] ?? 'Unknown'} ${year}`;
}
