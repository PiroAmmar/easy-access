'use client';

import React from 'react';
import styles from './spreadsheet.module.css';
import type { SpreadsheetState, SpreadsheetAction } from './useSpreadsheetState';

interface SheetTabsProps {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
}

export default function SheetTabs({ state, dispatch }: SheetTabsProps) {
  const { model, activeSheet } = state;
  const sheets = model.sheets;

  if (sheets.length <= 1) return null;

  return (
    <div className={styles.sheetTabs}>
      {sheets.map((sheet, i) => (
        <button
          key={i}
          className={`${styles.sheetTab} ${i === activeSheet ? styles.sheetTabActive : ''}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_SHEET', index: i })}
          title={sheet.name}
        >
          {sheet.name}
        </button>
      ))}
    </div>
  );
}
