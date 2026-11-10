/**
 * Named first-run routes / slots (shared-ui-rig-contract).
 * Domain screens mount into these slots — shell does not own F8–F10 logic.
 * Settings is a side surface (Garage Tag entry), not part of the fight flow.
 */
export const FIRST_RUN_ROUTES = [
  'Stable',
  'Customise',
  'Opponents',
  'ConfirmFight',
  'Replay',
  'FightResult',
  'Ranking',
  'Settings',
] as const;

export type FirstRunRoute = (typeof FIRST_RUN_ROUTES)[number];

export const ROUTE_TITLES: Record<FirstRunRoute, string> = {
  Stable: 'Stable',
  Customise: 'Customise',
  Opponents: 'Opponents',
  ConfirmFight: 'Confirm Fight',
  Replay: 'Fight Replay',
  FightResult: 'Fight Result',
  Ranking: 'Ranking',
  Settings: 'Settings',
};

/** Linear fight-loop navigation — Settings is side-entry only. */
export const ROUTE_FLOW: FirstRunRoute[] = [
  'Stable',
  'Customise',
  'Opponents',
  'ConfirmFight',
  'Replay',
  'FightResult',
  'Ranking',
];

export function nextRoute(current: FirstRunRoute): FirstRunRoute | null {
  const i = ROUTE_FLOW.indexOf(current);
  if (i < 0 || i >= ROUTE_FLOW.length - 1) return null;
  return ROUTE_FLOW[i + 1]!;
}

export function prevRoute(current: FirstRunRoute): FirstRunRoute | null {
  const i = ROUTE_FLOW.indexOf(current);
  if (i <= 0) return null;
  return ROUTE_FLOW[i - 1]!;
}

export function isFirstRunRoute(value: string): value is FirstRunRoute {
  return (FIRST_RUN_ROUTES as readonly string[]).includes(value);
}
