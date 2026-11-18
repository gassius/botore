import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTrialUiAudio } from '../audio/useTrialUiAudio';
import type { DesignCaptureRankingScenario } from '../design-capture/captureEnv';
import { playerFacingDisplayName } from '../identity/platformPlayerId';
import { BotoreEmblem } from '../ranking/BotoreEmblem';
import { createRankingReadClient } from '../ranking/createRankingReadClient';
import { RankingPortrait } from '../ranking/RankingPortrait';
import type { RankingReadPort } from '../ranking/RankingReadPort';
import { createRankingLoadController } from '../ranking/rankingLoadController';
import {
  attachBotPaintsToBotoreRows,
  botoreRowAccessibilityLabel,
  createInitialRankingSession,
  rankingRowAccessibilityLabel,
  selectRankingTab,
} from '../ranking/rankingSession';
import { RANKING_SCREEN_CHROME_SCROLL } from '../ranking/rankingScrollContract';
import type {
  BotoreRankingRow,
  RankingRow,
  RankingSessionState,
  RankingTab,
} from '../ranking/types';
import {
  GaragePanel,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  SecondaryButton,
  StatusErrorBanner,
  garageTag,
} from '../garage-tag';
import { classifySessionFailure, sessionFailureCopy } from '../session-failure';
import { SessionFailureBanner } from '../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../session-failure/useForcedSessionFailure';

export type RankingScreenProps = {
  /** Injected read port. Defaults to createRankingReadClient. */
  port?: RankingReadPort;
  /** Access token for E2 ranking RPCs when port is not injected. */
  accessToken?: string | null;
  /** Design-capture empty/error/offline/auth-expired override. */
  captureScenario?: DesignCaptureRankingScenario | null;
  onBack?: () => void;
  /** Auth-expired action — typically sign out + silent re-auth (C10/C12). */
  onSignInAgain?: () => void;
  /** When false, skip auto-load (tests). Default true. */
  autoLoad?: boolean;
  /** Initial tab (tests / captures). Default bots. */
  initialTab?: RankingTab;
};

const RANKING_TABS: readonly { id: RankingTab; label: string }[] = [
  { id: 'bots', label: 'Bots' },
  { id: 'botores', label: 'Botores' },
];

/**
 * Ranking screen (D4): BOTS | BOTORES tabs, portraits / emblems, W–L, pull-to-refresh.
 * Rows from E2 `list_bot_ranking` / `list_botore_ranking` — no client ranking algorithm.
 *
 * Scroll owner: ScreenChrome body ScrollView (`RANKING_SCREEN_CHROME_SCROLL`).
 * Header back only — no footer Back to Stable / Refresh button / status chrome.
 */
export const RankingScreen: React.FC<RankingScreenProps> = ({
  port: injectedPort,
  accessToken = null,
  captureScenario = null,
  onBack,
  onSignInAgain,
  autoLoad = true,
  initialTab = 'bots',
}) => {
  const forced = useForcedSessionFailure();
  const uiAudio = useTrialUiAudio({ muted: false });
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
  const [session, setSession] = useState<RankingSessionState>(() =>
    createInitialRankingSession(initialTab),
  );
  const setSessionRef = useRef(setSession);
  setSessionRef.current = setSession;

  const controller = useMemo(
    () =>
      createRankingLoadController(
        port,
        (updater) => {
          setSessionRef.current(updater);
        },
        initialTab,
      ),
    [port, initialTab],
  );

  useEffect(() => {
    setSession(createInitialRankingSession(initialTab));
    if (!autoLoad) {
      return () => {
        controller.dispose();
      };
    }
    void controller.load(initialTab);
    return () => {
      controller.dispose();
    };
  }, [autoLoad, controller, initialTab]);

  const loadBusy = session.phase === 'loading' || session.phase === 'idle' || session.refreshing;

  const onSelectTab = (tab: RankingTab) => {
    uiAudio.playCue('uiTab');
    setSession((prev) => selectRankingTab(prev, tab));
    const cached = tab === 'bots' ? session.botRows.length > 0 : session.botoreRows.length > 0;
    if (!cached) {
      void controller.load(tab);
    }
  };

  const refreshControl = (
    <RefreshControl
      refreshing={session.refreshing}
      onRefresh={() => {
        uiAudio.playUiTap();
        void controller.load(session.tab);
      }}
      tintColor={garageTag.graphite}
      colors={[garageTag.mustard]}
      progressBackgroundColor={garageTag.cream}
    />
  );

  return (
    <ScreenChrome
      testID="slot-ranking"
      scroll={RANKING_SCREEN_CHROME_SCROLL}
      refreshControl={refreshControl}
    >
      <ScreenHeader
        title="Ranking"
        {...(onBack
          ? {
              onBack: () => {
                uiAudio.playCue('uiBack');
                onBack();
              },
            }
          : {})}
        testID="ranking-header"
      />
      <RankingTabStrip selected={session.tab} onSelect={onSelectTab} />
      <RankingBody
        session={session}
        onRetry={() => void controller.load(session.tab)}
        onSignInAgain={() => {
          onSignInAgain?.();
        }}
        loadBusy={loadBusy}
        forcedFailure={forced}
      />
    </ScreenChrome>
  );
};

function RankingTabStrip({
  selected,
  onSelect,
}: {
  selected: RankingTab;
  onSelect: (tab: RankingTab) => void;
}): React.ReactElement {
  return (
    <View style={styles.tabs} accessibilityRole="tablist" testID="ranking-tabs">
      {RANKING_TABS.map((tab, index) => {
        const on = tab.id === selected;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${tab.label}${on ? ', selected' : ''}`}
            onPress={() => onSelect(tab.id)}
            hitSlop={{ top: 2, bottom: 2, left: 0, right: 0 }}
            style={[
              styles.tab,
              on ? styles.tabOn : styles.tabOff,
              index > 0 ? styles.tabDivider : null,
            ]}
            testID={`ranking-tab-${tab.id}`}
          >
            <Text style={[styles.tabLabel, on ? styles.tabLabelOn : null]} allowFontScaling>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
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
      </View>
    );
  }

  if (failureKind && (forcedFailure || (session.phase === 'error' && activeRowsEmpty(session)))) {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking session failure">
        <SessionFailureBanner kind={failureKind} testID={`ranking-session-${failureKind}`} />
        <PrimaryButton
          label={sessionFailureCopy(failureKind).actionLabel}
          onPress={runFailureAction}
          disabled={loadBusy && failureKind !== 'auth_expired'}
          testID="ranking-retry"
        />
      </View>
    );
  }

  if (session.phase === 'error' && activeRowsEmpty(session)) {
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
            {session.tab === 'botores'
              ? 'No botores are on the board yet. Fight to earn wins and appear here.'
              : 'No bots are on the board yet. Fight to earn XP and appear here.'}
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

  const botoreRows = attachBotPaintsToBotoreRows(session.botoreRows, session.botRows);

  return (
    <View style={styles.listWrap} testID="ranking-body-populated">
      {session.errorMessage ? (
        <View style={styles.refreshError} testID="ranking-refresh-failed">
          {failureKind ? (
            <SessionFailureBanner kind={failureKind} testID={`ranking-session-${failureKind}`} />
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
      {session.tab === 'bots' ? (
        <BotRankingList rows={session.botRows} refreshing={session.refreshing} />
      ) : (
        <BotoreRankingList rows={botoreRows} refreshing={session.refreshing} />
      )}
    </View>
  );
}

function activeRowsEmpty(session: RankingSessionState): boolean {
  return session.tab === 'bots' ? session.botRows.length === 0 : session.botoreRows.length === 0;
}

function BotRankingList({
  rows,
  refreshing,
}: {
  rows: readonly RankingRow[];
  refreshing: boolean;
}): React.ReactElement {
  return (
    <View
      style={styles.list}
      accessibilityLabel="Bot ranking list"
      accessibilityState={{ busy: refreshing }}
      testID="ranking-list"
    >
      {rows.map((row, index) => (
        <BotRankingRowView key={`${row.botId}-${index}`} row={row} />
      ))}
    </View>
  );
}

function BotoreRankingList({
  rows,
  refreshing,
}: {
  rows: readonly BotoreRankingRow[];
  refreshing: boolean;
}): React.ReactElement {
  return (
    <View
      style={styles.list}
      accessibilityLabel="Botore ranking list"
      accessibilityState={{ busy: refreshing }}
      testID="ranking-botore-list"
    >
      {rows.map((row, index) => (
        <BotoreRankingRowView key={`${row.botoreId}-${index}`} row={row} />
      ))}
    </View>
  );
}

function BotRankingRowView({ row }: { row: RankingRow }): React.ReactElement {
  const topThree = row.rank <= 3;
  const botName = playerFacingDisplayName(row.displayName);
  const botoreName = playerFacingDisplayName(row.botoreName);
  return (
    <View
      style={[styles.row, row.isCurrentBot ? styles.rowYou : null, topThree ? styles.rowTop : null]}
      testID={`ranking-row-${row.botId}`}
    >
      <View style={styles.rowInner} accessibilityLabel={rankingRowAccessibilityLabel(row)}>
        <Text
          style={[styles.rankNumber, topThree ? styles.rankTop : null]}
          accessibilityLabel={`Rank ${row.rank}`}
          allowFontScaling
        >
          {row.rank}
        </Text>
        <RankingPortrait
          paintId={row.portrait?.paint ?? null}
          size={46}
          testID={`ranking-portrait-${row.botId}`}
        />
        <View style={styles.rowIdentity}>
          <Text style={styles.botName} numberOfLines={1} allowFontScaling>
            {botName}
          </Text>
          <View style={styles.nameRow}>
            <Text style={styles.botoreName} numberOfLines={1} allowFontScaling>
              {botoreName}
            </Text>
            {row.isCurrentBot ? (
              <Text style={styles.youTag} allowFontScaling>
                YOU
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.stats}>
          <Text style={styles.wl} allowFontScaling>
            {row.wins}–{row.losses}
            <Text style={styles.wlHint}> W–L</Text>
          </Text>
          <Text style={styles.xp} allowFontScaling>
            {row.totalXp} XP
          </Text>
        </View>
      </View>
    </View>
  );
}

function BotoreRankingRowView({ row }: { row: BotoreRankingRow }): React.ReactElement {
  const topThree = row.rank <= 3;
  const name = playerFacingDisplayName(row.name);
  const botsLabel = `${row.botsOwned} ${row.botsOwned === 1 ? 'bot' : 'bots'}`;
  return (
    <View
      style={[
        styles.row,
        row.isCurrentBotore ? styles.rowYou : null,
        topThree ? styles.rowTop : null,
      ]}
      testID={`ranking-botore-row-${row.botoreId}`}
    >
      <View style={styles.rowInner} accessibilityLabel={botoreRowAccessibilityLabel(row)}>
        <Text
          style={[styles.rankNumber, topThree ? styles.rankTop : null]}
          accessibilityLabel={`Rank ${row.rank}`}
          allowFontScaling
        >
          {row.rank}
        </Text>
        <BotoreEmblem
          name={name}
          emblemId={row.emblemId}
          testID={`ranking-emblem-${row.botoreId}`}
        />
        <View style={styles.rowIdentity}>
          <View style={styles.nameRow}>
            <Text style={styles.botName} numberOfLines={1} allowFontScaling>
              {name}
            </Text>
            {row.isCurrentBotore ? (
              <Text style={styles.youTag} allowFontScaling>
                YOU
              </Text>
            ) : null}
          </View>
          <View style={styles.botoreMeta}>
            <Text style={styles.botoreName} allowFontScaling>
              {botsLabel}
            </Text>
            <View style={styles.miniHeads} accessible={false}>
              {row.botPaints.slice(0, 3).map((paint, i) => (
                <View
                  key={`${paint}-${i}`}
                  style={[styles.miniHead, i > 0 ? styles.miniHeadOverlap : null]}
                >
                  <RankingPortrait
                    paintId={paint}
                    size={20}
                    testID={`ranking-mini-${row.botoreId}-${i}`}
                  />
                </View>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.stats}>
          <Text style={styles.wl} allowFontScaling>
            {row.wins}–{row.losses}
            <Text style={styles.wlHint}> W–L</Text>
          </Text>
          <Text style={styles.xp} allowFontScaling>
            total
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 2,
    minHeight: garageTag.touchMin,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 9,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    minHeight: garageTag.touchMin - 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDivider: {
    borderLeftWidth: 3,
    borderLeftColor: garageTag.graphite,
  },
  tabOn: {
    backgroundColor: garageTag.mustard,
  },
  tabOff: {
    backgroundColor: garageTag.cream,
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  tabLabelOn: {
    color: garageTag.graphite,
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
    gap: 6,
  },
  row: {
    minHeight: 60,
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    borderRadius: 8,
    backgroundColor: garageTag.white,
    paddingLeft: 6,
    paddingRight: 12,
    justifyContent: 'center',
  },
  rowTop: {},
  rowYou: {
    backgroundColor: garageTag.mustard,
    borderWidth: 3,
    shadowColor: garageTag.graphite,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankNumber: {
    width: 26,
    color: garageTag.graphite,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  rankTop: {
    color: garageTag.oxide,
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  botName: {
    color: garageTag.graphite,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  botoreName: {
    color: '#6b6356',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  youTag: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    backgroundColor: garageTag.graphite,
    color: garageTag.mustard,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  botoreMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  miniHeads: {
    flexDirection: 'row',
    marginLeft: 6,
    alignItems: 'center',
  },
  miniHead: {
    transform: [{ scale: 0.95 }],
  },
  miniHeadOverlap: {
    marginLeft: -4,
  },
  stats: {
    alignItems: 'flex-end',
  },
  wl: {
    fontSize: 16,
    fontWeight: '900',
    color: garageTag.graphite,
  },
  wlHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6b6356',
  },
  xp: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b6356',
  },
  refreshError: {
    gap: 8,
  },
});
