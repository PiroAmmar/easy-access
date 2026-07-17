'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import styles from './spreadsheet.module.css';
import { useSpreadsheetState, getCell } from './useSpreadsheetState';
import type { SpreadsheetState } from './useSpreadsheetState';
import { loadWorkbook, saveWorkbook } from './excel-io';
import type { WorkbookModel } from './types';
import FormulaBar from './FormulaBar';
import SheetTabs from './SheetTabs';
import Grid from './Grid';
import { SpreadsheetEngine } from './engine';
import Ribbon from './Ribbon';
import FindReplaceDialog from './FindReplaceDialog';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SpreadsheetViewerProps {
  contentB64: string;
  ext: string;
  fileName: string;
  editing: boolean;
  onRequestEdit: () => void;
  doSave: (b64: string) => Promise<void>;
  saving: boolean;
}

// ─── Empty workbook placeholder ───────────────────────────────────────────────

const EMPTY_WB: WorkbookModel = {
  sheets: [{ name: 'Sheet1', cells: [], colWidths: [], rowHeights: [], merges: [] }],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpreadsheetViewer({
  contentB64,
  ext,
  fileName,
  editing,
  onRequestEdit,
  doSave,
  saving,
}: SpreadsheetViewerProps) {
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showFindReplace, setShowFindReplace] = useState(false);

  const { state, dispatch } = useSpreadsheetState(EMPTY_WB);

  // Keep a ref to the latest state for use in callbacks
  const stateRef = useRef<SpreadsheetState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Engine ref — single instance, lazily initialized per workbook
  const engineRef = useRef(new SpreadsheetEngine());

  // Load workbook when contentB64 or ext changes
  useEffect(() => {
    if (!contentB64) return;
    setIsLoading(true);
    setLoadError('');
    setSaved(false);
    setSaveError('');

    loadWorkbook(contentB64, ext)
      .then(async (model) => {
        dispatch({ type: 'SET_MODEL', model });
        // Destroy old engine state and reinitialize with new model
        engineRef.current.destroy();
        await engineRef.current.init(model);
      })
      .catch((e: unknown) => {
        setLoadError((e as Error).message ?? 'Failed to load workbook');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [contentB64, ext, dispatch]);

  // Destroy engine on unmount
  useEffect(() => {
    return () => {
      engineRef.current.destroy();
    };
  }, []);

  // commitEdit: dispatch COMMIT_EDIT then sync the resulting cell to the engine
  const commitEdit = useCallback((r: number, c: number) => {
    dispatch({ type: 'COMMIT_EDIT' });
    // Sync to engine after the state update (use rAF to let React flush)
    requestAnimationFrame(() => {
      const currentState = stateRef.current;
      const cell = getCell(currentState.model, currentState.activeSheet, r, c);
      if (cell?.f) {
        engineRef.current.setFormula(currentState.activeSheet, r, c, cell.f);
      } else {
        const rawVal = cell?.v ?? null;
        // Convert Date to Excel serial number for the engine
        const engineVal = rawVal instanceof Date
          ? rawVal.getTime() / 86400000 + 25569
          : rawVal;
        engineRef.current.setCellValue(currentState.activeSheet, r, c, engineVal);
      }
    });
  }, [dispatch]);

  const handleSave = async () => {
    setSaved(false);
    setSaveError('');
    try {
      const b64 = await saveWorkbook(state.model, ext);
      await doSave(b64);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Save failed');
    }
  };

  return (
    <div className={styles.viewer}>
      {/* ── Action bar ──────────────────────────────────────────────── */}
      <div className={styles.actionBar}>
        <div className={styles.actionBarLeft}>
          <span className={styles.fileName}>{fileName}</span>
          {editing && <span className={styles.editingBadge}>Editing</span>}
          {saved && <span className={styles.savedBadge}>Saved</span>}
          {saveError && <span className={styles.errorBadge}>{saveError}</span>}
        </div>
        <div className={styles.actionBarRight}>
          {editing ? (
            <>
              <button
                className={styles.btnSave}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                className={styles.btnCancel}
                onClick={() => {
                  // Cancel just clears edits — parent toggles editing off
                  dispatch({ type: 'CANCEL_EDIT' });
                  // We reload the original to discard changes
                  if (contentB64) {
                    loadWorkbook(contentB64, ext).then(async (model) => {
                      dispatch({ type: 'SET_MODEL', model });
                      engineRef.current.destroy();
                      await engineRef.current.init(model);
                    }).catch(() => {});
                  }
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button className={styles.btnEdit} onClick={onRequestEdit}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Ribbon ──────────────────────────────────────────────────── */}
      <Ribbon
        state={state}
        dispatch={dispatch}
        editing={editing}
        engine={engineRef.current}
        onCopy={() => {}}
        onCut={() => {}}
        onPaste={() => {}}
        onFindReplace={() => setShowFindReplace(true)}
      />

      {/* ── Formula bar ─────────────────────────────────────────────── */}
      <FormulaBar state={state} dispatch={dispatch} editing={editing} engine={engineRef.current} />

      {/* ── Grid (or loading / error) ────────────────────────────────── */}
      {isLoading ? (
        <div className={styles.loadingState}>Loading workbook…</div>
      ) : loadError ? (
        <div className={styles.errorState}>{loadError}</div>
      ) : (
        <Grid
          state={state}
          dispatch={dispatch}
          editing={editing}
          engine={engineRef.current}
          commitEdit={commitEdit}
        />
      )}

      {/* ── Sheet tabs ───────────────────────────────────────────────── */}
      <SheetTabs state={state} dispatch={dispatch} />

      {/* ── Find & Replace dialog ────────────────────────────────────── */}
      {showFindReplace && (
        <FindReplaceDialog
          state={state}
          dispatch={dispatch}
          onClose={() => setShowFindReplace(false)}
        />
      )}
    </div>
  );
}
