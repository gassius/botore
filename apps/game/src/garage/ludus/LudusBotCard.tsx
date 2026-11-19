import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { resolvePaintVisual } from '../../assembler/paints';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { garageTag, paintSwatchSource, weaponGlyphSource } from '../../garage-tag';
import { LUDUS_BOT_CAROUSEL } from '../../garage-tag/snap';
import {
  paintDisplayLabel,
  paintUiAlias,
  weaponDisplayLabel,
  weaponUiAlias,
} from '../loadout/proofCatalogue';
import type { OwnedBotSummary } from '../loadout/loadoutTypes';

export type LudusBotCardProps = {
  readonly bot: OwnedBotSummary;
  readonly testID?: string;
};

/**
 * D5 Ludus bot card — 358×400, ACTIVE tag, name, W–L, paint/weapon chips.
 * Never shows character ids (C17).
 */
function LudusBotCardImpl({ bot, testID }: LudusBotCardProps): React.ReactElement {
  const paint = bot.paint ?? 'paint-crimson';
  const weapon = bot.weapon ?? 'weapon-sword';
  const paintVisual = resolvePaintVisual(paint);
  const paintAlias = paintUiAlias(paint);
  const weaponAlias = weaponUiAlias(weapon);
  const swatch = paintSwatchSource(paintAlias);
  const glyph = weaponGlyphSource(weaponAlias);
  const a11yLabel = `${bot.displayName}${bot.isActive ? ', active bot' : ''}, ${bot.wins} wins, ${bot.losses} losses`;

  return (
    <View
      style={styles.card}
      testID={testID ?? 'ludus-bot-card'}
      accessible
      accessibilityLabel={a11yLabel}
    >
      {bot.isActive ? (
        <View style={styles.activeTag} testID="ludus-active-tag">
          <Text style={styles.activeTagText} allowFontScaling>
            Active bot
          </Text>
        </View>
      ) : null}
      <View style={styles.stage}>
        <BotAssemblerSlot
          loadout={{
            chassisId: 'chassis-basic',
            paintId: paint,
            weaponId: weapon,
            ...(bot.head ? { head: bot.head } : {}),
            ...(bot.body ? { body: bot.body } : {}),
            ...(bot.arms ? { arms: bot.arms } : {}),
            ...(bot.legs ? { legs: bot.legs } : {}),
          }}
          facing="right"
          paintId={paint}
          weaponId={weapon}
          motionPose="idle"
          size={200}
          label={bot.displayName}
          testID="ludus-bot-assembler"
        />
      </View>
      <Text style={styles.name} numberOfLines={1} allowFontScaling testID="ludus-bot-name">
        {bot.displayName}
      </Text>
      <Text style={styles.record} allowFontScaling testID="ludus-bot-record">
        {bot.wins}W – {bot.losses}L
      </Text>
      <View style={styles.chips}>
        <View style={styles.chip} testID="ludus-paint-chip">
          {swatch ? (
            <Image source={swatch} style={styles.swatchImg} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.swatchDot, { backgroundColor: paintVisual.armourColor }]} />
          )}
          <Text style={styles.chipLabel} numberOfLines={1} allowFontScaling>
            {paintDisplayLabel(paint)}
          </Text>
        </View>
        <View style={styles.chip} testID="ludus-weapon-chip">
          <Image source={glyph} style={styles.glyphImg} accessibilityIgnoresInvertColors />
          <Text style={styles.chipLabel} numberOfLines={1} allowFontScaling>
            {weaponDisplayLabel(weapon)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export const LudusBotCard = memo(LudusBotCardImpl);

const styles = StyleSheet.create({
  card: {
    width: LUDUS_BOT_CAROUSEL.cardWidth,
    height: LUDUS_BOT_CAROUSEL.cardHeight,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 12,
    backgroundColor: garageTag.cream,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  activeTag: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    backgroundColor: garageTag.mustard,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeTagText: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  name: {
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  record: {
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '700',
    fontSize: 14,
    color: garageTag.steel,
  },
  chips: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: garageTag.paper,
    maxWidth: 150,
  },
  chipLabel: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    maxWidth: 100,
  },
  swatchImg: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  swatchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: garageTag.graphite,
  },
  glyphImg: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
});
