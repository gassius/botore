# Cocos Creator — manual project setup (verified steps)

Cocos Creator was **not available** in the bootstrap environment, so no opaque
editor-generated files (`.scene`, `.meta`) were fabricated. Follow these exact
steps once; afterwards the editor-owned files are versioned normally.

## 0. Pin the release

- Download **Cocos Creator 3.8.x** (latest 3.8 patch) from the Cocos dashboard.
- Record the exact version + build number in `docs/adr/0001-cocos-over-godot.md`
  when you first create the project.
- License notes: engine repo is MIT; review the Creator editor terms for your
  pinned release before commercial release (see ADR-0001).

## 1. Create the project inside apps/game

1. Open Cocos Dashboard → Projects → New.
2. Template: **Empty (2D)**, language: TypeScript.
3. Location: choose `/home/cgonzalez/code/botore/apps/game/` — set the project
   folder to a temporary name like `game-creator-tmp`.
4. After creation, move the generated project files (`assets/`, `settings/`,
   `package.json`, `tsconfig.json`, `.creator/`, etc.) up into `apps/game/` so
   that `apps/game/assets/scripts/` is the script root. Do NOT overwrite
   `apps/game/package.json`; merge any editor-added fields into it instead and
   keep workspace scripts (`build`, `test`, `typecheck`, `lint`) intact.

## 2. Bring in shared packages

Creator cannot resolve pnpm workspace symlinks at runtime. Compile pure
packages once from the repo root:

```bash
pnpm --filter @botore/replay@* build
pnpm --filter @botore/rng@* build
pnpm --filter @botore/combat-engine@* build
```

Then either:

- copy `packages/*/dist/*.js` into `apps/game/assets/scripts/vendor/` (simple,
  regenerate with `pnpm game:sync-vendor`), or
- configure Creator's asset-db custom import map to point at the workspace
  paths (advanced).

The adapter sources in `apps/game/src/` import only types/values from
`@botore/replay` — after vendoring, rewrite that specifier to the relative
vendor path (`../vendor/replay.js`). A find/replace of
`from '@botore/replay'` → `from '../vendor/replay.js'` inside
`assets/scripts/` is sufficient.

## 3. Minimal scene: BattleReplayScene

Create `assets/scenes/BattleReplay.scene` with this node hierarchy (all
placeholders are simple built-in shapes / solid-color Sprites — no external
art):

```text
Canvas
├── Attacker            (Sprite, solid rect, e.g. blue)   name = player-hero
│   └── HPBar           (Sprite, green, anchored top)     name = attacker-hp
├── Defender            (Sprite, solid rect, red)         name = opp-sir-bot
│   └── HPBar           (Sprite, green, anchored top)     name = defender-hp
├── Banner              (Label, centered)                 name = banner
├── Controls
│   ├── StartButton     (Button + Label "Replay fixture")
│   └── FixtureSelector (Dropdown: golden-0 / golden-1 / golden-2)
└── ResultPanel         (full-screen, initially inactive) name = result
    └── WinnerLabel     (Label)
```

Node names matter: `BattleReplayController` resolves fighters by name.

## 4. Wire the controller

1. Copy `apps/game/src/replay-playback.ts` and
   `apps/game/src/BattleReplayController.ts` into
   `apps/game/assets/scripts/` and apply the vendor-import rewrite from step 2.
2. Create `assets/scripts/BattleScene.ts` — a `cc.Component` that:
   - builds a `ReplayStage` from child nodes by name;
   - on StartButton click: fetches the selected fixture replay
     (dev: embed the JSON produced by
     `node -e "import('@botore/test-fixtures').then(m=>console.log(JSON.stringify(m.runGoldenBattle(m.goldenBattle(0))))"`,
     or GET `/v1/battles/:id/replay` from the local API);
   - instantiates `BattleReplayController` and calls `update(dt, now)`
     inside the scene's `update(dt)` using `performance.now()`;
   - maps `damage_pop.hpRatio` onto HP bar `scaleX` via a tween.
3. Attach `BattleScene` to the Canvas node; drag references in the inspector.

## 5. Editor metadata policy (AGENTS.md summary)

- `.meta` files and `library/`, `temp/`, `local/`, `build/`, `profiles/` are
  gitignored per `.gitignore`.
- Scene changes must be committed separately from gameplay logic so agents can
  touch scripts without editor churn.
- Never hand-edit `.meta` UUIDs.

## 6. Verify

- In-editor Play: pressing Replay fixture plays turns, damage pops, HP bars
  shrink, victory panel shows winner/draw.
- Web preview build must render identically to the headless queue order —
  compare against `PlaybackController` step list logged to console.
