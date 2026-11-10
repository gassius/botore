/**
 * Pure capture helpers only — do not re-export RN hooks here.
 * Vitest (and other Node runners) import garage/first-run modules that use
 * these helpers; pulling `react-native` through this barrel breaks unit tests.
 */
export {
  DESIGN_CAPTURE_DEV_EMAIL,
  DESIGN_CAPTURE_DEV_PASSWORD,
  DESIGN_CAPTURE_HOST,
  DESIGN_CAPTURE_SCHEME,
  LIVE_FIGHT_CAPTURE_EMAIL,
  LIVE_FIGHT_CAPTURE_PASSWORD,
  buildDesignCaptureUrl,
  designCaptureCredentials,
  isDesignCaptureEnabled,
  isDesignCaptureFailClosedEnabled,
  isLiveFightCaptureEnabled,
  listCaptureRoutes,
  parseDesignCapturePoseCompare,
  parseDesignCaptureRankingScenario,
  parseDesignCaptureSessionFailure,
  parseDesignCaptureUrl,
  readDesignCaptureConfig,
  readDesignCaptureInitialPaint,
  readDesignCaptureInitialRoute,
  readDesignCaptureInitialWeapon,
  readDesignCapturePoseCompare,
  readDesignCaptureSessionFailure,
  type DesignCaptureConfig,
  type DesignCapturePoseCompare,
  type DesignCaptureRankingScenario,
  type DesignCaptureSessionFailure,
} from './captureEnv';
