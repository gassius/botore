import {
  RankingContractUnavailableError,
  RankingTransportError,
  type RankingReadPort,
} from './RankingReadPort';
import type { RankingLoadResult, RankingRow, RankingSessionState } from './types';

export function createInitialRankingSession(): RankingSessionState {
  return {
    phase: 'idle',
    rows: [],
    errorMessage: null,
    errorCode: null,
    refreshing: false,
  };
}

export function beginRankingLoad(state: RankingSessionState): RankingSessionState {
  const hasRows = state.rows.length > 0;
  return {
    ...state,
    phase: hasRows ? state.phase : 'loading',
    refreshing: hasRows,
    errorMessage: hasRows ? state.errorMessage : null,
    errorCode: hasRows ? state.errorCode : null,
  };
}

export function applyRankingLoadResult(
  state: RankingSessionState,
  result: RankingLoadResult,
): RankingSessionState {
  if (result.kind === 'ok') {
    if (result.rows.length === 0) {
      return {
        phase: 'empty',
        rows: [],
        errorMessage: null,
        errorCode: null,
        refreshing: false,
      };
    }
    return {
      phase: 'populated',
      rows: result.rows,
      errorMessage: null,
      errorCode: null,
      refreshing: false,
    };
  }

  if (result.kind === 'unavailable_contract') {
    return {
      phase: 'unavailable_contract',
      // Keep any previously readable rows coherent.
      rows: state.rows,
      errorMessage: result.message,
      errorCode: null,
      refreshing: false,
    };
  }

  // error — preserve prior rows when present; never look like an empty board.
  return {
    phase: state.rows.length > 0 ? 'populated' : 'error',
    rows: state.rows,
    errorMessage: result.message,
    errorCode: result.code ?? null,
    refreshing: false,
  };
}

export async function loadRankingFromPort(port: RankingReadPort): Promise<RankingLoadResult> {
  try {
    const rows = await port.list();
    // Defensive copy; never reorder — preserve backend/fixture order.
    return { kind: 'ok', rows: Object.freeze([...rows]) };
  } catch (err) {
    if (err instanceof RankingContractUnavailableError) {
      return { kind: 'unavailable_contract', message: err.message };
    }
    if (err instanceof RankingTransportError) {
      return { kind: 'error', message: err.message, code: err.code };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', message };
  }
}

/** Display helper: rows stay in port order; ownership cue is label-based. */
export function rankingRowAccessibilityLabel(row: RankingRow): string {
  const ownership = row.isCurrentBot ? ', your bot' : '';
  const source = row.source === 'dev-fixture' ? ', development fixture' : '';
  return `Rank ${row.rank}, ${row.displayName}${ownership}${source}`;
}
