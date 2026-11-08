-- 0017: versioned media packs (atlas/vN/) + manifest + Storage policies
--
-- F5. Image and audio packs live under the atlas bucket as atlas/vN/...
-- Published versions are immutable. Manifest maps catalogue parts (and the
-- base pack / quiet arena / hit-dodge-defeat FX) to pack-relative files.
-- Fights pin media version refs on battle_participants.atlas_version.
-- Placeholder proof pack only — no final export/cache budgets.

-- ---------------------------------------------------------------------------
-- Version registry + relational manifest
-- ---------------------------------------------------------------------------

create table public.atlas_versions (
    version text primary key
        check (version ~ '^v[0-9]+$'),
    status text not null
        check (status in ('draft', 'published')),
    published_at timestamptz,
    -- Full JSON manifest (same shape as atlas/vN/manifest.json).
    manifest jsonb not null
        check (jsonb_typeof(manifest) = 'object'),
    -- Explicit: size / cache numbers here are provisional until on-phone proof.
    budgets_final boolean not null default false,
    notes text not null default '',
    created_at timestamptz not null default now(),
    constraint atlas_versions_published_has_timestamp check (
        (status = 'published' and published_at is not null)
        or (status = 'draft' and published_at is null)
    ),
    constraint atlas_versions_budgets_not_final_yet check (budgets_final = false)
);

comment on table public.atlas_versions is
  'Registry of atlas/vN media pack versions. Published rows are immutable.';
comment on column public.atlas_versions.budgets_final is
  'Must stay false until export sizes / cache budgets are approved on-phone.';

create table public.atlas_manifest_entries (
    entry_id bigserial primary key,
    version text not null references public.atlas_versions (version) on delete cascade,
    -- Logical asset key within the pack (e.g. parts.chassis-basic.body).
    asset_key text not null
        check (char_length(asset_key) between 1 and 128),
    kind text not null
        check (kind in ('image', 'audio', 'manifest')),
    -- Optional catalogue part this file belongs to (null for base/arena/fx).
    -- Not a FK: atlas seed runs in 0017 before parts_catalogue seed (1001).
    part_id text
        check (part_id is null or char_length(part_id) between 1 and 64),
    -- Role within the pack: body, mask, swatch, sprite, swing, hit, base, arena, fx, …
    role text not null
        check (char_length(role) between 1 and 64),
    -- Object path relative to atlas/<version>/ (bucket object name = version/path).
    path text not null
        check (
            char_length(path) between 1 and 256
            and path !~ '^/'
            and path !~ '\.\.'
        ),
    sound_tags jsonb not null default '[]'::jsonb
        check (jsonb_typeof(sound_tags) = 'array'),
    created_at timestamptz not null default now(),
    unique (version, asset_key),
    unique (version, path)
);

create index atlas_manifest_entries_version_part_idx
    on public.atlas_manifest_entries (version, part_id)
    where part_id is not null;

create index atlas_manifest_entries_version_kind_idx
    on public.atlas_manifest_entries (version, kind);

comment on table public.atlas_manifest_entries is
  'Maps catalogue parts / base / arena / FX assets to files inside atlas/vN/.';

-- ---------------------------------------------------------------------------
-- Immutability of published versions (DB rows)
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

create trigger atlas_versions_immutability
    before update or delete on public.atlas_versions
    for each row execute function public.atlas_versions_immutability();

create or replace function public.atlas_manifest_entries_immutability()
returns trigger
language plpgsql
as $$
declare
    v_status text;
    v_version text;
begin
    v_version := case when tg_op = 'DELETE' then old.version else new.version end;
    select status into v_status from public.atlas_versions where version = v_version;
    if v_status = 'published' then
        raise exception
            'atlas_manifest_immutable: cannot % entries on published %',
            lower(tg_op), v_version
            using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create trigger atlas_manifest_entries_immutability
    before insert or update or delete on public.atlas_manifest_entries
    for each row execute function public.atlas_manifest_entries_immutability();

-- ---------------------------------------------------------------------------
-- Fight media version refs (denormalized pin at persist time)
-- ---------------------------------------------------------------------------

alter table public.battle_participants
    add column if not exists atlas_version text
        check (atlas_version is null or atlas_version ~ '^v[0-9]+$');

comment on column public.battle_participants.atlas_version is
  'Immutable media pack version used for this participant at fight time.';

create or replace function public.battle_participant_pin_atlas_version()
returns trigger
language plpgsql
as $$
begin
    if new.atlas_version is null and new.loadout_version_id is not null then
        select lv.atlas_version
          into new.atlas_version
          from public.bot_loadout_versions lv
         where lv.loadout_version_id = new.loadout_version_id;
    end if;
    return new;
end;
$$;

drop trigger if exists battle_participant_pin_atlas_version on public.battle_participants;
create trigger battle_participant_pin_atlas_version
    before insert on public.battle_participants
    for each row execute function public.battle_participant_pin_atlas_version();

-- Admin view: surface attacker/defender atlas versions on recent fights.
-- Column set changed vs F3 — must drop before recreate (OR REPLACE cannot rename).
drop view if exists public.admin_recent_battles;
create view public.admin_recent_battles
with (security_invoker = true) as
select
    b.battle_id,
    b.utc_day,
    b.rules_version,
    b.initiator_account_id,
    b.initiator_account_character,
    b.winner_id,
    b.end_reason,
    b.started_at,
    b.ended_at,
    atk.character_id as attacker_id,
    atk.loadout_version_id as attacker_loadout_version_id,
    atk.atlas_version as attacker_atlas_version,
    def.character_id as defender_id,
    def.loadout_version_id as defender_loadout_version_id,
    def.atlas_version as defender_atlas_version,
    pl.delta_xp as attacker_xp,
    r.checksum as replay_checksum,
    exists (
        select 1 from public.analytics_outbox o
         where (o.payload->>'battleId') = b.battle_id::text
           and o.event_name = 'battle_completed'
           and o.processed_at is null
    ) as outbox_pending
from public.battles b
left join public.battle_participants atk
  on atk.battle_id = b.battle_id and atk.side = 'attacker'
left join public.battle_participants def
  on def.battle_id = b.battle_id and def.side = 'defender'
left join public.progression_ledger pl
  on pl.battle_id = b.battle_id and pl.character_id = b.initiator_account_character
left join public.battle_replays r
  on r.battle_id = b.battle_id
order by b.started_at desc;

grant select on public.admin_recent_battles to authenticated, anon;

comment on view public.admin_recent_battles is
  'Admin/ops view of persisted fights (incl. atlas version pins) for future B2 dashboard.';

-- ---------------------------------------------------------------------------
-- Storage bucket + policies + published-prefix immutability guard
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'atlas',
    'atlas',
    false,
    52428800, -- 50 MiB soft ceiling for local; not a product cache budget
    array[
        'image/png',
        'audio/mp4',
        'audio/aac',
        'audio/x-m4a',
        'application/json',
        'application/octet-stream'
    ]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Drop any prior atlas policies so this migration is the source of truth.
do $$
declare
    r record;
begin
    for r in
        select policyname
          from pg_policies
         where schemaname = 'storage'
           and tablename = 'objects'
           and policyname like 'atlas %'
    loop
        execute format('drop policy if exists %I on storage.objects', r.policyname);
    end loop;
end $$;

-- Authenticated + anon may read atlas objects (CDN/client download path).
create policy "atlas read published packs"
    on storage.objects for select
    to authenticated, anon
    using (bucket_id = 'atlas');

-- No client INSERT/UPDATE/DELETE policies: deny-by-default for writes.
-- service_role bypasses RLS; the trigger below still freezes published prefixes.

create or replace function public.atlas_storage_objects_guard()
returns trigger
language plpgsql
as $$
declare
    v_object_name text;
    v_prefix text;
    v_status text;
begin
    v_object_name := case when tg_op = 'DELETE' then old.name else new.name end;
    if tg_op <> 'DELETE' and new.bucket_id is distinct from 'atlas' then
        return new;
    end if;
    if tg_op = 'DELETE' and old.bucket_id is distinct from 'atlas' then
        return old;
    end if;

    -- Object names are version/path (bucket id is 'atlas').
    v_prefix := split_part(v_object_name, '/', 1);
    if v_prefix ~ '^v[0-9]+$' then
        select status into v_status
          from public.atlas_versions
         where version = v_prefix;
        if v_status = 'published' then
            if tg_op = 'INSERT' then
                -- Seed/publish path inserts files while still draft, then
                -- publishes. Re-inserts under a published prefix are blocked.
                raise exception
                    'atlas_storage_immutable: cannot insert under published %',
                    v_prefix
                    using errcode = '55000';
            elsif tg_op = 'UPDATE' then
                raise exception
                    'atlas_storage_immutable: cannot update object under published %',
                    v_prefix
                    using errcode = '55000';
            else
                raise exception
                    'atlas_storage_immutable: cannot delete object under published %',
                    v_prefix
                    using errcode = '55000';
            end if;
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists atlas_storage_objects_guard on storage.objects;
create trigger atlas_storage_objects_guard
    before insert or update or delete on storage.objects
    for each row execute function public.atlas_storage_objects_guard();

-- ---------------------------------------------------------------------------
-- Read helpers (client / Edge / smoke)
-- ---------------------------------------------------------------------------

create or replace function public.get_atlas_manifest(p_version text default 'v1')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_row public.atlas_versions%rowtype;
    v_entries jsonb;
begin
    if p_version is null or p_version !~ '^v[0-9]+$' then
        raise exception 'invalid_atlas_version: expected vN'
            using errcode = '22023';
    end if;

    select * into v_row from public.atlas_versions where version = p_version;
    if not found then
        return jsonb_build_object('ok', false, 'code', 'unknown_atlas_version');
    end if;

    if v_row.status is distinct from 'published' then
        return jsonb_build_object('ok', false, 'code', 'atlas_version_not_published');
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'assetKey', e.asset_key,
            'kind', e.kind,
            'partId', to_jsonb(e.part_id),
            'role', e.role,
            'path', e.path,
            'storagePath', v_row.version || '/' || e.path,
            'soundTags', e.sound_tags
        )
        order by e.asset_key
    ), '[]'::jsonb)
      into v_entries
      from public.atlas_manifest_entries e
     where e.version = v_row.version;

    return jsonb_build_object(
        'ok', true,
        'version', v_row.version,
        'status', v_row.status,
        'publishedAt', v_row.published_at,
        'budgetsFinal', v_row.budgets_final,
        'manifest', v_row.manifest,
        'entries', v_entries,
        'bucket', 'atlas',
        'prefix', v_row.version || '/'
    );
end;
$$;

revoke all on function public.get_atlas_manifest(text) from public;
grant execute on function public.get_atlas_manifest(text) to authenticated, anon, service_role;

create or replace function public.publish_atlas_version(p_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_jwt_role text := coalesce(auth.role(), '');
    v_entry_count integer;
begin
    if v_jwt_role is distinct from 'service_role' then
        raise exception 'forbidden: publish_atlas_version requires service_role'
            using errcode = '42501';
    end if;

    if p_version is null or p_version !~ '^v[0-9]+$' then
        raise exception 'invalid_atlas_version: expected vN'
            using errcode = '22023';
    end if;

    select count(*) into v_entry_count
      from public.atlas_manifest_entries
     where version = p_version;
    if v_entry_count < 1 then
        raise exception 'atlas_publish_empty: % has no manifest entries', p_version
            using errcode = '22023';
    end if;

    update public.atlas_versions
       set status = 'published',
           published_at = now()
     where version = p_version
       and status = 'draft';

    if not found then
        if exists (select 1 from public.atlas_versions where version = p_version and status = 'published') then
            return jsonb_build_object('ok', true, 'version', p_version, 'alreadyPublished', true);
        end if;
        raise exception 'unknown_atlas_version: %', p_version
            using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'ok', true,
        'version', p_version,
        'alreadyPublished', false,
        'entryCount', v_entry_count
    );
end;
$$;

revoke all on function public.publish_atlas_version(text) from public;
revoke all on function public.publish_atlas_version(text) from anon;
revoke all on function public.publish_atlas_version(text) from authenticated;
grant execute on function public.publish_atlas_version(text) to service_role;

-- ---------------------------------------------------------------------------
-- save_bot_loadout: require a published atlas version (rest of body = F1)
-- ---------------------------------------------------------------------------

create or replace function public.save_bot_loadout(
    p_character_id text,
    p_loadout jsonb,
    p_atlas_version text default 'v1'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_character public.characters%rowtype;
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_chassis text;
    v_paint text;
    v_weapon text;
    v_shield text;
    v_drone text;
    v_decals jsonb;
    v_sound_tags jsonb;
    v_part_id text;
    v_version_id uuid;
    v_required text[] := array['chassis', 'paint', 'weapon'];
    v_key text;
    v_normalized jsonb;
    v_tag_elem jsonb;
    v_atlas_status text;
begin
    if p_loadout is null or jsonb_typeof(p_loadout) <> 'object' then
        raise exception 'invalid_loadout: loadout must be a JSON object'
            using errcode = '22023';
    end if;

    if p_atlas_version is null or p_atlas_version !~ '^v[0-9]+$' then
        raise exception 'invalid_atlas_version: expected vN (e.g. v1)'
            using errcode = '22023';
    end if;

    select status into v_atlas_status
      from public.atlas_versions
     where version = p_atlas_version;
    if not found then
        raise exception 'unknown_atlas_version: %', p_atlas_version
            using errcode = 'P0002';
    end if;
    if v_atlas_status is distinct from 'published' then
        raise exception 'unpublished_atlas_version: %', p_atlas_version
            using errcode = '22023';
    end if;

    select * into v_character
    from public.characters
    where character_id = p_character_id;

    if not found then
        raise exception 'unknown_character: %', p_character_id
            using errcode = 'P0002';
    end if;

    -- Explicit role gate: never treat "no JWT" as a privileged bypass.
    if v_jwt_role = 'service_role' then
        null; -- system path: seeds / Edge Functions may confirm any character
    elsif v_jwt_role = 'authenticated' then
        if v_caller is null
           or v_character.is_opponent
           or v_character.account_id is distinct from v_caller then
            raise exception 'forbidden: loadout save requires character ownership'
                using errcode = '42501';
        end if;
    else
        raise exception 'forbidden: save_bot_loadout requires authenticated or service_role'
            using errcode = '42501';
    end if;

    for v_key in select unnest(v_required) loop
        if not (p_loadout ? v_key)
           or jsonb_typeof(p_loadout -> v_key) <> 'string'
           or nullif(p_loadout ->> v_key, '') is null then
            raise exception 'invalid_loadout: missing required slot %', v_key
                using errcode = '22023';
        end if;
    end loop;

    v_chassis := p_loadout ->> 'chassis';
    v_paint := p_loadout ->> 'paint';
    v_weapon := p_loadout ->> 'weapon';

    -- Optional extension slots: null / missing / empty string => unequipped.
    v_shield := nullif(p_loadout ->> 'shield', '');
    v_drone := nullif(p_loadout ->> 'drone', '');

    if p_loadout ? 'decals' then
        if jsonb_typeof(p_loadout -> 'decals') <> 'array' then
            raise exception 'invalid_loadout: decals must be an array'
                using errcode = '22023';
        end if;
        v_decals := p_loadout -> 'decals';
        if jsonb_array_length(v_decals) > 8 then
            raise exception 'invalid_loadout: at most 8 decals'
                using errcode = '22023';
        end if;
    else
        v_decals := '[]'::jsonb;
    end if;

    -- Validate each equipped part exists, is active, and matches its slot.
    perform public._assert_part_slot(v_chassis, 'chassis', v_character.account_id, v_character.is_opponent);
    perform public._assert_part_slot(v_paint, 'paint', v_character.account_id, v_character.is_opponent);
    perform public._assert_part_slot(v_weapon, 'weapon', v_character.account_id, v_character.is_opponent);

    if v_shield is not null then
        perform public._assert_part_slot(v_shield, 'shield', v_character.account_id, v_character.is_opponent);
    end if;
    if v_drone is not null then
        perform public._assert_part_slot(v_drone, 'drone', v_character.account_id, v_character.is_opponent);
    end if;

    for v_part_id in
        select jsonb_array_elements_text(v_decals)
    loop
        perform public._assert_part_slot(v_part_id, 'decal', v_character.account_id, v_character.is_opponent);
    end loop;

    -- Derive sound tags from equipped sounding parts when omitted.
    if p_loadout ? 'soundTags' then
        if jsonb_typeof(p_loadout -> 'soundTags') <> 'array' then
            raise exception 'invalid_loadout: soundTags must be an array'
                using errcode = '22023';
        end if;
        for v_tag_elem in select value from jsonb_array_elements(p_loadout -> 'soundTags')
        loop
            if jsonb_typeof(v_tag_elem) <> 'string' then
                raise exception 'invalid_loadout: soundTags elements must be strings'
                    using errcode = '22023';
            end if;
        end loop;
        v_sound_tags := p_loadout -> 'soundTags';
    else
        select coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)
        into v_sound_tags
        from (
            select distinct jsonb_array_elements_text(pc.sound_tags) as tag
            from public.parts_catalogue pc
            where pc.part_id in (v_chassis, v_weapon)
               or (v_shield is not null and pc.part_id = v_shield)
               or (v_drone is not null and pc.part_id = v_drone)
        ) t
        where tag is not null and tag <> '';
    end if;

    -- jsonb_build_object drops SQL NULL values; coalesce keeps explicit JSON nulls.
    v_normalized :=
        jsonb_build_object(
            'chassis', v_chassis,
            'paint', v_paint,
            'weapon', v_weapon,
            'decals', v_decals,
            'soundTags', v_sound_tags
        )
        || jsonb_build_object('shield', coalesce(to_jsonb(v_shield), 'null'::jsonb))
        || jsonb_build_object('drone', coalesce(to_jsonb(v_drone), 'null'::jsonb));

    insert into public.bot_loadout_versions (
        character_id,
        loadout,
        atlas_version
    ) values (
        p_character_id,
        v_normalized,
        p_atlas_version
    )
    returning loadout_version_id into v_version_id;

    return v_version_id;
end;
$$;

revoke all on function public.save_bot_loadout(text, jsonb, text) from public;
revoke all on function public.save_bot_loadout(text, jsonb, text) from anon;
grant execute on function public.save_bot_loadout(text, jsonb, text) to authenticated, service_role;

comment on function public.save_bot_loadout(text, jsonb, text) is
  'Validates ownership + slot compatibility + published atlas version; appends an immutable loadout version.';

-- ---------------------------------------------------------------------------
-- RLS for atlas tables
-- ---------------------------------------------------------------------------

alter table public.atlas_versions enable row level security;
alter table public.atlas_manifest_entries enable row level security;

create policy "published atlas versions read"
    on public.atlas_versions for select
    using (status = 'published');

create policy "published atlas manifest entries read"
    on public.atlas_manifest_entries for select
    using (
        exists (
            select 1 from public.atlas_versions av
             where av.version = atlas_manifest_entries.version
               and av.status = 'published'
        )
    );

grant select on public.atlas_versions to authenticated, anon;
grant select on public.atlas_manifest_entries to authenticated, anon;

create or replace function public.atlas_storage_object_count(p_version text)
returns integer
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
    v_count integer := 0;
begin
    if p_version is null or p_version !~ '^v[0-9]+$' then
        return 0;
    end if;
    begin
        select count(*)::integer into v_count
          from storage.objects o
         where o.bucket_id = 'atlas'
           and o.name like p_version || '/%';
    exception when others then
        v_count := 0;
    end;
    return coalesce(v_count, 0);
end;
$$;

revoke all on function public.atlas_storage_object_count(text) from public;
grant execute on function public.atlas_storage_object_count(text) to authenticated, anon, service_role;

create view public.admin_atlas_overview
with (security_invoker = true) as
select
    av.version,
    av.status,
    av.published_at,
    av.budgets_final,
    av.notes,
    (select count(*)::integer from public.atlas_manifest_entries e where e.version = av.version) as entry_count,
    (select count(*)::integer from public.atlas_manifest_entries e where e.version = av.version and e.part_id is not null) as part_entry_count,
    public.atlas_storage_object_count(av.version) as storage_object_count
from public.atlas_versions av
order by av.version;

grant select on public.admin_atlas_overview to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Health: include atlas pack readiness (preserve F4 gates)
-- ---------------------------------------------------------------------------

create or replace function public.backend_health_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_db_ok boolean := true;
    v_catalogue_parts integer;
    v_chassis integer;
    v_paints integer;
    v_weapons integer;
    v_loadouts integer;
    v_outbox_pending integer;
    v_outbox_failing integer;
    v_outbox_dead integer;
    v_pg_cron_present boolean := false;
    v_cron_jobs integer := 0;
    v_outbox_job boolean := false;
    v_allowance_job boolean := false;
    v_storage_atlas boolean := false;
    v_ready_fighters integer;
    v_ready_opponents integer;
    v_persist_present boolean := false;
    v_process_present boolean := false;
    v_battles_today integer;
    v_atlas_published integer := 0;
    v_atlas_entries integer := 0;
    v_atlas_part_entries integer := 0;
    v_atlas_objects integer := 0;
    v_atlas_proof boolean := false;
    v_latest_atlas text;
begin
    select count(*) into v_catalogue_parts from public.parts_catalogue where is_active;
    select count(*) into v_chassis from public.parts_catalogue where slot_kind = 'chassis' and is_active;
    select count(*) into v_paints from public.parts_catalogue where slot_kind = 'paint' and is_active;
    select count(*) into v_weapons from public.parts_catalogue where slot_kind = 'weapon' and is_active;
    select count(*) into v_loadouts from public.current_bot_loadouts;
    select count(*) into v_outbox_pending
      from public.analytics_outbox
     where processed_at is null and dead_lettered_at is null;
    select count(*) into v_outbox_failing
      from public.analytics_outbox
     where processed_at is null
       and dead_lettered_at is null
       and last_error is not null;
    select count(*) into v_outbox_dead
      from public.analytics_outbox
     where dead_lettered_at is not null;

    select count(*) into v_ready_fighters
      from public.characters c
      join public.current_character_builds cb using (character_id)
      join public.current_bot_loadouts cl using (character_id)
     where c.is_opponent = false
       and exists (
         select 1 from public.fight_allowances a
          where a.account_id = c.account_id
            and a.utc_day = (now() at time zone 'utc')::date
            and a.used_at is null
       );
    select count(*) into v_ready_opponents
      from public.characters c
      join public.current_character_builds cb using (character_id)
      join public.current_bot_loadouts cl using (character_id)
     where c.is_opponent = true;

    select exists(
        select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'persist_fight_result'
    ) into v_persist_present;

    select exists(
        select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'process_analytics_outbox'
    ) into v_process_present;

    select count(*) into v_battles_today
      from public.battles
     where utc_day = (now() at time zone 'utc')::date;

    begin
        select exists(
            select 1 from pg_extension where extname = 'pg_cron'
        ) into v_pg_cron_present;
    exception when others then
        v_pg_cron_present := false;
    end;

    if v_pg_cron_present then
        begin
            select count(*)::integer into v_cron_jobs
              from cron.job
             where jobname like 'botore-%' and active;
            select exists(
                select 1 from cron.job
                 where jobname = 'botore-outbox-drain' and active
            ) into v_outbox_job;
            select exists(
                select 1 from cron.job
                 where jobname = 'botore-allowance-refresh' and active
            ) into v_allowance_job;
        exception when others then
            v_cron_jobs := 0;
            v_outbox_job := false;
            v_allowance_job := false;
        end;
    end if;

    begin
        select exists(
            select 1 from storage.buckets where id = 'atlas'
        ) into v_storage_atlas;
    exception when others then
        v_storage_atlas := false;
    end;

    select count(*) into v_atlas_published
      from public.atlas_versions where status = 'published';
    select version into v_latest_atlas
      from public.atlas_versions
     where status = 'published'
     order by published_at desc nulls last, version desc
     limit 1;
    select count(*) into v_atlas_entries
      from public.atlas_manifest_entries e
      join public.atlas_versions av using (version)
     where av.status = 'published';
    select count(*) into v_atlas_part_entries
      from public.atlas_manifest_entries e
      join public.atlas_versions av using (version)
     where av.status = 'published' and e.part_id is not null;
    begin
        select count(*) into v_atlas_objects
          from storage.objects
         where bucket_id = 'atlas'
           and name like coalesce(v_latest_atlas, 'v1') || '/%';
    exception when others then
        v_atlas_objects := 0;
    end;

    -- Proof pack: 1 chassis + 2 paints + 3 weapons + base + quiet arena + 3 FX.
    v_atlas_proof := (
        v_storage_atlas
        and v_atlas_published >= 1
        and exists (
            select 1 from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.part_id = 'chassis-basic'
        )
        and (
            select count(distinct e.part_id) from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.part_id in (
                 'chassis-basic','paint-crimson','paint-cobalt',
                 'weapon-sword','weapon-axe','weapon-dagger'
               )
        ) = 6
        and exists (
            select 1 from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.role = 'arena' and e.path like 'arenas/quiet/%'
        )
        and exists (
            select 1 from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.kind = 'audio' and e.role = 'hit' and e.path like 'base/%'
        )
        and exists (
            select 1 from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.kind = 'audio' and e.role = 'dodge' and e.path like 'base/%'
        )
        and exists (
            select 1 from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.kind = 'audio' and e.role = 'defeat' and e.path like 'base/%'
        )
        and (
            select count(*) from public.atlas_manifest_entries e
             where e.version = coalesce(v_latest_atlas, 'v1')
               and e.role = 'fx'
               and e.path in ('fx/hit.png', 'fx/dodge.png', 'fx/defeat.png')
        ) = 3
    );

    return jsonb_build_object(
        'status', case
            when v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3
                 and v_loadouts >= 1 and v_ready_opponents >= 1
                 and v_persist_present and v_process_present
                 and v_pg_cron_present and v_outbox_job and v_allowance_job
                 and v_atlas_proof
            then 'ok' else 'degraded' end,
        'checks', jsonb_build_object(
            'database', v_db_ok,
            'parts_catalogue', jsonb_build_object(
                'total_active', v_catalogue_parts,
                'chassis', v_chassis,
                'paints', v_paints,
                'weapons', v_weapons,
                'proof_seed_ok', (v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3)
            ),
            'bot_loadouts', jsonb_build_object(
                'current_count', v_loadouts
            ),
            'fight', jsonb_build_object(
                'ready_to_fight', v_ready_fighters,
                'ready_as_opponent', v_ready_opponents,
                'edge_function', 'combat-v1',
                'persistence', case when v_persist_present
                    then 'persist_fight_result' else 'pending_f3' end,
                'battles_today', v_battles_today
            ),
            'analytics_outbox', jsonb_build_object(
                'pending', v_outbox_pending,
                'failing', v_outbox_failing,
                'dead_lettered', v_outbox_dead,
                'processor', case when v_process_present
                    then 'process_analytics_outbox' else 'pending_f4' end
            ),
            'pg_cron', jsonb_build_object(
                'present', v_pg_cron_present,
                'active_botore_jobs', v_cron_jobs,
                'outbox_drain_scheduled', v_outbox_job,
                'allowance_refresh_scheduled', v_allowance_job,
                'note', case
                    when v_pg_cron_present and v_outbox_job and v_allowance_job
                    then 'botore-outbox-drain + botore-allowance-refresh scheduled'
                    when v_pg_cron_present
                    then 'extension installed; botore jobs incomplete'
                    else 'pg_cron extension missing'
                end
            ),
            'storage', jsonb_build_object(
                'atlas_bucket', v_storage_atlas,
                'published_versions', v_atlas_published,
                'latest_version', to_jsonb(v_latest_atlas),
                'manifest_entries', v_atlas_entries,
                'part_entries', v_atlas_part_entries,
                'objects_for_latest', v_atlas_objects,
                'proof_pack_ok', v_atlas_proof,
                'budgets_final', false
            )
        ),
        'checked_at', now()
    );
end;
$$;

revoke all on function public.backend_health_snapshot() from public;
grant execute on function public.backend_health_snapshot() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Placeholder proof pack seed (v1) — draft → files → publish
-- Byte placeholders live in supabase/seed/atlas/v1/ for upload tooling;
-- this migration registers the version, manifest rows, and storage object keys.
-- ---------------------------------------------------------------------------

insert into public.atlas_versions (
    version, status, published_at, manifest, budgets_final, notes
) values (
    'v1',
    'draft',
    null,
    '{"version": "v1", "status": "published", "note": "Placeholder proof pack. Export sizes and cache budgets are provisional \u2014 not final.", "basePack": {"uiTap": "base/audio/ui-tap.m4a", "musicLoop": "base/audio/music-loop.m4a", "hit": "base/audio/hit.m4a", "dodge": "base/audio/dodge.m4a", "defeat": "base/audio/defeat.m4a", "hush": "base/audio/hush.m4a", "win": "base/audio/win.m4a", "swing": "base/audio/swing.m4a"}, "arena": {"quiet": {"image": "arenas/quiet/bg.png", "ambient": "arenas/quiet/ambient.m4a"}}, "fx": {"hit": "fx/hit.png", "dodge": "fx/dodge.png", "defeat": "fx/defeat.png"}, "parts": {"chassis-basic": {"images": ["parts/chassis-basic/body.png", "parts/chassis-basic/mask.png"], "audio": ["parts/chassis-basic/hit.m4a"], "soundTags": ["chassis.light"]}, "paint-crimson": {"images": ["parts/paint-crimson/swatch.png"], "audio": [], "soundTags": []}, "paint-cobalt": {"images": ["parts/paint-cobalt/swatch.png"], "audio": [], "soundTags": []}, "weapon-sword": {"images": ["parts/weapon-sword/sprite.png"], "audio": ["parts/weapon-sword/swing.m4a"], "soundTags": ["weapon.sword"]}, "weapon-axe": {"images": ["parts/weapon-axe/sprite.png"], "audio": ["parts/weapon-axe/swing.m4a"], "soundTags": ["weapon.axe"]}, "weapon-dagger": {"images": ["parts/weapon-dagger/sprite.png"], "audio": ["parts/weapon-dagger/swing.m4a"], "soundTags": ["weapon.dagger"]}}}'::jsonb,
    false,
    'Placeholder proof pack: 1 chassis, 2 paints, sword/axe/dagger, quiet arena, hit/dodge/defeat FX. Budgets not final.'
)
on conflict (version) do nothing;

insert into public.atlas_manifest_entries (
    version, asset_key, kind, part_id, role, path, sound_tags
)
select * from (values
  ('v1', 'manifest.root', 'manifest', null, 'manifest', 'manifest.json', '[]'::jsonb),
  ('v1', 'base.ui_tap', 'audio', null, 'ui_tap', 'base/audio/ui-tap.m4a', '[]'::jsonb),
  ('v1', 'base.music_loop', 'audio', null, 'music_loop', 'base/audio/music-loop.m4a', '[]'::jsonb),
  ('v1', 'base.hit', 'audio', null, 'hit', 'base/audio/hit.m4a', '[]'::jsonb),
  ('v1', 'base.dodge', 'audio', null, 'dodge', 'base/audio/dodge.m4a', '[]'::jsonb),
  ('v1', 'base.defeat', 'audio', null, 'defeat', 'base/audio/defeat.m4a', '[]'::jsonb),
  ('v1', 'base.hush', 'audio', null, 'hush', 'base/audio/hush.m4a', '[]'::jsonb),
  ('v1', 'base.win', 'audio', null, 'win', 'base/audio/win.m4a', '[]'::jsonb),
  ('v1', 'base.swing', 'audio', null, 'swing', 'base/audio/swing.m4a', '[]'::jsonb),
  ('v1', 'arena.quiet.image', 'image', null, 'arena', 'arenas/quiet/bg.png', '[]'::jsonb),
  ('v1', 'arena.quiet.ambient', 'audio', null, 'arena', 'arenas/quiet/ambient.m4a', '[]'::jsonb),
  ('v1', 'fx.hit', 'image', null, 'fx', 'fx/hit.png', '[]'::jsonb),
  ('v1', 'fx.dodge', 'image', null, 'fx', 'fx/dodge.png', '[]'::jsonb),
  ('v1', 'fx.defeat', 'image', null, 'fx', 'fx/defeat.png', '[]'::jsonb),
  ('v1', 'parts.chassis-basic.body', 'image', 'chassis-basic', 'body', 'parts/chassis-basic/body.png', '["chassis.light"]'::jsonb),
  ('v1', 'parts.chassis-basic.mask', 'image', 'chassis-basic', 'mask', 'parts/chassis-basic/mask.png', '[]'::jsonb),
  ('v1', 'parts.chassis-basic.hit', 'audio', 'chassis-basic', 'hit', 'parts/chassis-basic/hit.m4a', '["chassis.light"]'::jsonb),
  ('v1', 'parts.paint-crimson.swatch', 'image', 'paint-crimson', 'swatch', 'parts/paint-crimson/swatch.png', '[]'::jsonb),
  ('v1', 'parts.paint-cobalt.swatch', 'image', 'paint-cobalt', 'swatch', 'parts/paint-cobalt/swatch.png', '[]'::jsonb),
  ('v1', 'parts.weapon-sword.sprite', 'image', 'weapon-sword', 'sprite', 'parts/weapon-sword/sprite.png', '["weapon.sword"]'::jsonb),
  ('v1', 'parts.weapon-sword.swing', 'audio', 'weapon-sword', 'swing', 'parts/weapon-sword/swing.m4a', '["weapon.sword"]'::jsonb),
  ('v1', 'parts.weapon-axe.sprite', 'image', 'weapon-axe', 'sprite', 'parts/weapon-axe/sprite.png', '["weapon.axe"]'::jsonb),
  ('v1', 'parts.weapon-axe.swing', 'audio', 'weapon-axe', 'swing', 'parts/weapon-axe/swing.m4a', '["weapon.axe"]'::jsonb),
  ('v1', 'parts.weapon-dagger.sprite', 'image', 'weapon-dagger', 'sprite', 'parts/weapon-dagger/sprite.png', '["weapon.dagger"]'::jsonb),
  ('v1', 'parts.weapon-dagger.swing', 'audio', 'weapon-dagger', 'swing', 'parts/weapon-dagger/swing.m4a', '["weapon.dagger"]'::jsonb)
) as v(version, asset_key, kind, part_id, role, path, sound_tags)
where exists (select 1 from public.atlas_versions where version = 'v1' and status = 'draft')
  and not exists (
    select 1 from public.atlas_manifest_entries e
     where e.version = 'v1' and e.asset_key = v.asset_key
  );

-- Register storage object keys under atlas/v1/… (metadata only; bytes optional).
insert into storage.objects (bucket_id, name, owner, metadata)
select 'atlas', 'v1/' || e.path, null,
       jsonb_build_object(
         'placeholder', true,
         'kind', e.kind,
         'assetKey', e.asset_key,
         'mimetype', case
           when e.path like '%.png' then 'image/png'
           when e.path like '%.m4a' then 'audio/mp4'
           when e.path like '%.json' then 'application/json'
           else 'application/octet-stream'
         end
       )
  from public.atlas_manifest_entries e
 where e.version = 'v1'
   and exists (select 1 from public.atlas_versions where version = 'v1' and status = 'draft')
   and not exists (
     select 1 from storage.objects o
      where o.bucket_id = 'atlas' and o.name = 'v1/' || e.path
   );

-- Freeze v1 as published (immutable thereafter).
do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  if exists (select 1 from public.atlas_versions where version = 'v1' and status = 'draft') then
    perform public.publish_atlas_version('v1');
  end if;
end $$;
