/**
 * Pure helpers for the Live Preview extension (no DOM, no CodeMirror),
 * so they can be unit-tested in isolation.
 */

/** Matches a table checkbox in source: `[ ]` or `[x]`. */
export const CHECKBOX_PATTERN = /\[( |x)\]/g;

/**
 * Returns true if the line is a Markdown table delimiter row, e.g. `|---|:--:|`.
 * @param line - A source line
 */
export function isTableDelimiterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(trimmed);
}

/**
 * Returns the global index of the first checkbox in the given cell,
 * i.e. the sum of all checkboxes in the cells before it.
 * @param counts - Checkbox counts per cell (see getCheckboxCountsPerCell)
 * @param cellIdx - Zero-based cell index
 */
export function firstCheckboxIndexOfCell(counts: number[], cellIdx: number): number {
  let sum = 0;
  for (let i = 0; i < cellIdx && i < counts.length; i++) sum += counts[i];
  return sum;
}

/**
 * Computes the edit that toggles the n-th checkbox in a source line.
 * @param line - The source line
 * @param idx - Zero-based index of the checkbox within the line
 * @returns Offset of the character between the brackets and its replacement, or null
 */
export function computeToggle(line: string, idx: number): { offset: number; insert: string; checked: boolean } | null {
  const matches = [...line.matchAll(CHECKBOX_PATTERN)];
  const m = matches[idx];
  if (!m || m.index === undefined) return null;
  const nowChecked = m[1] === 'x';
  return { offset: m.index + 1, insert: nowChecked ? ' ' : 'x', checked: !nowChecked };
}

/**
 * Counts checkbox patterns in a list of text snippets.
 * @param texts - Text contents
 */
export function countCheckboxes(texts: string[]): number {
  return texts.reduce((n, t) => n + (t.match(CHECKBOX_PATTERN) || []).length, 0);
}
