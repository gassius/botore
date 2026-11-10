import { registerRootComponent } from 'expo';
import App from './App';
import { bootstrapCrashReporting } from './src/crashReporting/bootstrap';

// R3: production / playable only when DSN+gate allow; design-capture skips Sentry load.
registerRootComponent(bootstrapCrashReporting(App));
