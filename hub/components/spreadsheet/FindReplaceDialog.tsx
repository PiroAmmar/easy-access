'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { SpreadsheetState, SpreadsheetAction } from './useSpreadsheetState';
import { formatCell } from './formatting';
import type { Cell } from './types';

interface FindReplaceDialogProps {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  onClose: () => void;
}

export default function FindReplaceDialog({ state, dispatch, onClose }: FindReplaceDialogProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [status, setStatus] = useState('');
  const currentMatchRef = useRef<{ r: number; c: number } | null>(null);

  const sheet = state.model.sheets[state.activeSheet];

  const getCellDisplayText = useCallback((cell: Cell | null): string => {
    if (!cell) return '';
    return formatCell(cell).text;
  }, []);

  const findNext = useCallback(() => {
    if (!sheet || !findText) return null;
    const cells = sheet.cells;
    const maxR = cells.length;
    const maxC = cells.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);

    let startR = 0;
    let startC = 0;
    if (currentMatchRef.current) {
      startC = currentMatchRef.current.c + 1;
      startR = currentMatchRef.current.r;
      if (startC >= maxC) { startC = 0; startR++; }
    }

    const search = findText.toLowerCase();

    // Search from current position to end
    for (let r = startR; r < maxR; r++) {
      const cStart = r === startR ? startC : 0;
      for (let c = cStart; c < maxC; c++) {
        const cell = cells[r]?.[c] ?? null;
        const text = getCellDisplayText(cell);
        if (text.toLowerCase().includes(search)) {
          currentMatchRef.current = { r, c };
          dispatch({
            type: 'SET_SELECTION',
            anchor: { r, c },
            focus: { r, c },
          });
          setStatus(`Found at ${String.fromCharCode(65 + c)}${r + 1}`);
          return { r, c };
        }
      }
    }

    // Wrap from beginning
    for (let r = 0; r < startR; r++) {
      for (let c = 0; c < maxC; c++) {
        const cell = cells[r]?.[c] ?? null;
        const text = getCellDisplayText(cell);
        if (text.toLowerCase().includes(search)) {
          currentMatchRef.current = { r, c };
          dispatch({
            type: 'SET_SELECTION',
            anchor: { r, c },
            focus: { r, c },
          });
          setStatus(`Found at ${String.fromCharCode(65 + c)}${r + 1} (wrapped)`);
          return { r, c };
        }
      }
    }

    currentMatchRef.current = null;
    setStatus('Not found');
    return null;
  }, [sheet, findText, dispatch, getCellDisplayText]);

  const handleReplace = useCallback(() => {
    if (!sheet || !findText) return;
    const match = currentMatchRef.current;
    if (!match) {
      findNext();
      return;
    }
    const cell = sheet.cells[match.r]?.[match.c] ?? null;
    if (!cell) { findNext(); return; }

    const text = getCellDisplayText(cell);
    if (!text.toLowerCase().includes(findText.toLowerCase())) { findNext(); return; }

    const newValue = text.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText);
    dispatch({
      type: 'SET_CELLS_BATCH',
      sheet: state.activeSheet,
      cells: [{ r: match.r, c: match.c, cell: { ...cell, v: newValue, f: undefined } }],
      addUndo: true,
    });
    setStatus('Replaced');
    findNext();
  }, [sheet, findText, replaceText, dispatch, state.activeSheet, findNext, getCellDisplayText]);

  const handleReplaceAll = useCallback(() => {
    if (!sheet || !findText) return;
    const cells = sheet.cells;
    const maxR = cells.length;
    const maxC = cells.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);
    const search = findText.toLowerCase();
    const replacements: { r: number; c: number; cell: Cell | null }[] = [];
    let count = 0;

    for (let r = 0; r < maxR; r++) {
      for (let c = 0; c < maxC; c++) {
        const cell = cells[r]?.[c] ?? null;
        if (!cell) continue;
        const text = getCellDisplayText(cell);
        if (text.toLowerCase().includes(search)) {
          const newValue = text.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText);
          replacements.push({ r, c, cell: { ...cell, v: newValue, f: undefined } });
          count++;
        }
      }
    }

    if (count > 0) {
      dispatch({
        type: 'SET_CELLS_BATCH',
        sheet: state.activeSheet,
        cells: replacements,
        addUndo: true,
      });
      setStatus(`${count} replacement${count !== 1 ? 's' : ''} made`);
    } else {
      setStatus('Not found');
    }
  }, [sheet, findText, replaceText, dispatch, state.activeSheet, getCellDisplayText]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const dialogStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #c8c8c8', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    padding: '16px 20px', minWidth: 340, display: 'flex', flexDirection: 'column', gap: 10,
    fontFamily: 'Calibri, Segoe UI, Arial, sans-serif', fontSize: 13,
  };
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
  const labelStyle: React.CSSProperties = { minWidth: 90, textAlign: 'right', color: '#212121' };
  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '3px 6px', border: '1px solid #c8c8c8', borderRadius: 2, fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
  };
  const btnStyle: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, border: '1px solid #c8c8c8', borderRadius: 2,
    background: '#f3f2f1', cursor: 'pointer', fontFamily: 'inherit',
  };

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle}>
        <div style={{ fontWeight: 600, fontSize: 14, borderBottom: '1px solid #e0e0e0', paddingBottom: 8 }}>
          Find & Replace
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Find what:</span>
          <input
            style={inputStyle}
            value={findText}
            onChange={e => { setFindText(e.target.value); currentMatchRef.current = null; }}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') findNext(); if (e.key === 'Escape') onClose(); }}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Replace with:</span>
          <input
            style={inputStyle}
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleReplace(); if (e.key === 'Escape') onClose(); }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button style={btnStyle} onClick={findNext} type="button">Find Next</button>
          <button style={btnStyle} onClick={handleReplace} type="button">Replace</button>
          <button style={{ ...btnStyle, background: '#217346', color: '#fff', borderColor: '#1a5c38' }} onClick={handleReplaceAll} type="button">Replace All</button>
          <button style={btnStyle} onClick={onClose} type="button">Close</button>
        </div>
        {status && (
          <div style={{ fontSize: 11, color: status.includes('Not found') ? '#a80000' : '#217346', paddingTop: 2 }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
