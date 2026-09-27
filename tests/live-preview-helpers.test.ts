import { describe, it, expect } from 'vitest';
import {
  computeToggle,
  countCheckboxes,
  firstCheckboxIndexOfCell,
  isTableDelimiterLine
} from '../src/live-preview-helpers';
import { getCheckboxCountsPerCell } from '../src/markdown-helpers';

describe('live-preview helpers', () => {
  it('recognises table delimiter rows', () => {
    expect(isTableDelimiterLine('|---|---|---|')).toBe(true);
    expect(isTableDelimiterLine(' :--- | :-: | --: ')).toBe(true);
    expect(isTableDelimiterLine('| a | b |')).toBe(false);
    expect(isTableDelimiterLine('---x')).toBe(false);
  });

  it('computes the global index of a cell\'s first checkbox', () => {
    const counts = getCheckboxCountsPerCell('| A | [x] | [ ] und [x] | [ ] |');
    expect(counts).toEqual([0, 1, 2, 1]);
    expect(firstCheckboxIndexOfCell(counts, 0)).toBe(0);
    expect(firstCheckboxIndexOfCell(counts, 2)).toBe(1);
    expect(firstCheckboxIndexOfCell(counts, 3)).toBe(3);
  });

  it('toggles the n-th checkbox in a line', () => {
    const line = '| Heightmap-Import | Gaea-Export | [x] | [ ] |';
    const a = computeToggle(line, 0)!;
    expect(line[a.offset]).toBe('x');
    expect(a).toMatchObject({ insert: ' ', checked: false });
    const b = computeToggle(line, 1)!;
    expect(line[b.offset]).toBe(' ');
    expect(b).toMatchObject({ insert: 'x', checked: true });
    expect(computeToggle(line, 2)).toBeNull();
  });

  it('counts checkboxes across text snippets', () => {
    expect(countCheckboxes(['a [ ] b [x]', '[ ]', 'none'])).toBe(3);
  });
});
