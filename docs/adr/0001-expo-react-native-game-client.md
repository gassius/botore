# ADR-0001: Expo + React Native for game client

Status: accepted (replaces Cocos Creator decision) · Date: 2026-09-15

## Context

The original game client was planned to use Cocos Creator 3.x (ADR-0001 original).
However, Cocos Creator requires a visual editor that AI coding agents cannot
drive effectively, creating a maintenance and iteration bottleneck.

The system requirements remain:

- Mobile-first, TypeScript-scriptable game client
- Deterministic replay rendering from server-provided event streams
- Reproducible builds and agent-friendly development
- No gameplay logic in the client (server-authoritative)

## Decision

Replace Cocos Creator with **Expo + React Native** using built-in components
(View, Text, Animated API) for the 2D auto-battler UI.

## Rationale

- **TypeScript-first**: React Native is fully TypeScript-compatible
- **Agent-friendly**: No visual editor required; everything is code
- **Mobile support**: Expo provides excellent iOS/Android tooling
- **Simple 2D rendering**: For an auto-battler with simple character sprites and
  HP bars, React Native's built-in components are sufficient
- **Maintainable**: Standard React patterns agents understand well
- **Framework-free core preserved**: The existing `replay-playback.ts` logic
  remains unchanged; only the rendering adapter changes

## Migration

The migration preserved:

1. Framework-free `replay-playback.ts` core (no changes)
2. `BattleReplayController` interface (adapted for React Native StageNode)
3. All existing headless tests (passing)
4. Package boundaries (apps/game still cannot import server/db code)
5. Replay contract with `@botore/replay` package

## Future considerations

If performance or visual requirements demand it, react-native-skia or similar
2D graphics libraries can be added incrementally. The current implementation
prioritizes simplicity and agent maintainability.

## License/third-party

- Expo: MIT license
- React Native: MIT license
