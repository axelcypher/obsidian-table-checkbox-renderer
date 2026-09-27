import { EditorView, ViewPlugin } from '@codemirror/view';
import { getCheckboxCountsPerCell } from './markdown-helpers';
import { renderCellCheckboxesPure } from './render-cell-checkboxes';
import {
  computeToggle,
  countCheckboxes,
  firstCheckboxIndexOfCell,
  isTableDelimiterLine
} from './live-preview-helpers';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const CHECKBOX_CLASS = 'task-list-item-checkbox tcr-lp-checkbox';

/** Elements whose text must never be turned into checkboxes. */
const SKIP_SELECTOR = 'code, pre, .cm-editor, input, textarea';

/**
 * Finds the 1-based line number of the table's header row in the document,
 * or null if the rendered table can't be mapped safely to its source.
 */
function findHeaderLine(view: EditorView, table: HTMLElement): number | null {
  const anchor = (table.closest('.cm-table-widget') as HTMLElement | null) ?? table;
  let pos: number;
  try {
    pos = view.posAtDOM(anchor);
  } catch {
    return null;
  }
  const doc = view.state.doc;
  if (pos < 0 || pos > doc.length) return null;
  const header = doc.lineAt(pos).number;
  // Safety check: the line after the header must be the delimiter row.
  if (header + 1 > doc.lines || !isTableDelimiterLine(doc.line(header + 1).text)) return null;
  return header;
}

/** Returns the rows of a table that contain data cells (skips the header row). */
function dataRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).filter(r => r.querySelector('td'));
}

/** Collects the text nodes of a cell that may contain checkbox patterns. */
function candidateTextNodes(cell: HTMLElement): Text[] {
  const out: Text[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        out.push(child as Text);
      } else if (child.nodeType === ELEMENT_NODE && !(child as Element).matches(SKIP_SELECTOR)) {
        walk(child);
      }
    }
  };
  walk(cell);
  return out;
}

/**
 * Toggles the checkbox with the given index in the row's source line,
 * as an editor transaction (so it is undoable with Ctrl+Z).
 */
function toggle(view: EditorView, table: HTMLTableElement, row: HTMLTableRowElement, idx: number): void {
  const header = findHeaderLine(view, table);
  if (header == null) return;
  const rowIdx = dataRows(table).indexOf(row);
  if (rowIdx < 0) return;
  const lineNo = header + 2 + rowIdx;
  if (lineNo > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNo);
  const edit = computeToggle(line.text, idx);
  if (!edit) return;
  const from = line.from + edit.offset;
  view.dispatch({
    changes: { from, to: from + 1, insert: edit.insert },
    userEvent: 'input.toggle-table-checkbox'
  });
}

/** Creates an interactive checkbox that edits the document when clicked. */
function createCheckbox(
  view: EditorView,
  table: HTMLTableElement,
  row: HTMLTableRowElement,
  idx: number,
  checked: boolean
): HTMLInputElement {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = CHECKBOX_CLASS;
  box.checked = checked;
  // Keep the table widget from switching the cell into edit mode.
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  box.addEventListener('pointerdown', stop);
  box.addEventListener('mousedown', stop);
  box.addEventListener('touchstart', stop, { passive: false });
  box.addEventListener('click', (e) => {
    stop(e);
    toggle(view, table, row, idx);
  });
  return box;
}

/** Replaces checkbox patterns in one cell, if it maps cleanly to its source cell. */
function processCell(
  view: EditorView,
  table: HTMLTableElement,
  row: HTMLTableRowElement,
  cell: HTMLTableCellElement,
  expected: number,
  firstIdx: number
): void {
  if (expected === 0) return;
  if (cell.querySelector('.cm-editor')) return; // cell is being edited
  const nodes = candidateTextNodes(cell);
  // Already processed, or rendered text differs from source: leave it alone.
  if (countCheckboxes(nodes.map(n => n.textContent || '')) !== expected) return;

  let idx = firstIdx;
  for (const node of nodes) {
    const actions = renderCellCheckboxesPure(node.textContent || '');
    if (actions.length === 1 && actions[0].type === 'span') continue;
    const parent = node.parentNode;
    if (!parent) continue;
    for (const action of actions) {
      if (action.type === 'span') {
        parent.insertBefore(document.createTextNode(action.text!), node);
      } else {
        parent.insertBefore(createCheckbox(view, table, row, idx, action.checked!), node);
        idx++;
      }
    }
    parent.removeChild(node);
  }
}

/** Processes every rendered table in the editor. */
function processView(view: EditorView): void {
  const doc = view.state.doc;
  view.contentDOM.querySelectorAll('.cm-table-widget table').forEach(el => {
    const table = el as HTMLTableElement;
    if (table.closest('.cm-editor') !== view.dom) return; // nested editor
    const header = findHeaderLine(view, table);
    if (header == null) return;
    dataRows(table).forEach((row, rowIdx) => {
      const lineNo = header + 2 + rowIdx;
      if (lineNo > doc.lines) return;
      const counts = getCheckboxCountsPerCell(doc.line(lineNo).text);
      Array.from(row.cells).forEach((cell, cellIdx) => {
        processCell(view, table, row, cell, counts[cellIdx] ?? 0, firstCheckboxIndexOfCell(counts, cellIdx));
      });
    });
  });
}

/**
 * CodeMirror extension that renders `[ ]` / `[x]` inside Live Preview tables
 * as clickable checkboxes.
 */
export const livePreviewTableCheckboxes = ViewPlugin.fromClass(
  class {
    private observer: MutationObserver;
    private scheduled = false;

    constructor(private view: EditorView) {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(view.contentDOM, { childList: true, subtree: true, characterData: true });
      this.schedule();
    }

    update() {
      this.schedule();
    }

    private schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      requestAnimationFrame(() => {
        this.scheduled = false;
        try {
          processView(this.view);
        } catch (err) {
          console.error('[axlc-table-checkbox-renderer-revamped]', err);
        }
      });
    }

    destroy() {
      this.observer.disconnect();
    }
  }
);
