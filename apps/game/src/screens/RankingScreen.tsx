import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import type { DesignCaptureRankingScenario } from '../design-capture/captureEnv';
import { createRankingReadClient } from '../ranking/createRankingReadClient';
import type { RankingReadPort } from '../ranking/RankingReadPort';
import { createRankingLoadController } from '../ranking/rankingLoadController';
import {
  createInitialRankingSession,
  rankingRowAccessibilityLabel,
} from '../ranking/rankingSession';
import { RANKING_SCREEN_CHROME_SCROLL } from '../ranking/rankingScrollContract';
import type { RankingRow, RankingSessionState } from '../ranking/types';
import {
  GaragePanel,
  Nameplate,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  SecondaryButton,
  StatusErrorBanner,
  garageTag,
  uiKitAssets,
} from '../garage-tag';
import { DomainNote } from '../first-run/slots/DomainNote';
import { classifySessionFailure, sessionFailureCopy } from '../session-failure';
import { SessionFailureBanner } from '../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../session-failure/useForcedSessionFailure';

export type RankingScreenProps = {
  /** Injected read port. Defaults to createRankingReadClient. */
  port?: RankingReadPort;
  /** Access token for live list_ranking when port is not injected. */
  accessToken?: string | null;
  /** Design-capture empty/error/offline/auth-expired override. */
  captureScenario?: DesignCaptureRankingScenario | null;
  onBack?: () => void;
  /** Auth-expired action — typically sign out + silent re-auth (C10/C12). */
  onSignInAgain?: () => void;
  /** When false, skip auto-load (tests). Default true. */
  autoLoad?: boolean;
};

/**
 * First-run Ranking screen (REF-03). Uses shell Garage Tag exports.
 * Live rows from `list_ranking`; no client ranking algorithm.
 *
 * Scroll owner: ScreenChrome body ScrollView (`RANKING_SCREEN_CHROME_SCROLL`).
 * Footer Back stays outside the scroll region.
 */
export const RankingScreen: React.FC<RankingScreenProps> = ({
  port: injectedPort,
  accessToken = null,
  captureScenario = null,
  onBack,
  onSignInAgain,
  autoLoad = true,
}) => {
  const forced = useForcedSessionFailure();
  const effectiveScenario =
    captureScenario ?? (forced === 'offline' || forced === 'auth_expired' ? forced : null);
  const port = useMemo(
    () =>
      injectedPort ??
      createRankingReadClient({
        accessToken,
        captureScenario: effectiveScenario,
      }),
    [injectedPort, accessToken, effectiveScenario],
  );
  const [session, setSession] = useState<RankingSessionState>(createInitialRankingSession);
  const setSessionRef = useRef(setSession);
  setSessionRef.current = setSession;

  const controller = useMemo(
    () =>
      createRankingLoadController(port, (updater) => {
        setSessionRef.current(updater);
      }),
    [port],
  );

  useEffect(() => {
    // Reset when the port changes (live ↔ capture empty/error) so stills do not
    // briefly show the previous board under a new scenario.
    setSession(createInitialRankingSession());
    if (!autoLoad) {
      return () => {
        controller.dispose();
      };
    }
    void controller.load();
    // Dispose the previous controller when token/scenario/port changes so a
    // slow live load cannot overwrite empty/error (or a refreshed token).
    return () => {
      controller.dispose();
    };
  }, [autoLoad, controller]);

  const loadBusy = session.phase === 'loading' || session.phase === 'idle' || session.refreshing;
  const showingLive = session.rows.some((row) => row.source === 'live');
  const showingDev = session.rows.some((row) => row.source === 'dev-fixture');

  const footer = onBack ? (
    <PrimaryButton label="Back to stable" onPress={onBack} testID="ranking-back" />
  ) : undefined;

  return (
    <ScreenChrome
      testID="slot-ranking"
      scroll={RANKING_SCREEN_CHROME_SCROLL}
      {...(footer ? { footer } : {})}
    >
      <ScreenHeader title="Ranking" {...(onBack ? { onBack } : {})} testID="ranking-header" />
      {showingDev ? <DevFixtureBanner /> : null}
      <RankingBody
        session={session}
        onRetry={() => void controller.load()}
        onSignInAgain={() => {
          onSignInAgain?.();
        }}
        loadBusy={loadBusy}
        forcedFailure={forced}
      />
      <DomainNote
        text={
          showingLive
            ? 'Domain: list_ranking (progression XP). Server order preserved.'
            : 'Domain: RankingReadPort. DEV fixtures when live ranking is unavailable.'
        }
      />
    </ScreenChrome>
  );
};

function DevFixtureBanner(): React.ReactElement {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="Development ranking fixtures, not live players"
      style={styles.devBanner}
      testID="ranking-dev-banner"
    >
      <Text style={styles.devBannerText} allowFontScaling>
        DEV FIXTURES — NOT LIVE PLAYERS
      </Text>
    </View>
  );
}

type RankingBodyProps = {
  session: RankingSessionState;
  onRetry: () => void;
  onSignInAgain: () => void;
  loadBusy: boolean;
  forcedFailure: 'offline' | 'auth_expired' | null;
};

function RankingBody({
  session,
  onRetry,
  onSignInAgain,
  loadBusy,
  forcedFailure,
}: RankingBodyProps): React.ReactElement {
  const classified = classifySessionFailure({
    code: session.errorCode,
    message: session.errorMessage,
  });
  const failureKind =
    forcedFailure ??
    (classified === 'offline' || classified === 'auth_expired' ? classified : null);

  const runFailureAction = () => {
    if (failureKind === 'auth_expired') {
      onSignInAgain();
      return;
    }
    onRetry();
  };

  if (session.phase === 'loading' || session.phase === 'idle') {
    return (
      <View style={styles.centerState} accessibilityLabel="Loading ranking">
        <ActivityIndicator size="large" color={garageTag.graphite} />
        <Text style={styles.stateText} allowFontScaling>
          Loading ranking…
        </Text>
      </View>
    );
  }

  if (session.phase === 'unavailable_contract') {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking contract unavailable">
        <StatusErrorBanner
          title="Ranking unavailable"
          detail={
            session.errorMessage ?? 'Authoritative ranking read contract is not available yet.'
          }
          testID="ranking-unavailable"
        />
        {session.rows.length > 0 ? <RankingList rows={session.rows} refreshing={false} /> : null}
      </View>
    );
  }

  // Network / auth failures never look like an empty "no rankings" board.
  if (failureKind && (forcedFailure || (session.phase === 'error' && session.rows.length === 0))) {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking session failure">
        <SessionFailureBanner
          kind={failureKind}
          {...(session.errorMessage ? { detail: session.errorMessage } : {})}
          testID={`ranking-session-${failureKind}`}
        />
        <PrimaryButton
          label={sessionFailureCopy(failureKind).actionLabel}
          onPress={runFailureAction}
          disabled={loadBusy && failureKind !== 'auth_expired'}
          testID="ranking-retry"
        />
      </View>
    );
  }

  if (session.phase === 'error' && session.rows.length === 0) {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking failed to load">
        <StatusErrorBanner
          title="Could not load"
          detail={session.errorMessage ?? 'Unknown error'}
          testID="ranking-error"
        />
        <PrimaryButton label="Retry" onPress={onRetry} disabled={loadBusy} testID="ranking-retry" />
      </View>
    );
  }

  if (session.phase === 'empty') {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking is empty">
        <GaragePanel rivets={false} style={styles.statusPanel} testID="ranking-empty">
          <Text style={styles.stateTitle} allowFontScaling>
            No rankings yet
          </Text>
          <Text style={styles.stateText} allowFontScaling>
            No player bots are on the board yet. Fight to earn XP and appear here.
          </Text>
        </GaragePanel>
        <SecondaryButton
          label="Retry"
          onPress={onRetry}
          disabled={loadBusy}
          testID="ranking-empty-retry"
        />
      </View>
    );
  }

  return (
    <View style={styles.listWrap} testID="ranking-body-populated">
      {session.errorMessage ? (
        <View style={styles.refreshError} testID="ranking-refresh-failed">
          {failureKind ? (
            <SessionFailureBanner
              kind={failureKind}
              detail={session.errorMessage}
              testID={`ranking-session-${failureKind}`}
            />
          ) : (
            <StatusErrorBanner title="Refresh failed" detail={session.errorMessage} />
          )}
          <Text style={styles.stateHint} allowFontScaling>
            Showing last readable rows.
          </Text>
          <PrimaryButton
            label={failureKind ? sessionFailureCopy(failureKind).actionLabel : 'Retry'}
            onPress={runFailureAction}
            disabled={loadBusy && failureKind !== 'auth_expired'}
            testID="ranking-refresh-retry"
          />
        </View>
      ) : null}
      {session.refreshing ? (
        <Text style={styles.refreshHint} accessibilityLabel="Refreshing ranking" allowFontScaling>
          Refreshing…
        </Text>
      ) : null}
      <RankingList rows={session.rows} refreshing={session.refreshing} />
      {!session.errorMessage ? (
        <SecondaryButton
          label="Refresh"
          onPress={onRetry}
          disabled={loadBusy}
          testID="ranking-refresh"
        />
      ) : null}
    </View>
  );
}

type RankingListProps = {
  rows: readonly RankingRow[];
  refreshing: boolean;
};

function RankingList({ rows, refreshing }: RankingListProps): React.ReactElement {
  return (
    <View
      style={styles.list}
      accessibilityLabel="Ranking list"
      accessibilityState={{ busy: refreshing }}
      testID="ranking-list"
    >
      {rows.map((row, index) => (
        <RankingRowView key={`${row.botId}-${index}`} row={row} />
      ))}
    </View>
  );
}

function RankingRowView({ row }: { row: RankingRow }): React.ReactElement {
  const sourceLabel = row.source === 'live' ? 'Live' : 'DEV fixture';
  return (
    <GaragePanel
      rivets={false}
      style={[styles.row, row.isCurrentBot ? styles.rowCurrent : null]}
      testID={`ranking-row-${row.botId}`}
    >
      <View style={styles.rowInner} accessibilityLabel={rankingRowAccessibilityLabel(row)}>
        <Text style={styles.rankNumber} accessibilityLabel={`Rank ${row.rank}`} allowFontScaling>
          {row.rank}
        </Text>
        <Image
          source={uiKitAssets.robotHeadSmall}
          style={styles.robotHead}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <View style={styles.rowIdentity}>
          <Nameplate
            name={row.displayName}
            {...(row.isCurrentBot ? { badge: 'YOU' } : {})}
            style={styles.nameplate}
            testID={`ranking-name-${row.botId}`}
          />
          <Text style={styles.sourceLabel} allowFontScaling>
            {typeof row.totalXp === 'number' ? `${sourceLabel} · ${row.totalXp} XP` : sourceLabel}
          </Text>
        </View>
      </View>
    </GaragePanel>
  );
}

const styles = StyleSheet.create({
  devBanner: {
    backgroundColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  devBannerText: {
    color: garageTag.mustard,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  centerState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  statusPanel: {
    alignSelf: 'stretch',
  },
  stateTitle: {
    color: garageTag.graphite,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  stateText: {
    color: garageTag.steel,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  stateHint: {
    color: garageTag.steel,
    fontSize: 13,
    fontWeight: '600',
  },
  listWrap: {
    gap: 10,
  },
  list: {
    gap: 10,
  },
  row: {
    minHeight: garageTag.touchMin,
  },
  rowCurrent: {
    borderColor: garageTag.mustard,
    borderWidth: 4,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankNumber: {
    width: 36,
    color: garageTag.graphite,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginRight: 4,
  },
  robotHead: {
    width: 44,
    height: 44,
    marginRight: 10,
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameplate: {
    alignSelf: 'stretch',
  },
  sourceLabel: {
    color: garageTag.steel,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  refreshError: {
    gap: 8,
  },
  refreshHint: {
    color: garageTag.steel,
    fontSize: 13,
    fontWeight: '600',
  },
});
