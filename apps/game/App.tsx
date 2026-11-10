import React from 'react';
import { isPublicAccountDeletePath } from './src/account/isPublicAccountDeletePath';
import { PublicRouteShell } from './src/account/PublicRouteShell';
import { GarageRoot } from './src/garage/GarageRoot';
import { PublicAccountDeleteScreen } from './src/garage/screens/PublicAccountDeleteScreen';
import { isPublicPrivacyPath } from './src/legal/privacyPaths';
import { PublicPrivacyPolicyScreen } from './src/legal/PublicPrivacyPolicyScreen';

/**
 * Shell owns first-run routes (`FirstRunShell`). F8 provides auth gate +
 * stable/customisation domain mounted into shell slots.
 * F9 owns fight request; F10 mounts replay/result into Replay + FightResult slots.
 * F7 BotAssembler is consumed via BotAssemblerSlot / apps/game/src/assembler.
 *
 * R5: `/account/delete` on the web export is a public deletion page (no garage).
 * R6: `/privacy` on the web export is a public privacy disclosure (no garage).
 * Public routes wrap in PublicRouteShell (SafeAreaProvider) — they never mount
 * GarageRoot, which is otherwise the only SafeAreaProvider on the tree.
 */
export default function App(): React.ReactElement {
  if (isPublicAccountDeletePath()) {
    return (
      <PublicRouteShell>
        <PublicAccountDeleteScreen />
      </PublicRouteShell>
    );
  }
  if (isPublicPrivacyPath()) {
    return (
      <PublicRouteShell>
        <PublicPrivacyPolicyScreen />
      </PublicRouteShell>
    );
  }
  return <GarageRoot />;
}
