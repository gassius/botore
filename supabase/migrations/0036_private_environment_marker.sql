-- 0036: Hosted-writable environment marker for Dev-only atlas reopen
-- Needs Carlos migration yes before merge.
--
-- Problem: hosted Supabase Postgres is not a superuser, so
--   alter database postgres set app.environment = 'development'
-- fails with 42501 after 0031. That blocked the BT-171 Dev reopen runbook.
--
-- Fix: one-row table private.environment (Infra INSERTs on Dev only — never
-- from a migration). Absent row = fail closed. Atlas reopen guard reads via
-- SECURITY DEFINER helper private.app_environment(), not current_setting.
-- Keeps 0031 fail-closed semantics: reopen needs env='development' +
-- transaction GUC app.atlas_dev_reopen=on + confirm string.

-- ---------------------------------------------------------------------------
-- private schema + singleton environment row
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.environment (
    singleton boolean primary key default true check (singleton),
    env text not null
        check (env in ('development', 'staging', 'production'))
);

comment on table private.environment is
  'Singleton environment marker for Dev-only operations (atlas reopen). Infra sets on hosted Development only — never from migrations. Absent row = fail closed.';

alter table private.environment enable row level security;

-- Deny-by-default: no policies, no client grants. Owner / SECURITY DEFINER only.
revoke all on table private.environment from public;
revoke all on table private.environment from anon;
revoke all on table private.environment from authenticated;
-- Intentionally no GRANT to authenticated / anon / service_role.

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER reader (absent row → NULL → fail closed)
-- ---------------------------------------------------------------------------
create or replace function private.app_environment()
returns text
language sql
stable
security definer
set search_path = private
as $$
  select env from private.environment where singleton is true limit 1;
$$;

revoke all on function private.app_environment() from public;
revoke all on function private.app_environment() from anon;
revoke all on function private.app_environment() from authenticated;
-- Callers are other SECURITY DEFINER / owner paths (trigger + reopen RPC).

comment on function private.app_environment() is
  'Returns private.environment.env or NULL when the singleton row is absent. Fail closed for Dev-only gates.';

-- ---------------------------------------------------------------------------
-- Immutability: published → draft ONLY when Dev env marker + reopen GUC
-- ---------------------------------------------------------------------------
create or replace function public.atlas_versions_immutability()
returns trigger
language plpgsql
set search_path = public, private
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
        -- Fail closed unless BOTH the Dev DB marker and the reopen GUC are set.
        if tg_op = 'UPDATE'
           and new.status = 'draft'
           and new.published_at is null
           and coalesce(private.app_environment(), '') = 'development'
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
-- Dev-only reopen (service_role). Fail closed without private.environment=development.
-- ---------------------------------------------------------------------------
create or replace function public.dev_reopen_atlas_version(
    p_version text,
    p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, storage
as $$
declare
    v_jwt_role text := coalesce(auth.role(), '');
    v_status text;
    v_env text := coalesce(private.app_environment(), '');
begin
    if v_jwt_role is distinct from 'service_role' then
        raise exception 'forbidden: dev_reopen_atlas_version requires service_role'
            using errcode = '42501';
    end if;

    -- Fail closed: Production never has this marker (Infra sets it on Dev only).
    if v_env is distinct from 'development' then
        raise exception 'forbidden: atlas reopen requires private.environment=development'
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
  'Development-only: reopen a published atlas version to draft. Requires private.environment.env=development (Infra INSERT on Dev DB only; never from migrations) + service_role + confirm DEVELOPMENT_ONLY_REOPEN. Fail closed on Production / absent row.';
