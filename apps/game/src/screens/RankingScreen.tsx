import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FixtureRankingReadAdapter } from '../ranking/adapters/FixtureRankingReadAdapter';
import type { RankingReadPort } from '../ranking/RankingReadPort';
import {
  applyRankingLoadResult,
  beginRankingLoad,
  createInitialRankingSession,
  loadRankingFromPort,
  rankingRowAccessibilityLabel,
} from '../ranking/rankingSession';
import type { RankingRow, RankingSessionState } from '../ranking/types';
import {
  DevBanner,
  GarageTagBackControl,
  GarageTagButton,
  GarageTagNameplate,
  GarageTagOwnershipBadge,
  GarageTagPanel,
  GarageTagRobotHead,
  GarageTagTokens,
} from '../ui/garage-tag';

export type RankingScreenProps = {
  /** Injected read port. Defaults to DEV fixture adapter (never live). */
  port?: RankingReadPort;
  onBack?: () => void;
  /** When false, skip auto-load (tests). Default true. */
  autoLoad?: boolean;
};

/**
 * First-run Ranking slot screen (REF-03 third panel).
 * Fixture-backed scaffolding only — no client ranking algorithm.
 */
export const RankingScreen: React.FC<RankingScreenProps> = ({
  port: injectedPort,
  onBack,
  autoLoad = true,
}) => {
  const [port] = useState<RankingReadPort>(
    () => injectedPort ?? new FixtureRankingReadAdapter({ scenario: 'populated' }),
  );
  const [session, setSession] = useState<RankingSessionState>(createInitialRankingSession);

  const runLoad = useCallback(async () => {
    setSession((prev) => beginRankingLoad(prev));
    const result = await loadRankingFromPort(port);
    setSession((prev) => applyRankingLoadResult(prev, result));
  }, [port]);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void runLoad();
  }, [autoLoad, runLoad]);

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Ranking screen">
      <View style={styles.container}>
        <DevBanner />

        <GarageTagPanel style={styles.headerPanel} accessibilityLabel="Ranking">
          <Text style={styles.headerTitle}>RANKING</Text>
        </GarageTagPanel>

        <RankingBody session={session} onRetry={runLoad} />

        <View style={styles.footer}>
          <GarageTagBackControl onPress={onBack} />
        </View>
      </View>
    </SafeAreaView>
  );
};

type RankingBodyProps = {
  session: RankingSessionState;
  onRetry: () => void;
};

function RankingBody({ session, onRetry }: RankingBodyProps): React.ReactElement {
  if (session.phase === 'loading' || session.phase === 'idle') {
    return (
      <View style={styles.centerState} accessibilityLabel="Loading ranking">
        <ActivityIndicator size="large" color={GarageTagTokens.graphite} />
        <Text style={styles.stateText}>Loading ranking…</Text>
      </View>
    );
  }

  if (session.phase === 'unavailable_contract') {
    return (
      <View
        style={styles.centerState}
        accessibilityLabel="Ranking contract unavailable"
      >
        <GarageTagPanel style={styles.statusPanel}>
          <Text style={styles.stateTitle}>RANKING UNAVAILABLE</Text>
          <Text style={styles.stateText}>
            {session.errorMessage ??
              'Authoritative ranking read contract is not available yet.'}
          </Text>
        </GarageTagPanel>
        {session.rows.length > 0 ? (
          <RankingList rows={session.rows} refreshing={false} />
        ) : null}
      </View>
    );
  }

  if (session.phase === 'error' && session.rows.length === 0) {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking failed to load">
        <GarageTagPanel style={styles.statusPanel}>
          <Text style={styles.stateTitle}>COULD NOT LOAD</Text>
          <Text style={styles.stateText}>{session.errorMessage ?? 'Unknown error'}</Text>
        </GarageTagPanel>
        <GarageTagButton
          label="Retry"
          variant="primary"
          onPress={onRetry}
          accessibilityHint="Reload development ranking fixtures"
        />
      </View>
    );
  }

  if (session.phase === 'empty') {
    return (
      <View style={styles.centerState} accessibilityLabel="Ranking is empty">
        <GarageTagPanel style={styles.statusPanel}>
          <Text style={styles.stateTitle}>NO RANKINGS YET</Text>
          <Text style={styles.stateText}>
            DEV fixture returned an empty list. Live ranking remains blocked.
          </Text>
        </GarageTagPanel>
        <GarageTagButton label="Retry" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  // populated (possibly with refresh error banner)
  return (
    <View style={styles.listWrap}>
      {session.errorMessage ? (
        <GarageTagPanel style={styles.errorBanner} accessibilityLabel="Ranking refresh failed">
          <Text style={styles.stateTitle}>REFRESH FAILED</Text>
          <Text style={styles.stateText}>{session.errorMessage}</Text>
          <Text style={styles.stateHint}>Showing last readable rows.</Text>
          <GarageTagButton label="Retry" variant="primary" onPress={onRetry} />
        </GarageTagPanel>
      ) : null}
      {session.refreshing ? (
        <Text style={styles.refreshHint} accessibilityLabel="Refreshing ranking">
          Refreshing…
        </Text>
      ) : null}
      <RankingList rows={session.rows} refreshing={session.refreshing} />
      {!session.errorMessage ? (
        <GarageTagButton
          label="Refresh"
          variant="secondary"
          onPress={onRetry}
          accessibilityHint="Reload ranking from the read adapter"
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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      accessibilityLabel="Ranking list"
      accessibilityState={{ busy: refreshing }}
    >
      {rows.map((row, index) => (
        <RankingRowView key={`${row.botId}-${index}`} row={row} />
      ))}
    </ScrollView>
  );
}

function RankingRowView({ row }: { row: RankingRow }): React.ReactElement {
  return (
    <GarageTagPanel
      highlighted={row.isCurrentBot}
      accessibilityLabel={rankingRowAccessibilityLabel(row)}
      style={styles.row}
    >
      <Text style={styles.rankNumber} accessibilityLabel={`Rank ${row.rank}`}>
        {row.rank}
      </Text>
      <GarageTagRobotHead />
      <View style={styles.rowIdentity}>
        <View style={styles.nameRow}>
          <GarageTagNameplate name={row.displayName} />
          {row.isCurrentBot ? <GarageTagOwnershipBadge /> : null}
        </View>
        <Text style={styles.sourceLabel}>DEV fixture</Text>
      </View>
    </GarageTagPanel>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: GarageTagTokens.cream,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  headerPanel: {
    alignItems: 'center',
  },
  headerTitle: {
    color: GarageTagTokens.graphite,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  statusPanel: {
    alignSelf: 'stretch',
    gap: 8,
  },
  stateTitle: {
    color: GarageTagTokens.graphite,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  stateText: {
    color: GarageTagTokens.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  stateHint: {
    color: GarageTagTokens.mutedText,
    fontSize: 13,
    marginBottom: 8,
  },
  listWrap: {
    flex: 1,
    gap: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: GarageTagTokens.minTouch,
  },
  rankNumber: {
    width: 36,
    color: GarageTagTokens.graphite,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginRight: 4,
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sourceLabel: {
    marginTop: 2,
    color: GarageTagTokens.mutedText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  errorBanner: {
    gap: 8,
    backgroundColor: GarageTagTokens.errorBg,
  },
  refreshHint: {
    color: GarageTagTokens.mutedText,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 4,
  },
});
