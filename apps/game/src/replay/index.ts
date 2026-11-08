/** Headless-safe replay helpers. UI player: `./CanonicalReplayPlayer`. */
export {
  confirmedResultFromDevReplay,
  confirmedResultFromFightResponse,
  formatOutcomeLine,
  resolvePlaybackMedia,
} from './confirmedResult';
export type {
  ConfirmedFightResult,
  HistoricalMediaVersions,
  ResultSource,
} from './confirmedResult';
export { loadDevGoldenConfirmedResult, replayIdentityFingerprint } from './loadDevReplay';
export { applyAnimationCommand, initialPresentationState, normalizeHpAfter } from './playbackState';
export type { ReplayPresentationState } from './playbackState';
export { loadoutFromFighter } from './fighterLoadout';
