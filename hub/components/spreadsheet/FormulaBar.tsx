'use client';

import React, { useRef, useEffect } from 'react';
import styles from './spreadsheet.module.css';
import type { SpreadsheetState, SpreadsheetAction } from './useSpreadsheetState';
import { toA1 } from './coords';
import { formatCell } from './formatting';
import { getCell } from './useSpreadsheetState';

interface FormulaBarProps {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  editing: boolean;
}

export default function FormulaBar({ state, dispatch, editing }: FormulaBarProps) {
  const { selection, editCell, activeSheet, model } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine the address string shown in the name box
  const { anchor, focus } = selection;
  const minR = Math.min(anchor.r, focus.r);
  const maxR = Math.max(anchor.r, focus.r);
  const minC = Math.min(anchor.c, focus.c);
  const maxC = Math.max(anchor.c, focus.c);
  const isSingle = minR === maxR && minC === maxC;
  const addr = isSingle
    ? toA1(minR, minC)
    : `${toA1(minR, minC)}:${toA1(maxR, maxC)}`;

  // Determine display value for formula bar input
  let fxValue: string;
  if (editCell && editCell.r === focus.r && editCell.c === focus.c) {
    fxValue = editCell.value;
  } else {
    const cell = getCell(model, activeSheet, focus.r, focus.c);
    if (cell?.f) {
      fxValue = '=' + cell.f;
    } else if (cell?.v !== null && cell?.v !== undefined) {
      fxValue = formatCell(cell, undefined).text;
    } else {
      fxValue = '';
    }
  }

  // Focus input when editing starts for the focused cell
  useEffect(() => {
    if (editCell && editCell.r === focus.r && editCell.c === focus.c) {
      // Let the Grid's inline input take precedence; formula bar is secondary
    }
  }, [editCell, focus]);

  const handleFocus = () => {
    if (!editing) return;
    if (!editCell) {
      dispatch({ type: 'START_EDIT', r: focus.r, c: focus.c });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editing) return;
    dispatch({ type: 'START_EDIT', r: focus.r, c: focus.c, initialValue: e.target.value });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      dispatch({ type: 'COMMIT_EDIT' });
      e.preventDefault();
    } else if (e.key === 'Escape') {
      dispatch({ type: 'CANCEL_EDIT' });
      e.preventDefault();
    }
  };

  return (
    <div className={styles.formulaBar}>
      <div className={styles.nameBox}>{addr}</div>
      <div className={styles.fxLabel}>fx</div>
      <input
        ref={inputRef}
        className={styles.fxInput}
        value={fxValue}
        readOnly={!editing}
        onFocus={handleFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={editing ? 'Select a cell to edit…' : ''}
        style={{ cursor: editing ? 'text' : 'default' }}
      />
    </div>
  );
}
