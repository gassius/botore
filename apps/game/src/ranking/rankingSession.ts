import { playerFacingDisplayName } from '../identity/platformPlayerId';
import {
  RankingContractUnavailableError,
  RankingTransportError,
  type RankingReadPort,
} from './RankingReadPort';
import type {
  BotoreRankingRow,
  RankingLoadResult,
  RankingRow,
  RankingSessionState,
  RankingTab,
} from './types';

export function createInitialRankingSession(tab: RankingTab = 'bots'): RankingSessionState {
  return {
    phase: 'idle',
    tab,
    botRows: [],
    botoreRows: [],
    errorMessage: null,
    errorCode: null,
    refreshing: false,
  };
}

export function beginRankingLoad(state: RankingSessionState): RankingSessionState {
  const hasRows = state.tab === 'bots' ? state.botRows.length > 0 : state.botoreRows.length > 0;
  return {
    ...state,
    phase: hasRows ? state.phase : 'loading',
    refreshing: hasRows,
    errorMessage: hasRows ? state.errorMessage : null,
    errorCode: hasRows ? state.errorCode : null,
  };
}

export function selectRankingTab(state: RankingSessionState, tab: RankingTab): RankingSessionState {
  if (state.tab === tab) return state;
  const hasCached = tab === 'bots' ? state.botRows.length > 0 : state.botoreRows.length > 0;
  return {
    ...state,
    tab,
    phase: hasCached ? 'populated' : 'idle',
    errorMessage: null,
    errorCode: null,
    refreshing: false,
  };
}

export function applyRankingLoadResult(
  state: RankingSessionState,
  result: RankingLoadResult,
): RankingSessionState {
  if (result.kind === 'ok') {
    if (result.tab === 'bots') {
      if (result.rows.length === 0) {
        return {
          ...state,
          phase: state.tab === 'bots' ? 'empty' : state.phase,
          botRows: [],
          errorMessage: null,
          errorCode: null,
          refreshing: false,
        };
      }
      return {
        ...state,
        phase: state.tab === 'bots' ? 'populated' : state.phase,
        botRows: result.rows,
        errorMessage: null,
        errorCode: null,
        refreshing: false,
      };
    }
    if (result.rows.length === 0) {
      return {
        ...state,
        phase: state.tab === 'botores' ? 'empty' : state.phase,
        botoreRows: [],
        errorMessage: null,
        errorCode: null,
        refreshing: false,
      };
    }
    return {
      ...state,
      phase: state.tab === 'botores' ? 'populated' : state.phase,
      botoreRows: result.rows,
      errorMessage: null,
      errorCode: null,
      refreshing: false,
    };
  }

  if (result.kind === 'unavailable_contract') {
    return {
      ...state,
      phase: 'unavailable_contract',
      errorMessage: result.message,
      errorCode: null,
      refreshing: false,
    };
  }

  const hasRows = state.tab === 'bots' ? state.botRows.length > 0 : state.botoreRows.length > 0;
  return {
    ...state,
    phase: hasRows ? 'populated' : 'error',
    errorMessage: result.message,
    errorCode: result.code ?? null,
    refreshing: false,
  };
}

export async function loadRankingFromPort(
  port: RankingReadPort,
  tab: RankingTab = 'bots',
): Promise<RankingLoadResult> {
  try {
    if (tab === 'botores') {
      const rows = await port.listBotores();
      return { kind: 'ok', tab: 'botores', rows: Object.freeze([...rows]) };
    }
    const rows = await port.list();
    return { kind: 'ok', tab: 'bots', rows: Object.freeze([...rows]) };
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

/** Join bot paints onto botore rows when the bot board is available. */
export function attachBotPaintsToBotoreRows(
  botoreRows: readonly BotoreRankingRow[],
  botRows: readonly RankingRow[],
): readonly BotoreRankingRow[] {
  if (botRows.length === 0) return botoreRows;
  return botoreRows.map((row) => {
    if (row.botPaints.length > 0) return row;
    const paints = botRows
      .filter((bot) => bot.botoreId === row.botoreId)
      .map((bot) => bot.portrait?.paint)
      .filter((paint): paint is string => typeof paint === 'string' && paint.length > 0);
    if (paints.length === 0) return row;
    return { ...row, botPaints: paints };
  });
}

/** Display helper: rows stay in port order; ownership cue is label-based. */
export function rankingRowAccessibilityLabel(row: RankingRow): string {
  const ownership = row.isCurrentBot ? ', your bot' : '';
  const source = row.source === 'dev-fixture' ? ', development fixture' : '';
  const name = playerFacingDisplayName(row.displayName);
  const botore = playerFacingDisplayName(row.botoreName);
  const record = `${row.wins} wins, ${row.losses} losses`;
  return `Rank ${row.rank}, ${name}, ${botore}, ${record}${ownership}${source}`;
}

export function botoreRowAccessibilityLabel(row: BotoreRankingRow): string {
  const ownership = row.isCurrentBotore ? ', you' : '';
  const source = row.source === 'dev-fixture' ? ', development fixture' : '';
  const name = playerFacingDisplayName(row.name);
  const bots = `${row.botsOwned} ${row.botsOwned === 1 ? 'bot' : 'bots'}`;
  return `Rank ${row.rank}, ${name}, ${bots}, ${row.wins} wins, ${row.losses} losses${ownership}${source}`;
}
