import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  ACTIVE_ENVIRONMENT_ASSET_VERSION,
  ENVIRONMENT_LAYER_Z,
  ENVIRONMENT_MANIFEST,
  ENVIRONMENT_SEALED_SHA256,
  ENVIRONMENT_SCENE_CANVAS,
  kitOriginFromGround,
  startPlacement,
  fitSceneToViewport,
} from '../src/arena/index';

const envRoot = join(process.cwd(), 'assets/environment-v001');

function sha256File(rel: string): string {
  return createHash('sha256')
    .update(readFileSync(join(envRoot, rel)))
    .digest('hex');
}

describe('environment-v001 pin + sealed hashes', () => {
  it('pins coherent environment-v001 and preserves separate layer z-order', () => {
    expect(ACTIVE_ENVIRONMENT_ASSET_VERSION).toBe('environment-v001');
    expect(ENVIRONMENT_MANIFEST.version).toBe('environment-v001');
    expect(ENVIRONMENT_SCENE_CANVAS).toEqual({ width: 720, height: 1120 });
    expect(ENVIRONMENT_LAYER_Z.wall).toBeLessThan(ENVIRONMENT_LAYER_Z.floor);
    expect(ENVIRONMENT_LAYER_Z.floor).toBeLessThan(ENVIRONMENT_LAYER_Z.markings);
    expect(ENVIRONMENT_LAYER_Z.markings).toBeLessThan(ENVIRONMENT_LAYER_Z.contactShadows);
    expect(ENVIRONMENT_LAYER_Z.farActor).toBeLessThan(ENVIRONMENT_LAYER_Z.nearActor);
    expect(ENVIRONMENT_LAYER_Z.dodgeFx).toBeLessThan(ENVIRONMENT_LAYER_Z.defeatFx);
    expect(ENVIRONMENT_LAYER_Z.defeatFx).toBeLessThan(ENVIRONMENT_LAYER_Z.hitFx);
  });

  it('seals runtime PNG + manifest hashes against SHA256SUMS', () => {
    for (const [rel, expected] of Object.entries(ENVIRONMENT_SEALED_SHA256)) {
      expect(sha256File(rel)).toBe(expected);
    }
  });

  it('does not ship scene-play-region-notes overlay as a game background', () => {
    expect(existsSync(join(envRoot, 'previews/scene-play-region-notes.png'))).toBe(false);
  });
});

describe('scene placement adapter', () => {
  it('places near/far using ground anchors (not torso pivots)', () => {
    const { near, far } = startPlacement();
    expect(near.groundAnchor).toEqual({ x: 224, y: 990 });
    expect(far.groundAnchor).toEqual({ x: 516, y: 815 });
    expect(near.facing).toBe('right');
    expect(far.facing).toBe('left');
    expect(near.scale).toBe(0.78);
    expect(far.scale).toBe(0.7);
    expect(near.origin).toEqual(
      kitOriginFromGround(
        near.groundAnchor.x,
        near.groundAnchor.y,
        near.localGroundAnchor.x,
        near.localGroundAnchor.y,
        near.scale,
      ),
    );
    expect(far.origin).toEqual(
      kitOriginFromGround(
        far.groundAnchor.x,
        far.groundAnchor.y,
        far.localGroundAnchor.x,
        far.localGroundAnchor.y,
        far.scale,
      ),
    );
    // Matches sealed illustrative_start_actors origins from manifest.
    expect(near.origin.x).toBeCloseTo(-23.65, 5);
    expect(near.origin.y).toBeCloseTo(603.9, 5);
    expect(far.origin.x).toBeCloseTo(290.25, 5);
    expect(far.origin.y).toBeCloseTo(468.5, 5);
  });

  it('fits 720×1120 uniformly into a phone-scale viewport', () => {
    const fit = fitSceneToViewport(360, 560);
    expect(fit.scale).toBe(0.5);
    expect(fit.width).toBe(360);
    expect(fit.height).toBe(560);
  });
});
