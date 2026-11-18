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

export type SnapCarouselProps<T> = {
  readonly data: readonly T[];
  readonly itemSize: number;
  readonly gap?: number;
  /**
   * Fixed side inset. When omitted and `clipWidth` is unset, leftover viewport
   * space is split so tiles never cut. A6/D7 clipped carousels pass `clipWidth`
   * with **no** content padding (TILES-SPEC).
   */
  readonly sidePadding?: number;
  /**
   * Fixed clipped viewport width (pt). A6 Customise = 337 so exactly 3 tiles
   * show; overflow hidden; no inner content padding.
   */
  readonly clipWidth?: number;
  /** Design visible count; used when viewport has not been measured yet. */
  readonly designVisibleCount?: number;
  readonly keyExtractor: (item: T, index: number) => string;
  readonly renderItem: (info: ListRenderItemInfo<T>) => React.ReactElement | null;
  readonly initialIndex?: number;
  readonly onSnapIndexChange?: ((index: number) => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
};

export type SnapCarouselHandle = {
  scrollToIndex: (index: number, animated?: boolean) => void;
  getSnapIndex: () => number;
};

type SnapCarouselInnerProps = SnapCarouselProps<unknown>;

/**
 * Horizontal snap carousel — rests only on whole items (first / middle / last).
 * Mechanical end-stop via snapToInterval + disableIntervalMomentum.
 * Reduced motion: still snaps; programmatic moves skip fling animation.
 */
function SnapCarouselInner(
  props: SnapCarouselInnerProps,
  ref: React.ForwardedRef<SnapCarouselHandle>,
): React.ReactElement {
  const {
    data,
    itemSize,
    gap = 0,
    sidePadding: sidePaddingProp,
    clipWidth,
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
  const [viewport, setViewport] = useState(clipWidth ?? 0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const snapIndexRef = useRef(0);
  const interval = snapInterval(itemSize, gap);

  // A6 clipped carousel: fixed width, zero content padding, exact visibleCount.
  const clipped = clipWidth !== undefined && clipWidth > 0;
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
      // RN versions differ on subscription shape.
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

  // Honor initialIndex once viewport is known.
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
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / interval);
    emitIndex(index);
  };

  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Reduced-motion / short drags may skip momentum; still settle the index.
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / interval);
    emitIndex(index);
  };

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      // length includes trailing gap so offsets stay on snapInterval stops
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
            width: itemSize,
            marginRight: isLast ? 0 : gap,
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
      horizontal
      data={listData}
      keyExtractor={keyExtractor as (item: unknown, index: number) => string}
      renderItem={wrappedRenderItem}
      style={[
        styles.list,
        clipped
          ? { width: clipWidth, overflow: 'hidden', alignSelf: 'center' }
          : null,
        style,
      ]}
      contentContainerStyle={[
        {
          paddingHorizontal: sidePadding,
        },
        contentContainerStyle,
      ]}
      showsHorizontalScrollIndicator={false}
      snapToInterval={interval}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      bounces
      overScrollMode="never"
      onLayout={(e) => {
        if (clipped) return;
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - viewport) > 0.5) setViewport(w);
      }}
      onMomentumScrollEnd={onMomentumEnd}
      onScrollEndDrag={onScrollEndDrag}
      getItemLayout={getItemLayout}
      testID={testID}
    />
  );
}

export const SnapCarousel = forwardRef(SnapCarouselInner) as <T>(
  props: SnapCarouselProps<T> & { ref?: React.Ref<SnapCarouselHandle> },
) => React.ReactElement;

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
