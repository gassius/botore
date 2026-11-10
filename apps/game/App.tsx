import React from 'react';
import { isPublicAccountDeletePath } from './src/account/isPublicAccountDeletePath';
import { GarageRoot } from './src/garage/GarageRoot';
import { PublicAccountDeleteScreen } from './src/garage/screens/PublicAccountDeleteScreen';

/**
 * Shell owns first-run routes (`FirstRunShell`). F8 provides auth gate +
 * stable/customisation domain mounted into shell slots.
 * F9 owns fight request; F10 mounts replay/result into Replay + FightResult slots.
 * F7 BotAssembler is consumed via BotAssemblerSlot / apps/game/src/assembler.
 *
 * R5: `/account/delete` on the web export is a public deletion page (no garage).
 */
export default function App(): React.ReactElement {
  if (isPublicAccountDeletePath()) {
    return <PublicAccountDeleteScreen />;
  }
  return <GarageRoot />;
}
