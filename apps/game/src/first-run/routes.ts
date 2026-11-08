/**
 * Named first-run routes / slots (shared-ui-rig-contract).
 * Domain screens mount into these slots — shell does not own F8–F10 logic.
 */
export const FIRST_RUN_ROUTES = [
  'Stable',
  'Customise',
  'Opponents',
  'ConfirmFight',
  'Replay',
  'FightResult',
  'Ranking',
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
};

/** Linear demo navigation order for the overnight shell. */
export const ROUTE_FLOW: FirstRunRoute[] = [...FIRST_RUN_ROUTES];

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
