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
  isLiveFightCaptureEnabled,
  listCaptureRoutes,
  parseDesignCaptureRankingScenario,
  parseDesignCaptureUrl,
  readDesignCaptureConfig,
  readDesignCaptureInitialPaint,
  readDesignCaptureInitialRoute,
  readDesignCaptureInitialWeapon,
  type DesignCaptureConfig,
  type DesignCaptureRankingScenario,
} from './captureEnv';
