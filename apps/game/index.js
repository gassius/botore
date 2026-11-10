import { registerRootComponent } from 'expo';
import App from './App';
import { initCrashReporting, wrapRootComponent } from './src/crashReporting';

// R3: production / playable profiles only; no-op for local Metro without DSN.
initCrashReporting();

registerRootComponent(wrapRootComponent(App));
