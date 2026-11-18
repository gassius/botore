import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  FlatList,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  maxSnapIndex,
  offsetForSnapIndex,
  sidePaddingForExactFit,
  snapInterval,
  visibleWholeCount,
} from './snapMetrics';

export type SnapVerticalListProps<T> = {
  readonly data: readonly T[];
  readonly itemSize: number;
  readonly gap?: number;
  /** Fixed leading/trailing inset along the scroll axis. */
  readonly sidePadding?: number;
  /**
   * Clipped viewport height (pt). D8/A6 = 545 (`3×175 + 2×10`) so exactly 3
   * cards show; overflow hidden; no inner content padding (avoids half-card peek).
   */
  readonly clipHeight?: number;
  readonly designVisibleCount?: number;
  readonly keyExtractor: (item: T, index: number) => string;
  readonly renderItem: (info: ListRenderItemInfo<T>) => React.ReactElement | null;
  readonly initialIndex?: number;
  readonly onSnapIndexChange?: ((index: number) => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
};

export type SnapVerticalListHandle = {
  scrollToIndex: (index: number, animated?: boolean) => void;
  getSnapIndex: () => number;
};

type SnapVerticalListInnerProps = SnapVerticalListProps<unknown>;

/**
 * Vertical snap list — rests only on whole rows (first / middle / last).
 * D8 Opponents: 175pt cards, three visible on 390×844.
 */
function SnapVerticalListInner(
  props: SnapVerticalListInnerProps,
  ref: React.ForwardedRef<SnapVerticalListHandle>,
): React.ReactElement {
  const {
    data,
    itemSize,
    gap = 0,
    sidePadding: sidePaddingProp,
    clipHeight,
    designVisibleCount = 1,
    keyExtractor,
    renderItem,
    initialIndex = 0,
    onSnapIndexChange,
    style,
    contentContainerStyle,
    testID,
  } = props;

  const listRef = useRef<FlatList<unknown>>(null);
  const [viewport, setViewport] = useState(clipHeight ?? 0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const snapIndexRef = useRef(0);
  const interval = snapInterval(itemSize, gap);

  const clipped = clipHeight !== undefined && clipHeight > 0;
  const visibleCount = clipped
    ? Math.max(1, designVisibleCount)
    : viewport > 0
      ? visibleWholeCount(viewport, itemSize, gap, sidePaddingProp ?? 0)
      : Math.max(1, designVisibleCount);

  const sidePadding = clipped
    ? (sidePaddingProp ?? 0)
    : sidePaddingProp !== undefined
      ? sidePaddingProp
      : viewport > 0
        ? sidePaddingForExactFit(viewport, itemSize, gap, visibleCount)
        : 0;

  const maxIndex = maxSnapIndex(data.length, visibleCount);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (mounted) setReduceMotion(Boolean(v));
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
      setReduceMotion(Boolean(v));
    });
    return () => {
      mounted = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, []);

  const emitIndex = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(0, index), maxIndex);
      if (clamped === snapIndexRef.current) return;
      snapIndexRef.current = clamped;
      onSnapIndexChange?.(clamped);
    },
    [maxIndex, onSnapIndexChange],
  );

  const scrollTo = useCallback(
    (index: number, animated: boolean) => {
      const offset = offsetForSnapIndex(index, data.length, itemSize, gap, visibleCount);
      listRef.current?.scrollToOffset({ offset, animated: animated && !reduceMotion });
      emitIndex(index);
    },
    [data.length, emitIndex, gap, itemSize, reduceMotion, visibleCount],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, animated = true) => {
        scrollTo(index, animated);
      },
      getSnapIndex: () => snapIndexRef.current,
    }),
    [scrollTo],
  );

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || viewport <= 0 || data.length === 0) return;
    didInit.current = true;
    const start = Math.min(Math.max(0, initialIndex), maxIndex);
    snapIndexRef.current = start;
    if (start > 0) {
      requestAnimationFrame(() => {
        scrollTo(start, false);
      });
    } else {
      onSnapIndexChange?.(0);
    }
  }, [data.length, initialIndex, maxIndex, onSnapIndexChange, scrollTo, viewport]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    emitIndex(Math.round(y / interval));
  };

  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    emitIndex(Math.round(y / interval));
  };

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: index === data.length - 1 ? itemSize : interval,
      offset: sidePadding + index * interval,
      index,
    }),
    [data.length, interval, itemSize, sidePadding],
  );

  const wrappedRenderItem = useCallback(
    (info: ListRenderItemInfo<unknown>) => {
      const isLast = info.index === data.length - 1;
      return (
        <View
          style={{
            height: itemSize,
            marginBottom: isLast ? 0 : gap,
          }}
        >
          {renderItem(info)}
        </View>
      );
    },
    [data.length, gap, itemSize, renderItem],
  );

  const listData = useMemo(() => data as unknown[], [data]);

  return (
    <FlatList
      ref={listRef}
      data={listData}
      keyExtractor={keyExtractor as (item: unknown, index: number) => string}
      renderItem={wrappedRenderItem}
      style={[
        // Clipped lists must NOT inherit flex:1 (flexBasis 0) — that collapses the
        // FlatList to 0 height in a column parent after siblings take space.
        clipped ? styles.listClipped : styles.listFlex,
        clipped
          ? {
              height: clipHeight,
              minHeight: clipHeight,
              maxHeight: clipHeight,
              overflow: 'hidden',
            }
          : null,
        style,
      ]}
      contentContainerStyle={[
        {
          paddingVertical: sidePadding,
          ...(clipped
            ? {
                // Keep content at least one full clip so items paint even before
                // the first layout pass settles.
                minHeight: clipHeight,
              }
            : null),
        },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      snapToInterval={interval}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      bounces
      overScrollMode="never"
      onLayout={(e) => {
        if (clipped) return;
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - viewport) > 0.5) setViewport(h);
      }}
      onMomentumScrollEnd={onMomentumEnd}
      onScrollEndDrag={onScrollEndDrag}
      getItemLayout={getItemLayout}
      testID={testID}
    />
  );
}

export const SnapVerticalList = forwardRef(SnapVerticalListInner) as <T>(
  props: SnapVerticalListProps<T> & { ref?: React.Ref<SnapVerticalListHandle> },
) => React.ReactElement;

const styles = StyleSheet.create({
  listFlex: {
    flex: 1,
    minHeight: 0,
  },
  listClipped: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
});
