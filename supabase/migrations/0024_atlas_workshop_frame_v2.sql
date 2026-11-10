-- 0024: Atlas v2 draft — Workshop Frame kit-v002 media keys (C13)
--
-- Registers immutable-pack draft `v2` with:
--   • v1 carry-forward (base / quiet arena / FX / proof catalogue parts)
--   • Workshop Frame kit-v002 packed onto F5 `parts/<hyphenatedPartId>/…`
--
-- Weapon id rule: kit filenames keep underscores (`weapon_sword`); atlas and
-- catalogue partIds use hyphens (`weapon-sword`). Client adapters map both.
-- Kit-v001 paths are never registered.
--
-- Migrations do NOT fabricate storage.objects. Publish after:
--   node scripts/pack-workshop-frame-atlas.mjs
--   ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
--
-- proof_pack_ok remains pinned to published `v1` (see 0017 / health snapshot).

insert into public.atlas_versions (
    version, status, published_at, manifest, budgets_final, notes
) values (
    'v2',
    'draft',
    null,
    '{
      "version": "v2",
      "status": "draft",
      "note": "Workshop Frame kit-v002 media keys on F5 parts/<hyphenatedPartId>/… plus v1 carry-forward. budgets_final stays false.",
      "kit": {
        "id": "workshop-frame",
        "version": "v002",
        "weaponIdRule": "Kit filenames use underscores (weapon_sword); atlas/catalogue partIds use hyphens (weapon-sword)."
      },
      "basePack": {
        "uiTap": "base/audio/ui-tap.m4a",
        "musicLoop": "base/audio/music-loop.m4a",
        "hit": "base/audio/hit.m4a",
        "dodge": "base/audio/dodge.m4a",
        "defeat": "base/audio/defeat.m4a",
        "hush": "base/audio/hush.m4a",
        "win": "base/audio/win.m4a",
        "swing": "base/audio/swing.m4a"
      },
      "arena": {
        "quiet": {
          "image": "arenas/quiet/bg.png",
          "ambient": "arenas/quiet/ambient.m4a"
        }
      },
      "fx": {
        "hit": "fx/hit.png",
        "dodge": "fx/dodge.png",
        "defeat": "fx/defeat.png"
      }
    }'::jsonb,
    false,
    'C13 workshop-frame-v002 pack. Draft until Storage API upload + publish_atlas_version(v2).'
)
on conflict (version) do nothing;

-- Carry-forward proof catalogue + base / arena / FX (same paths as v1).
insert into public.atlas_manifest_entries (
    version, asset_key, kind, part_id, role, path, sound_tags
)
select 'v2', v.asset_key, v.kind, v.part_id, v.role, v.path, v.sound_tags
from (
  values
    ('manifest.root', 'manifest', null::text, 'manifest', 'manifest.json', '[]'::jsonb),
    ('base.ui_tap', 'audio', null, 'ui_tap', 'base/audio/ui-tap.m4a', '[]'::jsonb),
    ('base.music_loop', 'audio', null, 'music_loop', 'base/audio/music-loop.m4a', '[]'::jsonb),
    ('base.hit', 'audio', null, 'hit', 'base/audio/hit.m4a', '[]'::jsonb),
    ('base.dodge', 'audio', null, 'dodge', 'base/audio/dodge.m4a', '[]'::jsonb),
    ('base.defeat', 'audio', null, 'defeat', 'base/audio/defeat.m4a', '[]'::jsonb),
    ('base.hush', 'audio', null, 'hush', 'base/audio/hush.m4a', '[]'::jsonb),
    ('base.win', 'audio', null, 'win', 'base/audio/win.m4a', '[]'::jsonb),
    ('base.swing', 'audio', null, 'swing', 'base/audio/swing.m4a', '[]'::jsonb),
    ('arena.quiet.image', 'image', null, 'arena', 'arenas/quiet/bg.png', '[]'::jsonb),
    ('arena.quiet.ambient', 'audio', null, 'arena', 'arenas/quiet/ambient.m4a', '[]'::jsonb),
    ('fx.hit', 'image', null, 'fx', 'fx/hit.png', '[]'::jsonb),
    ('fx.dodge', 'image', null, 'fx', 'fx/dodge.png', '[]'::jsonb),
    ('fx.defeat', 'image', null, 'fx', 'fx/defeat.png', '[]'::jsonb),
    ('parts.chassis-basic.body', 'image', 'chassis-basic', 'body', 'parts/chassis-basic/body.png', '["chassis.light"]'::jsonb),
    ('parts.chassis-basic.mask', 'image', 'chassis-basic', 'mask', 'parts/chassis-basic/mask.png', '[]'::jsonb),
    ('parts.chassis-basic.hit', 'audio', 'chassis-basic', 'hit', 'parts/chassis-basic/hit.m4a', '["chassis.light"]'::jsonb),
    ('parts.paint-crimson.swatch', 'image', 'paint-crimson', 'swatch', 'parts/paint-crimson/swatch.png', '[]'::jsonb),
    ('parts.paint-cobalt.swatch', 'image', 'paint-cobalt', 'swatch', 'parts/paint-cobalt/swatch.png', '[]'::jsonb),
    ('parts.weapon-sword.sprite', 'image', 'weapon-sword', 'sprite', 'parts/weapon-sword/sprite.png', '["weapon.sword"]'::jsonb),
    ('parts.weapon-sword.swing', 'audio', 'weapon-sword', 'swing', 'parts/weapon-sword/swing.m4a', '["weapon.sword"]'::jsonb),
    ('parts.weapon-axe.sprite', 'image', 'weapon-axe', 'sprite', 'parts/weapon-axe/sprite.png', '["weapon.axe"]'::jsonb),
    ('parts.weapon-axe.swing', 'audio', 'weapon-axe', 'swing', 'parts/weapon-axe/swing.m4a', '["weapon.axe"]'::jsonb),
    ('parts.weapon-dagger.sprite', 'image', 'weapon-dagger', 'sprite', 'parts/weapon-dagger/sprite.png', '["weapon.dagger"]'::jsonb),
    ('parts.weapon-dagger.swing', 'audio', 'weapon-dagger', 'swing', 'parts/weapon-dagger/swing.m4a', '["weapon.dagger"]'::jsonb)
) as v(asset_key, kind, part_id, role, path, sound_tags)
where exists (select 1 from public.atlas_versions where version = 'v2' and status = 'draft')
  and not exists (
    select 1 from public.atlas_manifest_entries e
     where e.version = 'v2' and e.asset_key = v.asset_key
  );

-- Workshop Frame kit-v002 layers (hyphenated partIds).
insert into public.atlas_manifest_entries (
    version, asset_key, kind, part_id, role, path, sound_tags
)
select
    'v2',
    'parts.' || m.part_id || '.' || m.role,
    'image',
    m.part_id,
    m.role,
    m.path,
    '[]'::jsonb
from (
  select
      replace(a.kit_id, '_', '-') as part_id,
      layer.role,
      'parts/' || replace(a.kit_id, '_', '-') || '/' || layer.file as path
  from (
    values
      ('torso'),
      ('head'),
      ('pelvis'),
      ('upper_arm_l'),
      ('forearm_l'),
      ('hand_l'),
      ('thigh_l'),
      ('shin_l'),
      ('foot_l'),
      ('upper_arm_r'),
      ('forearm_r'),
      ('hand_r'),
      ('thigh_r'),
      ('shin_r'),
      ('foot_r'),
      ('weapon_sword'),
      ('weapon_axe'),
      ('weapon_dagger')
  ) as a(kit_id)
  cross join (
    values
      ('oxide', 'oxide.png'),
      ('petrol', 'petrol.png'),
      ('material_under', 'material-under.png'),
      ('material_over', 'material-over.png'),
      ('mask', 'mask.png')
  ) as layer(role, file)
) as m
where exists (select 1 from public.atlas_versions where version = 'v2' and status = 'draft')
  and not exists (
    select 1
      from public.atlas_manifest_entries e
     where e.version = 'v2'
       and e.asset_key = 'parts.' || m.part_id || '.' || m.role
  );

comment on table public.atlas_versions is
  'Registry of atlas/vN media pack versions. Published rows are immutable. v1=proof pack; v2=workshop-frame-v002.';
