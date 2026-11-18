/**
 * Single source for the home chrome title (Ludus) and the result-overlay continue label.
 * D5 owns the rename; E5 wires navigation to this constant so both stay in sync.
 */
export const STABLE_HOME_TITLE = 'Ludus';

export const BACK_TO_STABLE_LABEL = `Back to ${STABLE_HOME_TITLE}`;

/** In-app path to account deletion (More sheet) — use in privacy / public delete copy. */
export const LUDUS_DELETE_ACCOUNT_PATH = `${STABLE_HOME_TITLE} → More → Delete account`;
