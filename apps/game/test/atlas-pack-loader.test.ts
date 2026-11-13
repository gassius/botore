import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasManifestResponse } from '@botore/contracts';
import {
  AtlasPackLoader,
  BASE_AUDIO_ROLES,
  BUNDLED_BASE_AUDIO_PATHS,
  WORKSHOP_FRAME_ATLAS_VERSION,
  WORKSHOP_FRAME_KIT,
  atlasPathForWorkshopKitFile,
  cacheIndexPath,
  cacheIndexTmpPath,
  createMemoryPackFileStore,
  createUriMapBundledBasePack,
  ensureStableFightPacks,
  findPartAudioUri,
  isBundledBaseAudioPath,
  isWorkshopFrameAtlasPath,
  mergeCommitCacheIndex,
  partIdsForWorkshopFrameLoadout,
  readCacheIndex,
  resetMemoryPackFileStore,
  resolveAudioCue,
  resolvePaintCatalogueId,
  resolvePaintToken,
  resolveTriggerAudio,
  resolveWeaponCatalogueId,
  resolveWorkshopWeaponAssetId,
  selectEntriesToFetch,
  workshopFrameAtlasPathsForAsset,
  writeCacheIndex,
  type PackFileStore,
} from '../src/atlas';

function encodeUtf8(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function sampleManifest(version = 'v1'): AtlasManifestResponse {
  return {
    ok: true,
    version,
    status: 'published',
    publishedAt: '2026-11-08T00:00:00.000Z',
    budgetsFinal: false,
    manifest: { version },
    bucket: 'atlas',
    prefix: `${version}/`,
    entries: [
      {
        assetKey: 'base.audio.hit',
        kind: 'audio',
        partId: null,
        role: 'hit',
        path: 'base/audio/hit.m4a',
        storagePath: `${version}/base/audio/hit.m4a`,
        soundTags: [],
      },
      {
        assetKey: 'parts.weapon-sword.swing',
        kind: 'audio',
        partId: 'weapon-sword',
        role: 'swing',
        path: 'parts/weapon-sword/swing.m4a',
        storagePath: `${version}/parts/weapon-sword/swing.m4a`,
        soundTags: ['weapon.sword'],
      },
      {
        assetKey: 'parts.weapon-sword.sprite',
        kind: 'image',
        partId: 'weapon-sword',
        role: 'sprite',
        path: 'parts/weapon-sword/sprite.png',
        storagePath: `${version}/parts/weapon-sword/sprite.png`,
        soundTags: [],
      },
      {
        assetKey: 'parts.chassis-basic.body',
        kind: 'image',
        partId: 'chassis-basic',
        role: 'body',
        path: 'parts/chassis-basic/body.png',
        storagePath: `${version}/parts/chassis-basic/body.png`,
        soundTags: ['chassis.light'],
      },
      {
        assetKey: 'arenas.quiet.bg',
        kind: 'image',
        partId: null,
        role: 'bg',
        path: 'arenas/quiet/bg.png',
        storagePath: `${version}/arenas/quiet/bg.png`,
        soundTags: [],
      },
      {
        assetKey: 'fx.hit',
        kind: 'image',
        partId: null,
        role: 'hit',
        path: 'fx/hit.png',
        storagePath: `${version}/fx/hit.png`,
        soundTags: [],
      },
    ],
  };
}

describe('atlas pack loader (F6)', () => {
  beforeEach(() => {
    resetMemoryPackFileStore();
    resetMemoryPackFileStore('memory://atlas-enospace/');
    resetMemoryPackFileStore('memory://atlas-shared-concurrent/');
    resetMemoryPackFileStore('memory://atlas-replace-fail/');
    resetMemoryPackFileStore('memory://atlas-torn-recovery/');
  });

  it('registers only base-pack paths as bundle-eligible (no catalogue)', () => {
    for (const role of BASE_AUDIO_ROLES) {
      const path = BUNDLED_BASE_AUDIO_PATHS[role];
      expect(isBundledBaseAudioPath(path)).toBe(true);
      expect(path.startsWith('base/')).toBe(true);
      expect(path.includes('parts/')).toBe(false);
      expect(path.includes('arenas/')).toBe(false);
      expect(path.includes('fx/')).toBe(false);
    }
    expect(isBundledBaseAudioPath('parts/weapon-sword/swing.m4a')).toBe(false);
    expect(isBundledBaseAudioPath('arenas/quiet/ambient.m4a')).toBe(false);
    expect(isBundledBaseAudioPath('fx/hit.png')).toBe(false);
  });

  it('selects part/arena/fx entries and never queues bundled base audio', () => {
    const selected = selectEntriesToFetch(sampleManifest(), {
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
    });
    const paths = selected.map((e) => e.path);
    expect(paths).toContain('parts/weapon-sword/swing.m4a');
    expect(paths).toContain('parts/weapon-sword/sprite.png');
    expect(paths).toContain('arenas/quiet/bg.png');
    expect(paths).toContain('fx/hit.png');
    expect(paths.some((p) => p.startsWith('base/'))).toBe(false);
    expect(paths).not.toContain('parts/chassis-basic/body.png');
  });

  it('downloads requested packs, then reuses the same-version cache offline', async () => {
    const manifest = sampleManifest('v1');
    const downloadObject = vi.fn(async (storagePath: string) => {
      return encodeUtf8(`bytes:${storagePath}`);
    });
    const fetchManifest = vi.fn(async () => manifest);
    const store = createMemoryPackFileStore();
    const bundled = createUriMapBundledBasePack({
      hit: 'bundle://hit',
      swing: 'bundle://swing',
    });
    const loader = new AtlasPackLoader({
      transport: { fetchManifest, downloadObject },
      store,
      bundledBase: bundled,
    });

    const first = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(first.fetched).toBe(true);
    expect(first.fromCache).toBe(false);
    expect(downloadObject).toHaveBeenCalled();
    expect(first.assets.some((a) => a.source === 'bundle' && a.role === 'hit')).toBe(true);
    expect(findPartAudioUri(first.assets, 'weapon-sword')).toMatch(/weapon-sword\/swing\.m4a$/);

    const downloadCount = downloadObject.mock.calls.length;
    fetchManifest.mockClear();
    downloadObject.mockClear();

    const second = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(second.fromCache).toBe(true);
    expect(second.fetched).toBe(false);
    expect(downloadObject).not.toHaveBeenCalled();
    expect(fetchManifest).toHaveBeenCalledTimes(1);

    // Offline reuse: transport fails, same version still resolves from cache.
    fetchManifest.mockRejectedValueOnce(new Error('network down'));
    downloadObject.mockRejectedValue(new Error('network down'));
    const offline = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(offline.offline).toBe(true);
    expect(offline.fromCache).toBe(true);
    expect(findPartAudioUri(offline.assets, 'weapon-sword')).toBeTruthy();
    expect(downloadObject.mock.calls.length).toBe(0);
    expect(downloadCount).toBeGreaterThan(0);
  });

  it('fetches again when the atlas version pin changes', async () => {
    const store = createMemoryPackFileStore();
    const bundled = createUriMapBundledBasePack({ hit: 'bundle://hit' });
    const downloadObject = vi.fn(async (storagePath: string) => encodeUtf8(storagePath));
    const loader = new AtlasPackLoader({
      transport: {
        fetchManifest: async (version) => sampleManifest(version),
        downloadObject,
      },
      store,
      bundledBase: bundled,
    });

    await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    const afterV1 = downloadObject.mock.calls.length;

    await loader.ensurePacks({
      atlasVersion: 'v2',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(downloadObject.mock.calls.length).toBeGreaterThan(afterV1);
    expect(downloadObject.mock.calls.some((c) => String(c[0]).startsWith('v2/'))).toBe(true);
  });

  it('never blocks a fight when part audio is missing', async () => {
    const bundled = createUriMapBundledBasePack({
      swing: 'bundle://swing',
      hit: 'bundle://hit',
    });
    const loader = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => sampleManifest('v1'),
        downloadObject: async () => {
          throw new Error('404');
        },
      },
      store: createMemoryPackFileStore(),
      bundledBase: bundled,
    });

    const result = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(result.assets.some((a) => a.source === 'missing')).toBe(true);

    const partUri = findPartAudioUri(result.assets, 'weapon-sword');
    expect(partUri).toBeNull();

    const cue = resolveTriggerAudio({
      trigger: 'attack_selected',
      partAudioUri: partUri,
      bundled,
    });
    expect(cue.source).toBe('base');
    expect(cue.uri).toBe('bundle://swing');

    const silent = resolveAudioCue({
      role: 'dodge',
      preferredLocalUri: null,
      bundled: createUriMapBundledBasePack({}),
    });
    expect(silent.source).toBe('silent');
    expect(silent.uri).toBeNull();
  });

  it('maps F7 paint/weapon aliases onto F5 catalogue ids and kit-v002 atlas paths', () => {
    expect(WORKSHOP_FRAME_ATLAS_VERSION).toBe('v2');
    expect(WORKSHOP_FRAME_KIT.kitVersion).toBe('v002');
    expect(WORKSHOP_FRAME_KIT.compatibleFamily).toBe('workshop-frame-v002');
    expect(resolvePaintToken('oxide')).toBe('oxide');
    expect(resolvePaintToken('paint-cobalt')).toBe('petrol');
    expect(resolvePaintCatalogueId('petrol')).toBe('paint-cobalt');
    expect(resolvePaintCatalogueId('paint-crimson')).toBe('paint-crimson');
    expect(resolveWorkshopWeaponAssetId('axe')).toBe('weapon_axe');
    expect(resolveWeaponCatalogueId('dagger')).toBe('weapon-dagger');

    // F5 parts/<partId>/… packing (hyphenated); not the old kits/…/v001 layout.
    const path = atlasPathForWorkshopKitFile('parts/torso-oxide.png');
    expect(path).toBe('parts/torso/oxide.png');
    expect(isWorkshopFrameAtlasPath(path)).toBe(true);
    expect(() =>
      atlasPathForWorkshopKitFile('kits/workshop-frame/v001/parts/torso-oxide.png'),
    ).toThrow(/v001/);

    const layers = workshopFrameAtlasPathsForAsset('torso', 'petrol');
    expect(layers).toContain('parts/torso/petrol.png');
    expect(layers).toContain('parts/torso/mask.png');
    expect(layers).toContain('parts/torso/material-under.png');

    const weaponPath = atlasPathForWorkshopKitFile('parts/weapon_sword-oxide.png');
    expect(weaponPath).toBe('parts/weapon-sword/oxide.png');

    const partIds = partIdsForWorkshopFrameLoadout({
      paintId: 'oxide',
      weaponId: 'sword',
      chassis: 'chassis-basic',
    });
    expect(partIds).toContain('torso');
    expect(partIds).toContain('upper-arm-l');
    expect(partIds).toContain('weapon-sword');
    expect(partIds).not.toContain('weapon_sword');
    expect(partIds).toContain('paint-crimson');
    expect(partIds).toContain('chassis-basic');
  });

  it('selects workshop-frame kit-v002 entries via F5 partId without a second schema', () => {
    const version = WORKSHOP_FRAME_ATLAS_VERSION;
    const kitPath = 'parts/torso/oxide.png';
    const weaponPath = 'parts/weapon-sword/oxide.png';
    const staleV001 = 'kits/workshop-frame/v001/parts/torso-oxide.png';
    const manifest: AtlasManifestResponse = {
      ...sampleManifest(version),
      version,
      prefix: `${version}/`,
      entries: [
        ...sampleManifest(version).entries.map((e) => ({
          ...e,
          storagePath: `${version}/${e.path}`,
        })),
        {
          assetKey: 'parts.torso.oxide',
          kind: 'image',
          partId: 'torso',
          role: 'oxide',
          path: kitPath,
          storagePath: `${version}/${kitPath}`,
          soundTags: [],
        },
        {
          assetKey: 'parts.weapon-sword.oxide',
          kind: 'image',
          partId: 'weapon-sword',
          role: 'oxide',
          path: weaponPath,
          storagePath: `${version}/${weaponPath}`,
          soundTags: [],
        },
        {
          assetKey: 'kits.workshop-frame.v001.stale',
          kind: 'image',
          partId: 'torso',
          role: 'composited',
          path: staleV001,
          storagePath: `${version}/${staleV001}`,
          soundTags: [],
        },
      ],
    };
    const selected = selectEntriesToFetch(manifest, {
      atlasVersion: version,
      partIds: partIdsForWorkshopFrameLoadout({ weaponId: 'sword', paintId: 'oxide' }),
      includeArena: false,
      includeFx: false,
    });
    expect(selected.some((e) => e.path === kitPath)).toBe(true);
    expect(selected.some((e) => e.path === weaponPath)).toBe(true);
    expect(selected.some((e) => e.path === staleV001)).toBe(false);
  });

  it('ensureStableFightPacks unions stable+fight partIds and reuses same-version cache', async () => {
    const version = WORKSHOP_FRAME_ATLAS_VERSION;
    const torsoPath = 'parts/torso/oxide.png';
    const manifest: AtlasManifestResponse = {
      ...sampleManifest(version),
      version,
      prefix: `${version}/`,
      entries: [
        {
          assetKey: 'parts.torso.oxide',
          kind: 'image',
          partId: 'torso',
          role: 'oxide',
          path: torsoPath,
          storagePath: `${version}/${torsoPath}`,
          soundTags: [],
        },
        {
          assetKey: 'parts.weapon-axe.sprite',
          kind: 'image',
          partId: 'weapon-axe',
          role: 'sprite',
          path: 'parts/weapon-axe/sprite.png',
          storagePath: `${version}/parts/weapon-axe/sprite.png`,
          soundTags: [],
        },
        {
          assetKey: 'fx.hit',
          kind: 'image',
          partId: null,
          role: 'hit',
          path: 'fx/hit.png',
          storagePath: `${version}/fx/hit.png`,
          soundTags: [],
        },
      ],
    };
    const downloadObject = vi.fn(async (storagePath: string) => encodeUtf8(storagePath));
    const store = createMemoryPackFileStore();
    const bundled = createUriMapBundledBasePack({ hit: 'bundle://hit' });
    const transport = {
      fetchManifest: vi.fn(async () => manifest),
      downloadObject,
    };
    const loader = new AtlasPackLoader({ transport, store, bundledBase: bundled });

    const first = await ensureStableFightPacks({
      atlasVersion: version,
      loadouts: [
        { chassis: 'chassis-basic', paint: 'paint-crimson', weapon: 'weapon-sword' },
        { chassis: 'chassis-basic', paint: 'paint-cobalt', weapon: 'weapon-axe' },
      ],
      transport,
      loader,
      includeArena: false,
      includeFx: true,
    });
    expect(first.fetched).toBe(true);
    expect(first.assets.some((a) => a.path === torsoPath && a.source === 'download')).toBe(true);
    expect(first.assets.some((a) => a.partId === 'weapon-axe' && a.source === 'download')).toBe(
      true,
    );
    expect(first.assets.some((a) => a.path === 'fx/hit.png')).toBe(true);

    downloadObject.mockClear();
    transport.fetchManifest.mockClear();
    const offlineLoader = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => {
          throw new Error('offline');
        },
        downloadObject: async () => {
          throw new Error('offline');
        },
      },
      store,
      bundledBase: bundled,
    });
    const offline = await ensureStableFightPacks({
      atlasVersion: version,
      loadouts: [{ paint: 'oxide', weapon: 'sword' }],
      transport: {
        fetchManifest: async () => {
          throw new Error('offline');
        },
        downloadObject: async () => {
          throw new Error('offline');
        },
      },
      loader: offlineLoader,
      includeArena: false,
      includeFx: false,
    });
    expect(offline.offline).toBe(true);
    expect(offline.fromCache).toBe(true);
    expect(offline.assets.some((a) => a.path === torsoPath && a.source === 'cache')).toBe(true);
  });

  it('returns bundled fallback when manifest/audio transport never settles', async () => {
    const bundled = createUriMapBundledBasePack({
      hit: 'bundle://hit',
      swing: 'bundle://swing',
    });
    const loader = new AtlasPackLoader({
      transport: {
        fetchManifest: () => new Promise(() => {}),
        downloadObject: () => new Promise(() => {}),
      },
      store: createMemoryPackFileStore(),
      bundledBase: bundled,
      transportTimeoutMs: 40,
    });

    const started = Date.now();
    const result = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.offline).toBe(true);
    expect(result.assets.some((a) => a.source === 'bundle' && a.role === 'hit')).toBe(true);
    expect(result.assets.some((a) => a.source === 'bundle' && a.role === 'swing')).toBe(true);

    const cue = resolveTriggerAudio({
      trigger: 'attack_selected',
      partAudioUri: findPartAudioUri(result.assets, 'weapon-sword'),
      bundled,
    });
    expect(cue.source).toBe('base');
    expect(cue.uri).toBe('bundle://swing');
  });

  it('keeps bundled fallback when index write rejects after a failed audio download', async () => {
    const root = 'memory://atlas-enospace/';
    resetMemoryPackFileStore(root);
    const base = createMemoryPackFileStore(root);
    const store: PackFileStore = {
      rootUri: base.rootUri,
      exists: (p) => base.exists(p),
      readText: (p) => base.readText(p),
      writeBytes: (p, d) => base.writeBytes(p, d),
      ensureDir: (p) => base.ensureDir(p),
      uriFor: (p) => base.uriFor(p),
      replaceFile: (from, to) => base.replaceFile(from, to),
      remove: (p) => base.remove!(p),
      async writeText(relativePath, contents) {
        if (relativePath.includes('index.json')) {
          throw new Error('ENOSPC');
        }
        return base.writeText(relativePath, contents);
      },
    };
    const bundled = createUriMapBundledBasePack({
      swing: 'bundle://swing',
      hit: 'bundle://hit',
    });
    const loader = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => sampleManifest('v1'),
        downloadObject: async (storagePath) => {
          if (storagePath.endsWith('.m4a')) {
            throw new Error('404 audio');
          }
          return encodeUtf8(`bytes:${storagePath}`);
        },
      },
      store,
      bundledBase: bundled,
    });

    const result = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    expect(result.assets.some((a) => a.source === 'bundle' && a.role === 'hit')).toBe(true);
    expect(result.assets.some((a) => a.kind === 'audio' && a.source === 'missing')).toBe(true);
    expect(await readCacheIndex(store, 'v1')).toBeNull();

    const cue = resolveTriggerAudio({
      trigger: 'attack_selected',
      partAudioUri: findPartAudioUri(result.assets, 'weapon-sword'),
      bundled,
    });
    expect(cue.uri).toBe('bundle://swing');
  });

  it('merges concurrent loads across two store handles sharing one cache dir', async () => {
    const root = 'memory://atlas-shared-concurrent/';
    resetMemoryPackFileStore(root);
    const storeA = createMemoryPackFileStore(root);
    const storeB = createMemoryPackFileStore(root);
    expect(storeA).not.toBe(storeB);
    const bundled = createUriMapBundledBasePack({ hit: 'bundle://hit' });
    const waiting: Array<() => void> = [];
    let downloadsOpen = false;
    const downloadObject = vi.fn(async (storagePath: string) => {
      if (!downloadsOpen) {
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
        });
      }
      return encodeUtf8(`bytes:${storagePath}`);
    });
    const transport = {
      fetchManifest: async () => sampleManifest('v1'),
      downloadObject,
    };
    const loaderA = new AtlasPackLoader({ transport, store: storeA, bundledBase: bundled });
    const loaderB = new AtlasPackLoader({ transport, store: storeB, bundledBase: bundled });

    const pA = loaderA.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    const pB = loaderB.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['chassis-basic'],
      includeArena: false,
      includeFx: false,
    });

    // Both loaders read an empty index, then block on their first download.
    await vi.waitFor(() => {
      expect(waiting.length).toBeGreaterThanOrEqual(2);
    });
    downloadsOpen = true;
    for (const release of waiting.splice(0)) release();
    const [a, b] = await Promise.all([pA, pB]);
    expect(a.fetched).toBe(true);
    expect(b.fetched).toBe(true);

    const index = await readCacheIndex(storeA, 'v1');
    expect(index?.entries['parts.weapon-sword.sprite']).toBeTruthy();
    expect(index?.entries['parts.chassis-basic.body']).toBeTruthy();

    // Recreate a third handle on the same root — offline must see both entries.
    const storeC = createMemoryPackFileStore(root);
    const offlineLoader = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => {
          throw new Error('offline');
        },
        downloadObject: async () => {
          throw new Error('offline');
        },
      },
      store: storeC,
      bundledBase: bundled,
    });
    const offline = await offlineLoader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword', 'chassis-basic'],
      includeArena: false,
      includeFx: false,
    });
    expect(offline.offline).toBe(true);
    expect(offline.fromCache).toBe(true);
    expect(
      offline.assets.some(
        (asset) => asset.assetKey === 'parts.weapon-sword.sprite' && asset.source === 'cache',
      ),
    ).toBe(true);
    expect(
      offline.assets.some(
        (asset) => asset.assetKey === 'parts.chassis-basic.body' && asset.source === 'cache',
      ),
    ).toBe(true);
  });

  it('retains the previous cache index when atomic replaceFile fails', async () => {
    const root = 'memory://atlas-replace-fail/';
    resetMemoryPackFileStore(root);
    const base = createMemoryPackFileStore(root);
    await mergeCommitCacheIndex(base, 'v1', {
      'parts.weapon-sword.sprite': {
        assetKey: 'parts.weapon-sword.sprite',
        path: 'parts/weapon-sword/sprite.png',
        kind: 'image',
        relativeFile: 'packs/v1/files/parts/weapon-sword/sprite.png',
        partId: 'weapon-sword',
        role: 'sprite',
      },
    });
    await base.writeBytes(
      'packs/v1/files/parts/weapon-sword/sprite.png',
      encodeUtf8('sprite-bytes'),
    );

    let failReplace = false;
    const store: PackFileStore = {
      rootUri: base.rootUri,
      exists: (p) => base.exists(p),
      readText: (p) => base.readText(p),
      writeText: (p, c) => base.writeText(p, c),
      writeBytes: (p, d) => base.writeBytes(p, d),
      ensureDir: (p) => base.ensureDir(p),
      uriFor: (p) => base.uriFor(p),
      remove: (p) => base.remove!(p),
      async replaceFile(fromRelativePath, toRelativePath) {
        if (failReplace && toRelativePath === cacheIndexPath('v1')) {
          throw new Error('interrupted replace');
        }
        return base.replaceFile(fromRelativePath, toRelativePath);
      },
    };

    failReplace = true;
    await expect(
      mergeCommitCacheIndex(store, 'v1', {
        'parts.chassis-basic.body': {
          assetKey: 'parts.chassis-basic.body',
          path: 'parts/chassis-basic/body.png',
          kind: 'image',
          relativeFile: 'packs/v1/files/parts/chassis-basic/body.png',
          partId: 'chassis-basic',
          role: 'body',
        },
      }),
    ).rejects.toThrow(/interrupted replace/);

    // Prior final remains; staged tmp may exist but must not drop the old entry.
    const retained = await readCacheIndex(store, 'v1');
    expect(retained?.entries['parts.weapon-sword.sprite']).toBeTruthy();
    // After failed replace, promote from tmp would merge new entry — simulate
    // process restart that only sees the intact final (tmp removed).
    if (await base.exists(cacheIndexTmpPath('v1'))) {
      await base.remove!(cacheIndexTmpPath('v1'));
    }
    const afterRestart = await readCacheIndex(createMemoryPackFileStore(root), 'v1');
    expect(afterRestart?.entries['parts.weapon-sword.sprite']).toBeTruthy();
    expect(afterRestart?.entries['parts.chassis-basic.body']).toBeUndefined();
  });

  it('recovers a torn final index from a complete staged tmp on restart', async () => {
    const root = 'memory://atlas-torn-recovery/';
    resetMemoryPackFileStore(root);
    const store = createMemoryPackFileStore(root);
    await writeCacheIndex(store, {
      version: 'v1',
      entries: {
        'parts.weapon-sword.sprite': {
          assetKey: 'parts.weapon-sword.sprite',
          path: 'parts/weapon-sword/sprite.png',
          kind: 'image',
          relativeFile: 'packs/v1/files/parts/weapon-sword/sprite.png',
          partId: 'weapon-sword',
          role: 'sprite',
        },
      },
    });

    // Simulate legacy truncating write on the live path + a complete staged tmp.
    await store.writeText(cacheIndexPath('v1'), '{"version":"v1","entries":');
    await store.writeText(
      cacheIndexTmpPath('v1'),
      JSON.stringify({
        version: 'v1',
        entries: {
          'parts.weapon-sword.sprite': {
            assetKey: 'parts.weapon-sword.sprite',
            path: 'parts/weapon-sword/sprite.png',
            kind: 'image',
            relativeFile: 'packs/v1/files/parts/weapon-sword/sprite.png',
            partId: 'weapon-sword',
            role: 'sprite',
          },
          'parts.chassis-basic.body': {
            assetKey: 'parts.chassis-basic.body',
            path: 'parts/chassis-basic/body.png',
            kind: 'image',
            relativeFile: 'packs/v1/files/parts/chassis-basic/body.png',
            partId: 'chassis-basic',
            role: 'body',
          },
        },
      }),
    );

    const recovered = await readCacheIndex(createMemoryPackFileStore(root), 'v1');
    expect(recovered?.entries['parts.weapon-sword.sprite']).toBeTruthy();
    expect(recovered?.entries['parts.chassis-basic.body']).toBeTruthy();
    // Promoted final should now be valid JSON again.
    const rawFinal = await store.readText(cacheIndexPath('v1'));
    expect(() => JSON.parse(rawFinal)).not.toThrow();
  });

  it('preserves workshop partId/role across cold, warm, and offline resolve', async () => {
    const version = 'v1';
    const kitPath = 'parts/torso/oxide.png';
    const kitEntry = {
      assetKey: 'kits.workshop-frame.torso.oxide',
      kind: 'image' as const,
      partId: 'torso',
      role: 'composited',
      path: kitPath,
      storagePath: `${version}/${kitPath}`,
      soundTags: [] as string[],
    };
    const kitsPath = 'kits/workshop-frame/v002/parts/torso-oxide.png';
    const kitsEntry = {
      assetKey: 'kits.workshop-frame.v002.torso',
      kind: 'image' as const,
      partId: 'torso',
      role: 'composited',
      path: kitsPath,
      storagePath: `${version}/${kitsPath}`,
      soundTags: [] as string[],
    };
    const manifest: AtlasManifestResponse = {
      ...sampleManifest(version),
      entries: [...sampleManifest(version).entries, kitEntry, kitsEntry],
    };
    const store = createMemoryPackFileStore();
    const bundled = createUriMapBundledBasePack({ hit: 'bundle://hit' });
    const loader = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => manifest,
        downloadObject: async (storagePath) => encodeUtf8(storagePath),
      },
      store,
      bundledBase: bundled,
    });

    const cold = await loader.ensurePacks({
      atlasVersion: version,
      partIds: ['torso'],
      includeArena: false,
      includeFx: false,
    });
    const coldKit = cold.assets.find((a) => a.assetKey === kitEntry.assetKey);
    const coldKits = cold.assets.find((a) => a.assetKey === kitsEntry.assetKey);
    expect(coldKit).toMatchObject({ partId: 'torso', role: 'composited', source: 'download' });
    expect(coldKits).toMatchObject({ partId: 'torso', role: 'composited', source: 'download' });

    const warm = await loader.ensurePacks({
      atlasVersion: version,
      partIds: ['torso'],
      includeArena: false,
      includeFx: false,
    });
    expect(warm.fromCache).toBe(true);
    expect(warm.assets.find((a) => a.assetKey === kitEntry.assetKey)).toMatchObject({
      partId: 'torso',
      role: 'composited',
      source: 'cache',
    });
    expect(warm.assets.find((a) => a.assetKey === kitsEntry.assetKey)).toMatchObject({
      partId: 'torso',
      role: 'composited',
      source: 'cache',
    });

    const offline = await new AtlasPackLoader({
      transport: {
        fetchManifest: async () => {
          throw new Error('offline');
        },
        downloadObject: async () => {
          throw new Error('offline');
        },
      },
      store,
      bundledBase: bundled,
    }).ensurePacks({
      atlasVersion: version,
      partIds: ['torso'],
      includeArena: false,
      includeFx: false,
    });
    expect(offline.assets.find((a) => a.assetKey === kitEntry.assetKey)).toMatchObject({
      partId: 'torso',
      role: 'composited',
      source: 'cache',
    });
    expect(offline.assets.find((a) => a.assetKey === kitsEntry.assetKey)).toMatchObject({
      partId: 'torso',
      role: 'composited',
      source: 'cache',
    });
  });

  it('rejects a wrong-version manifest when allowOffline is false', async () => {
    const store = createMemoryPackFileStore();
    const bundled = createUriMapBundledBasePack({ hit: 'bundle://hit' });
    const loader = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => sampleManifest('v2'),
        downloadObject: async (storagePath) => encodeUtf8(storagePath),
      },
      store,
      bundledBase: bundled,
    });

    await expect(
      loader.ensurePacks({
        atlasVersion: 'v1',
        partIds: ['weapon-sword'],
        includeArena: false,
        includeFx: false,
        allowOffline: false,
      }),
    ).rejects.toThrow(/atlas_manifest_version_mismatch/);

    // Seed a v1 cache, then pin v1 while transport returns v2 — still reject.
    const seeder = new AtlasPackLoader({
      transport: {
        fetchManifest: async () => sampleManifest('v1'),
        downloadObject: async (storagePath) => encodeUtf8(storagePath),
      },
      store,
      bundledBase: bundled,
    });
    await seeder.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
    });
    await expect(
      loader.ensurePacks({
        atlasVersion: 'v1',
        partIds: ['weapon-sword'],
        includeArena: false,
        includeFx: false,
        allowOffline: false,
      }),
    ).rejects.toThrow(/atlas_manifest_version_mismatch/);

    // allowOffline true still falls back to the pinned-version cache.
    const offlineOk = await loader.ensurePacks({
      atlasVersion: 'v1',
      partIds: ['weapon-sword'],
      includeArena: false,
      includeFx: false,
      allowOffline: true,
    });
    expect(offlineOk.offline).toBe(true);
    expect(offlineOk.fromCache).toBe(true);
  });
});
