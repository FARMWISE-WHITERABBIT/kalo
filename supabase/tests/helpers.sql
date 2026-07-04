-- Shared test helpers. Each test file includes this via \ir helpers.sql when
-- run with psql, or is executed after it in the same session. All helpers are
-- created in a throwaway schema; test runs are wrapped in a transaction and
-- rolled back, so nothing persists.

create schema if not exists kalo_test;

-- Creates a confirmed auth user (the handle_new_user trigger provisions the
-- profile and signup grant) and returns its id.
create or replace function kalo_test.mk_user(p_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'test-' || p_name || '-' || substr(v_id::text, 1, 8) || '@test.kalo.local',
    '!test!', now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_name),
    now(), now(), '', '', '', ''
  );
  return v_id;
end;
$$;

-- Runs subsequent RPCs as the given user (auth.uid() impersonation).
create or replace function kalo_test.act_as(p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
$$;

-- Creates an open test market and returns its id.
create or replace function kalo_test.mk_market(p_question text, p_close_at timestamptz default now() + interval '1 day')
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.markets (question, category, status, close_at)
    values (p_question, 'Test', 'open', p_close_at)
    returning id into v_id;
  return v_id;
end;
$$;

-- Asserts that a statement raises; fails the test if it succeeds.
create or replace function kalo_test.expect_error(p_sql text, p_label text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok: % rejected (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % was accepted but must be rejected', p_label;
end;
$$;

create or replace function kalo_test.check(p_cond boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;
