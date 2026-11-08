-- 0015: F3 atomic fight persistence (idempotent).
--
-- persist_fight_result consumes one allowance (FOR UPDATE SKIP LOCKED),
-- writes battle + participants + replay + attacker XP + analytics outbox +
-- idempotency row in ONE transaction. Retries with the same
-- (account_id, idempotency_key) return the original result without side effects.
-- Defender pays nothing; defender core progression is never written.
--
-- Authz mirrors save_bot_loadout / prepare_fight_context:
--   service_role → Edge Function path
--   authenticated → only for auth.uid() = p_account_id
--   anon / bare → forbidden
--
-- Carlos authorization: ClickUp F3 (1amjtrexztz) implementer assignment.

create or replace function public._final_hp_from_replay(
    p_replay jsonb,
    p_character_id text,
    p_fallback integer
) returns integer
language sql
immutable
as $$
    select coalesce(
        (
            select (e->>'targetHpAfter')::integer
              from jsonb_array_elements(coalesce(p_replay->'events', '[]'::jsonb)) with ordinality as t(e, ord)
             where e->>'type' = 'damage_applied'
               and e->>'target' = p_character_id
             order by ord desc
             limit 1
        ),
        p_fallback
    );
$$;

revoke all on function public._final_hp_from_replay(jsonb, text, integer) from public;

create or replace function public.persist_fight_result(
    p_account_id uuid,
    p_idempotency_key text,
    p_opponent_id text,
    p_battle_id uuid,
    p_seed text,
    p_rules_version text,
    p_replay jsonb,
    p_attacker jsonb,
    p_defender jsonb,
    p_utc_day date default (now() at time zone 'utc')::date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_existing record;
    v_xp_awarded integer;
    v_allowance_id uuid;
    v_attacker_id text;
    v_defender_id text;
    v_attacker_loadout uuid;
    v_defender_loadout uuid;
    v_reason text;
    v_winner_id text;
    v_won boolean;
    v_xp integer;
    v_checksum text;
    v_input_hash text;
    v_replay_version integer;
    v_allowances_remaining integer;
    v_defender_is_opponent boolean;
    v_atk_hp_before integer;
    v_def_hp_before integer;
    v_atk_weapon_kind text;
    v_atk_weapon_power integer;
    v_def_weapon_kind text;
    v_def_weapon_power integer;
begin
    -- Explicit role gate (no anonymous / bare-postgres bypass).
    if v_jwt_role = 'service_role' then
        null;
    elsif v_jwt_role = 'authenticated' then
        if v_caller is null or v_caller is distinct from p_account_id then
            return jsonb_build_object(
                'ok', false,
                'code', 'forbidden',
                'message', 'persist_fight_result requires account ownership'
            );
        end if;
    else
        return jsonb_build_object(
            'ok', false,
            'code', 'forbidden',
            'message', 'persist_fight_result requires authenticated or service_role'
        );
    end if;

    if p_account_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'unauthenticated',
            'message', 'account required'
        );
    end if;

    if p_idempotency_key is null
       or char_length(p_idempotency_key) < 8
       or char_length(p_idempotency_key) > 128 then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_idempotency_key',
            'message', 'Idempotency-Key required (8..128 chars)'
        );
    end if;

    if p_battle_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_battle',
            'message', 'battleId required'
        );
    end if;

    if p_rules_version is distinct from 'combat-v1' then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_rules_version',
            'message', 'rulesVersion must be combat-v1'
        );
    end if;

    if p_replay is null or jsonb_typeof(p_replay) <> 'object' then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_replay',
            'message', 'replay must be a JSON object'
        );
    end if;

    if p_attacker is null or jsonb_typeof(p_attacker) <> 'object'
       or p_defender is null or jsonb_typeof(p_defender) <> 'object' then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_fighters',
            'message', 'attacker and defender snapshots required'
        );
    end if;

    -- Serialize same (account, key) retries; different keys still race via SKIP LOCKED.
    perform pg_advisory_xact_lock(
        hashtextextended(p_account_id::text || chr(31) || p_idempotency_key, 0)
    );

    -- 1) Idempotency lookup first.
    select
        b.battle_id,
        b.winner_id,
        b.end_reason,
        r.checksum
      into v_existing
      from public.battle_commands c
      join public.battles b using (battle_id)
      left join public.battle_replays r using (battle_id)
     where c.account_id = p_account_id
       and c.idempotency_key = p_idempotency_key;

    if found then
        select coalesce(sum(delta_xp), 0)::integer into v_xp_awarded
          from public.progression_ledger
         where account_id = p_account_id
           and battle_id = v_existing.battle_id;

        select count(*)::integer into v_allowances_remaining
          from public.fight_allowances
         where account_id = p_account_id
           and utc_day = p_utc_day
           and used_at is null;

        return jsonb_build_object(
            'ok', true,
            'repeated', true,
            'battleId', v_existing.battle_id,
            'xpAwarded', v_xp_awarded,
            'replayChecksum', coalesce(v_existing.checksum, ''),
            'winnerId', to_jsonb(v_existing.winner_id),
            'reason', v_existing.end_reason,
            'allowancesRemaining', v_allowances_remaining
        );
    end if;

    -- 2) Validate fighters / opponent.
    v_attacker_id := p_attacker->>'characterId';
    v_defender_id := coalesce(p_defender->>'characterId', p_opponent_id);
    v_attacker_loadout := nullif(p_attacker->>'loadoutVersionId', '')::uuid;
    v_defender_loadout := nullif(p_defender->>'loadoutVersionId', '')::uuid;
    v_atk_hp_before := coalesce((p_attacker->>'hp')::integer, 0);
    v_def_hp_before := coalesce((p_defender->>'hp')::integer, 0);
    v_atk_weapon_kind := p_attacker->>'weaponKind';
    v_atk_weapon_power := coalesce((p_attacker->>'weaponPower')::integer, 0);
    v_def_weapon_kind := p_defender->>'weaponKind';
    v_def_weapon_power := coalesce((p_defender->>'weaponPower')::integer, 0);

    if v_attacker_id is null or v_defender_id is null
       or v_atk_weapon_kind is null or v_def_weapon_kind is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_fighters',
            'message', 'fighter snapshots incomplete'
        );
    end if;

    if not exists (
        select 1 from public.characters c
         where c.character_id = v_attacker_id
           and c.account_id = p_account_id
           and c.is_opponent = false
    ) then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_attacker',
            'message', 'attacker must be the account player character'
        );
    end if;

    select c.is_opponent into v_defender_is_opponent
      from public.characters c
     where c.character_id = v_defender_id;

    if not found or not v_defender_is_opponent or v_defender_id is distinct from p_opponent_id then
        return jsonb_build_object(
            'ok', false,
            'code', 'unknown_opponent',
            'message', format('unknown opponent: %s', p_opponent_id)
        );
    end if;

    v_checksum := p_replay->>'checksum';
    v_input_hash := p_replay->>'inputHash';
    v_replay_version := coalesce((p_replay->>'replayVersion')::integer, 1);
    v_reason := p_replay->'outcome'->>'reason';

    if v_checksum is null or v_checksum !~ '^[0-9a-f]{64}$'
       or v_input_hash is null or v_input_hash !~ '^[0-9a-f]{64}$' then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_replay',
            'message', 'replay checksum/inputHash must be 64 hex chars'
        );
    end if;

    if v_reason is null or v_reason not in ('defeat', 'action_limit_tiebreak') then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_replay',
            'message', 'replay outcome.reason invalid'
        );
    end if;

    if coalesce(p_replay->>'battleId', '') is distinct from p_battle_id::text then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_replay',
            'message', 'replay.battleId must match battleId'
        );
    end if;

    if coalesce(p_replay->>'seed', '') is distinct from p_seed then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_replay',
            'message', 'replay.seed must match seed'
        );
    end if;

    if coalesce(p_replay->>'rulesVersion', '') is distinct from p_rules_version then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_replay',
            'message', 'replay.rulesVersion must match rulesVersion'
        );
    end if;

    if v_reason = 'defeat' then
        v_winner_id := p_replay->'outcome'->>'winner';
        v_won := (v_winner_id = v_attacker_id);
    else
        v_winner_id := null;
        v_won := (p_replay->'outcome'->>'winnerByTiebreak' = v_attacker_id);
    end if;

    v_xp := case when v_won then 2 else 1 end;

    -- 3) Consume one allowance atomically (attacker only).
    update public.fight_allowances
       set used_at = now()
     where fight_allowance_id = (
        select fa.fight_allowance_id
          from public.fight_allowances fa
         where fa.account_id = p_account_id
           and fa.utc_day = p_utc_day
           and fa.used_at is null
         order by fa.slot_index
         for update skip locked
         limit 1
     )
     returning fight_allowance_id into v_allowance_id;

    if v_allowance_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'allowance_exhausted',
            'message', 'daily fight allowance exhausted',
            'allowancesRemaining', 0,
            'utcDay', p_utc_day
        );
    end if;

    -- 4) Persist battle + participants + replay + attacker ledger + outbox.
    insert into public.battles (
        battle_id,
        rules_version,
        seed,
        started_at,
        ended_at,
        initiator_account_id,
        initiator_account_character,
        winner_id,
        end_reason,
        utc_day
    ) values (
        p_battle_id,
        p_rules_version,
        p_seed,
        now(),
        now(),
        p_account_id,
        v_attacker_id,
        v_winner_id,
        v_reason,
        p_utc_day
    );

    insert into public.battle_participants (
        battle_id, character_id, side, hp_before, hp_after,
        weapon_kind, weapon_power, loadout_version_id
    ) values
        (
            p_battle_id, v_attacker_id, 'attacker',
            v_atk_hp_before,
            public._final_hp_from_replay(p_replay, v_attacker_id, v_atk_hp_before),
            v_atk_weapon_kind, v_atk_weapon_power, v_attacker_loadout
        ),
        (
            p_battle_id, v_defender_id, 'defender',
            v_def_hp_before,
            public._final_hp_from_replay(p_replay, v_defender_id, v_def_hp_before),
            v_def_weapon_kind, v_def_weapon_power, v_defender_loadout
        );

    insert into public.battle_replays (
        battle_id, replay_version, payload, input_hash, checksum
    ) values (
        p_battle_id, v_replay_version, p_replay, v_input_hash, v_checksum
    );

    -- Attacker-only progression. Defender never receives XP here.
    insert into public.progression_ledger (
        entry_id, account_id, character_id, battle_id, delta_xp, reason
    ) values (
        gen_random_uuid(), p_account_id, v_attacker_id, p_battle_id, v_xp, 'battle'
    );

    insert into public.analytics_outbox (
        event_id, event_name, schema_version, context, payload
    ) values (
        gen_random_uuid(),
        'battle_completed',
        1,
        jsonb_build_object('accountId', p_account_id),
        jsonb_build_object(
            'battleId', p_battle_id,
            'won', v_won,
            'xpAwarded', v_xp
        )
    );

    -- 5) Idempotency row LAST so the unique constraint guards the write set.
    begin
        insert into public.battle_commands (account_id, idempotency_key, battle_id)
        values (p_account_id, p_idempotency_key, p_battle_id);
    exception
        when unique_violation then
            -- Concurrent same-key winner already committed; surface as repeated.
            select
                b.battle_id,
                b.winner_id,
                b.end_reason,
                r.checksum
              into v_existing
              from public.battle_commands c
              join public.battles b using (battle_id)
              left join public.battle_replays r using (battle_id)
             where c.account_id = p_account_id
               and c.idempotency_key = p_idempotency_key;

            select coalesce(sum(delta_xp), 0)::integer into v_xp_awarded
              from public.progression_ledger
             where account_id = p_account_id
               and battle_id = v_existing.battle_id;

            select count(*)::integer into v_allowances_remaining
              from public.fight_allowances
             where account_id = p_account_id
               and utc_day = p_utc_day
               and used_at is null;

            -- Abort THIS transaction's partial writes; caller sees repeated.
            raise exception 'BOTORE_IDEMPOTENT_RACE'
                using errcode = 'PT401';
    end;

    select count(*)::integer into v_allowances_remaining
      from public.fight_allowances
     where account_id = p_account_id
       and utc_day = p_utc_day
       and used_at is null;

    return jsonb_build_object(
        'ok', true,
        'repeated', false,
        'battleId', p_battle_id,
        'xpAwarded', v_xp,
        'replayChecksum', v_checksum,
        'winnerId', to_jsonb(v_winner_id),
        'reason', v_reason,
        'allowancesRemaining', v_allowances_remaining
    );

exception
    when sqlstate 'PT401' then
        -- Outer EXCEPTION rolls back this session's writes first; re-read winner.
        select coalesce(sum(delta_xp), 0)::integer into v_xp_awarded
          from public.progression_ledger
         where account_id = p_account_id
           and battle_id = v_existing.battle_id;

        select count(*)::integer into v_allowances_remaining
          from public.fight_allowances
         where account_id = p_account_id
           and utc_day = p_utc_day
           and used_at is null;

        return jsonb_build_object(
            'ok', true,
            'repeated', true,
            'battleId', v_existing.battle_id,
            'xpAwarded', v_xp_awarded,
            'replayChecksum', coalesce(v_existing.checksum, ''),
            'winnerId', to_jsonb(v_existing.winner_id),
            'reason', v_existing.end_reason,
            'allowancesRemaining', v_allowances_remaining
        );
end;
$$;

revoke all on function public.persist_fight_result(
    uuid, text, text, uuid, text, text, jsonb, jsonb, jsonb, date
) from public;
revoke all on function public.persist_fight_result(
    uuid, text, text, uuid, text, text, jsonb, jsonb, jsonb, date
) from anon;
grant execute on function public.persist_fight_result(
    uuid, text, text, uuid, text, text, jsonb, jsonb, jsonb, date
) to service_role, authenticated;

comment on function public.persist_fight_result(
    uuid, text, text, uuid, text, text, jsonb, jsonb, jsonb, date
) is
  'F3 atomic fight persist: allowance consume + battle/replay/ledger/outbox + idempotency. Attacker XP only.';

-- B2-oriented readability: recent persisted fights (not a UI).
create or replace view public.admin_recent_battles
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
    def.character_id as defender_id,
    def.loadout_version_id as defender_loadout_version_id,
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
  'Admin/ops view of persisted fights for future B2 dashboard (not a UI).';

-- Health: persistence is live (F4 still owns outbox drain / pg_cron jobs).
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
    v_pg_cron_present boolean := false;
    v_storage_atlas boolean := false;
    v_ready_fighters integer;
    v_ready_opponents integer;
    v_persist_present boolean := false;
    v_battles_today integer;
begin
    select count(*) into v_catalogue_parts from public.parts_catalogue where is_active;
    select count(*) into v_chassis from public.parts_catalogue where slot_kind = 'chassis' and is_active;
    select count(*) into v_paints from public.parts_catalogue where slot_kind = 'paint' and is_active;
    select count(*) into v_weapons from public.parts_catalogue where slot_kind = 'weapon' and is_active;
    select count(*) into v_loadouts from public.current_bot_loadouts;
    select count(*) into v_outbox_pending
      from public.analytics_outbox where processed_at is null;

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

    begin
        select exists(
            select 1 from storage.buckets where id = 'atlas'
        ) into v_storage_atlas;
    exception when others then
        v_storage_atlas := false;
    end;

    return jsonb_build_object(
        'status', case
            when v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3
                 and v_loadouts >= 1 and v_ready_opponents >= 1
                 and v_persist_present
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
                'pending', v_outbox_pending
            ),
            'pg_cron', jsonb_build_object(
                'present', v_pg_cron_present,
                'note', case when v_pg_cron_present
                    then 'extension installed'
                    else 'not configured yet (expected until F4)' end
            ),
            'storage', jsonb_build_object(
                'atlas_bucket', v_storage_atlas
            )
        ),
        'checked_at', now()
    );
end;
$$;

revoke all on function public.backend_health_snapshot() from public;
grant execute on function public.backend_health_snapshot() to authenticated, anon, service_role;
