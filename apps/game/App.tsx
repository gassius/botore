import React from 'react';
import { GarageRoot } from './src/garage/GarageRoot';

/**
 * Shell owns first-run routes (`FirstRunShell`). F8 provides auth gate +
 * stable/customisation domain mounted into shell slots.
 * F7 BotAssembler is consumed via BotAssemblerSlot / apps/game/src/assembler.
 */
export default function App(): React.ReactElement {
  return <GarageRoot />;
}
