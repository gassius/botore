export { ResultOverlay } from './ResultOverlay';
export type { ResultOverlayProps } from './ResultOverlay';
export { ResultOverlayBand } from './ResultOverlayBand';
export type { ResultOverlayBandProps } from './ResultOverlayBand';
export { BACK_TO_LUDUS_LABEL, RANKING_LABEL, WATCH_AGAIN_LABEL } from './copy';
export {
  buildResultCardModel,
  botFightRecordFromRankingRow,
  formatFightsRemainingLine,
  formatRecordLine,
  formatResultContextLine,
  formatVsLine,
  resolveOutcomeKind,
} from './resultCardModel';
export type { BotFightRecordSnapshot, ResultCardModel, ResultOverlayOutcomeKind } from './types';
export { RESULT_OVERLAY_DIM_OPACITY, RESULT_PLATE_DROP_MS } from './types';
export {
  confirmedResultForResultCapture,
  parseResultCaptureScenario,
  resultCaptureRecord,
} from './designCaptureRecords';
export type { ResultCaptureScenario } from './designCaptureRecords';
export {
  E2_BOT_RANKING_RPC_ENABLED,
  fetchCurrentBotFightRecord,
} from './fetchCurrentBotFightRecord';
export { reduceResultOverlayShell } from './resultOverlayShell';
export type { ResultOverlayShellAction, ResultOverlayShellState } from './resultOverlayShell';
