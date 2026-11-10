import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Public web routes (no garage) must provide SafeAreaProvider themselves —
 * ScreenChrome uses SafeAreaView and crashes with
 * "No safe area value available" when rendered outside GarageRoot / FirstRunShell.
 */
export function PublicRouteShell(props: { children: React.ReactNode }): React.ReactElement {
  return <SafeAreaProvider>{props.children}</SafeAreaProvider>;
}
