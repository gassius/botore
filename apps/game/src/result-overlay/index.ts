export { ResultOverlay } from './ResultOverlay';
export type { ResultOverlayProps } from './ResultOverlay';
export { ResultOverlayBand } from './ResultOverlayBand';
export type { ResultOverlayBandProps } from './ResultOverlayBand';
export {
  buildResultCardModel,
  botFightRecordFromRankingRow,
  formatRecordLine,
  formatResultContextLine,
  formatVsLine,
  resolveOutcomeKind,
} from './resultCardModel';
export type { BotFightRecordSnapshot, ResultCardModel, ResultOverlayOutcomeKind } from './types';
export { RESULT_OVERLAY_DIM_OPACITY, RESULT_PLATE_DROP_MS } from './types';
export { parseResultCaptureScenario, resultCaptureRecord } from './designCaptureRecords';
export type { ResultCaptureScenario } from './designCaptureRecords';
export {
  E2_BOT_RANKING_RPC_ENABLED,
  fetchCurrentBotFightRecord,
} from './fetchCurrentBotFightRecord';
export { reduceResultOverlayShell } from './resultOverlayShell';
export type { ResultOverlayShellAction, ResultOverlayShellState } from './resultOverlayShell';
