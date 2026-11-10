/**
 * Pure session-failure helpers only — do not re-export RN components/hooks here.
 * Vitest imports these from Node; pull banners via `./SessionFailureBanner`.
 */
export {
  classifySessionFailure,
  resolveTransportFailureCode,
  type SessionFailureInput,
  type SessionFailureKind,
} from './classify';
export { SESSION_FAILURE_COPY, sessionFailureCopy, type SessionFailureCopy } from './copy';
export { resolveForcedSessionFailure } from './forcedSessionFailure';
