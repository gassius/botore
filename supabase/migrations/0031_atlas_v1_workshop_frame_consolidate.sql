-- 0031: Consolidate Development atlas onto v1 (kit-v003.3 / former v3 contents)
-- Needs Carlos migration yes before merge.
--
-- Design:
--   • Development keeps ONE atlas version: v1, holding proof pack + Workshop
--     Frame kit-v003 media keys (wraps included). Former v2/v3 pack dirs retire.
--   • Published packs stay immutable in Production. Development-only reopen is
--     gated by transaction GUC app.atlas_dev_reopen=on + confirm string.
--   • Migrations do NOT fabricate storage.objects. After this migration on a
--     fresh local reset, v1 remains draft until pack + seed-atlas-storage.
--   • Hosted Development (already published old v1): Infra runs the reopen
--     runbook in docs/backend/verify.md, then register + upload + publish.
--
-- Does not edit applied migrations 0017 / 0026 / 0030.

-- ---------------------------------------------------------------------------
-- Immutability: allow published → draft ONLY when app.atlas_dev_reopen=on
-- ---------------------------------------------------------------------------
create or replace function public.atlas_versions_immutability()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'DELETE' then
        if old.status = 'published' then
            raise exception 'atlas_version_immutable: cannot delete published %', old.version
                using errcode = '55000';
        end if;
        return old;
    end if;

    if old.status = 'published' then
        -- Development-only reopen: published → draft with cleared published_at.
        if tg_op = 'UPDATE'
           and new.status = 'draft'
           and new.published_at is null
           and coalesce(current_setting('app.atlas_dev_reopen', true), '') = 'on'
        then
            if new.version is distinct from old.version then
                raise exception 'atlas_version_immutable: version id cannot change'
                    using errcode = '55000';
            end if;
            return new;
        end if;
        raise exception 'atlas_version_immutable: cannot modify published %', old.version
            using errcode = '55000';
    end if;

    -- draft → published is the only allowed status transition on UPDATE.
    if new.status = 'published' and old.status = 'draft' then
        if new.published_at is null then
            new.published_at := now();
        end if;
        return new;
    end if;

    if new.version is distinct from old.version then
        raise exception 'atlas_version_immutable: version id cannot change'
            using errcode = '55000';
    end if;

    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dev-only reopen (service_role). Production must never set the GUC / confirm.
-- ---------------------------------------------------------------------------
create or replace function public.dev_reopen_atlas_version(
    p_version text,
    p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
    v_jwt_role text := coalesce(auth.role(), '');
    v_status text;
begin
    if v_jwt_role is distinct from 'service_role' then
        raise exception 'forbidden: dev_reopen_atlas_version requires service_role'
            using errcode = '42501';
    end if;

    if p_confirm is distinct from 'DEVELOPMENT_ONLY_REOPEN' then
        raise exception 'atlas_dev_reopen_confirm_required: pass DEVELOPMENT_ONLY_REOPEN'
            using errcode = '22023';
    end if;

    if p_version is null or p_version !~ '^v[0-9]+$' then
        raise exception 'invalid_atlas_version: expected vN'
            using errcode = '22023';
    end if;

    -- Serialize against concurrent publish / mutations.
    perform public.atlas_lock_versions(array[p_version]);

    select status into v_status from public.atlas_versions where version = p_version;
    if not found then
        raise exception 'unknown_atlas_version: %', p_version
            using errcode = 'P0002';
    end if;

    if v_status = 'draft' then
        return jsonb_build_object(
            'ok', true,
            'version', p_version,
            'alreadyDraft', true
        );
    end if;

    if v_status is distinct from 'published' then
        raise exception 'atlas_dev_reopen_invalid_status: % is %', p_version, v_status
            using errcode = '22023';
    end if;

    -- Transaction-local GUC so the immutability trigger allows published→draft.
    perform set_config('app.atlas_dev_reopen', 'on', true);

    update public.atlas_versions
       set status = 'draft',
           published_at = null,
           notes = coalesce(notes, '') || ' [dev-reopened]'
     where version = p_version
       and status = 'published';

    if not found then
        raise exception 'atlas_dev_reopen_race: % was not published at commit', p_version
            using errcode = '40001';
    end if;

    return jsonb_build_object(
        'ok', true,
        'version', p_version,
        'alreadyDraft', false,
        'status', 'draft'
    );
end;
$$;

revoke all on function public.dev_reopen_atlas_version(text, text) from public;
revoke all on function public.dev_reopen_atlas_version(text, text) from anon;
revoke all on function public.dev_reopen_atlas_version(text, text) from authenticated;
grant execute on function public.dev_reopen_atlas_version(text, text) to service_role;

comment on function public.dev_reopen_atlas_version(text, text) is
  'Development-only: reopen a published atlas version to draft so Storage API can replace payloads. Requires service_role + confirm DEVELOPMENT_ONLY_REOPEN. Never call on Production.';

-- ---------------------------------------------------------------------------
-- Register kit-v003 workshop-frame entries onto v1 (draft only)
-- ---------------------------------------------------------------------------
create or replace function public.register_atlas_v1_workshop_frame_entries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
    v_inserted int := 0;
begin
    select status into v_status from public.atlas_versions where version = 'v1';
    if not found then
        raise exception 'unknown_atlas_version: v1' using errcode = 'P0002';
    end if;
    if v_status is distinct from 'draft' then
        raise exception 'atlas_register_requires_draft: v1 is %', v_status
            using errcode = '22023';
    end if;

    -- Refresh JSON manifest notes while draft (immutability allows draft updates).
    update public.atlas_versions
       set manifest = jsonb_build_object(
             'version', 'v1',
             'status', 'draft',
             'note', 'Proof pack + Workshop Frame kit-v003 on F5 parts/<hyphenatedPartId>/…. Single Development atlas. budgets_final stays false.',
             'kit', jsonb_build_object(
               'id', 'workshop-frame',
               'version', 'v003',
               'weaponIdRule', 'Kit filenames use underscores (weapon_sword); atlas/catalogue partIds use hyphens (weapon-sword).',
               'wraps', jsonb_build_array('hand_l_wrap', 'hand_r_wrap')
             ),
             'basePack', manifest->'basePack',
             'arena', manifest->'arena',
             'fx', manifest->'fx',
             'parts', manifest->'parts'
           ),
           notes = 'BT-171 single Development atlas: proof pack + workshop-frame-v003. Draft until Storage API upload + publish_atlas_version(v1).',
           budgets_final = false
     where version = 'v1' and status = 'draft';

    insert into public.atlas_manifest_entries (
        version, asset_key, kind, part_id, role, path, sound_tags
    )
    select
        'v1',
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
          ('hand_l_wrap'),
          ('thigh_l'),
          ('shin_l'),
          ('foot_l'),
          ('upper_arm_r'),
          ('forearm_r'),
          ('hand_r'),
          ('hand_r_wrap'),
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
    where not exists (
      select 1
        from public.atlas_manifest_entries e
       where e.version = 'v1'
         and e.asset_key = 'parts.' || m.part_id || '.' || m.role
    );

    get diagnostics v_inserted = row_count;

    return jsonb_build_object(
        'ok', true,
        'version', 'v1',
        'inserted', v_inserted
    );
end;
$$;

revoke all on function public.register_atlas_v1_workshop_frame_entries() from public;
revoke all on function public.register_atlas_v1_workshop_frame_entries() from anon;
revoke all on function public.register_atlas_v1_workshop_frame_entries() from authenticated;
grant execute on function public.register_atlas_v1_workshop_frame_entries() to service_role;

comment on function public.register_atlas_v1_workshop_frame_entries() is
  'Idempotent: add Workshop Frame kit-v003 manifest entries to draft atlas v1. Call after dev_reopen on hosted Development; runs automatically on fresh local migrations.';

-- Fresh local / CI: v1 is still draft here (publish happens in db-reset.sh).
select public.register_atlas_v1_workshop_frame_entries()
where exists (
  select 1 from public.atlas_versions where version = 'v1' and status = 'draft'
);

-- Soft-retire draft v2/v3 registrations (safe: published rows are immutable).
-- Hosted leftovers that are already published stay as historical artifacts;
-- clients pin v1 only.
delete from public.atlas_manifest_entries e
 where e.version in ('v2', 'v3')
   and exists (
     select 1 from public.atlas_versions v
      where v.version = e.version and v.status = 'draft'
   );

delete from public.atlas_versions
 where version in ('v2', 'v3')
   and status = 'draft';

comment on table public.atlas_versions is
  'Registry of atlas/vN media packs. Published rows are immutable. Development single source = v1 (proof + workshop-frame-v003). Former v2/v3 retired.';
