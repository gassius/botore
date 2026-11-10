export { bootstrapCrashReporting } from './bootstrap';
export {
  FORCED_CRASH_TEST_MESSAGE,
  forceCrashReportingTestError,
  initCrashReporting,
  isCrashReportingInitialized,
  resetCrashReportingInitForTests,
  wrapRootComponent,
} from './initCrashReporting';
export {
  isCrashReportingEnabled,
  isCrashReportingForceTestEnabled,
  readCrashReportingFlag,
  readSentryDsn,
  type CrashReportingEnableOpts,
} from './policy';
export { isSensitiveKey, scrubCrashEvent, scrubRecord, type ScrubbableEvent } from './scrub';
