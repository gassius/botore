/** Headless-safe replay helpers. UI player: `./CanonicalReplayPlayer`. */
export {
  confirmedResultFromDevReplay,
  confirmedResultFromFightResponse,
  confirmedResultFromFightSuccess,
  ConfirmedResultIntegrityError,
  formatOutcomeLine,
  resolvePlaybackMedia,
} from './confirmedResult';
export type {
  ConfirmedFightResult,
  HistoricalMediaVersions,
  PlaybackMediaResolution,
  ResultSource,
} from './confirmedResult';
export { loadDevGoldenConfirmedResult, replayIdentityFingerprint } from './loadDevReplay';
export { applyAnimationCommand, initialPresentationState, normalizeHpAfter } from './playbackState';
export type { ReplayPresentationState } from './playbackState';
export {
  assemblerLoadoutFromBuild,
  loadoutFromFighter,
  sealedBuildsForDevReplay,
  weaponIdFromKind,
} from './fighterLoadout';
export type { SealedBotBuild, SealedFightBuilds } from './fighterLoadout';
export {
  isServerPlaybackReady,
  resolveFirstRunConfirmedResult,
  resolveSessionConfirmedResult,
  tryConfirmedResultFromFight,
} from './resolveSessionResult';
export type { FirstRunResultBlockReason, FirstRunResultResolution } from './serverPlayback';
export {
  initialPlaybackUi,
  pauseState,
  playbackUiAfterAdvance,
  progressFromPosition,
  restartState,
  resumeState,
  togglePlayState,
} from './playbackControl';
export type { PlaybackUiState } from './playbackControl';
export {
  DEFAULT_REPLAY_CHROME,
  replayContentFits,
  reservedReplayChromeHeight,
  stageViewportFromPlayer,
} from './replayLayout';
export {
  FX_CAPTURE_FAMILIES,
  FX_CAPTURE_HOLD_MS,
  completeFxCaptureHold,
  countFxEvents,
  countFxEventsFromReplay,
  eventsFromFightReplay,
  formatArenaReadyLog,
  formatFxCaptureLog,
  fxFamilyFromAnimationCommand,
  initialFxCaptureHoldState,
  noteFxCaptureCue,
} from './fxCaptureHold';
export type { FxCaptureFamily, FxCaptureHoldState } from './fxCaptureHold';
// UI: import FightResultContent / CanonicalReplayPlayer from their files (RN).
