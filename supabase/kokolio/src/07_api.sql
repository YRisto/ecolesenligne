-- =====================================================================
-- Kokolio — porte d'entrée unique, droits d'exécution, compte administrateur de départ
-- =====================================================================

create or replace function kokolio._dispatch(p jsonb) returns jsonb language plpgsql as $$
declare v_action text := coalesce(p->>'action', ''); v_args jsonb := coalesce(p->'args', '{}'::jsonb); me kokolio.users;
begin
  -- horloge de test : ignorée en production (la ligne « test_mode » n'y existe pas)
  if p ? '_now' and exists (select 1 from kokolio.meta m where m.key = 'test_mode' and m.value = 'true'::jsonb) then
    perform set_config('kokolio.test_now', p->>'_now', true);
  end if;

  -- sans session
  case v_action
    when 'ping' then
      return jsonb_build_object(
        'schema', (select m.value from kokolio.meta m where m.key = 'schema_version'),
        'company', (select m.value->>'company' from kokolio.meta m where m.key = 'settings'),
        'logo_url', (select m.value->>'logo_url' from kokolio.meta m where m.key = 'settings'),
        'today', kokolio._today());
    when 'auth_salt' then return kokolio._auth_salt(v_args);
    when 'login' then return kokolio._login(p, v_args);
    when 'activate' then return kokolio._activate(p, v_args);
    when 'logout' then
      delete from kokolio.sessions s where s.token_hash = coalesce(p->>'token', '');
      return '{}'::jsonb;
    else null;
  end case;

  -- avec session : le compte est vérifié à chaque appel
  me := kokolio._me(p);
  case v_action
    when 'ctx' then return kokolio._ctx(me);
    when 'read' then return kokolio._read(me, v_args);
    when 'pending' then return kokolio._pending(me, v_args);
    when 'punch' then return kokolio._punch(me, p, v_args);
    when 'day_lieu' then return kokolio._day_lieu(me, v_args);
    when 'day_set' then return kokolio._day_set(me, p, v_args);
    when 'days_decide' then return kokolio._days_decide(me, p, v_args);
    when 'punch_log' then return kokolio._punch_log(me, v_args);
    when 'absence_create' then return kokolio._absence_create(me, p, v_args);
    when 'absence_cancel' then return kokolio._absence_cancel(me, p, v_args);
    when 'absence_decide' then return kokolio._absence_decide(me, p, v_args);
    when 'absence_attach' then return kokolio._absence_attach(me, p, v_args);
    when 'doc_get' then return kokolio._doc_get(me, p, v_args);
    when 'user_get' then return kokolio._user_get(me, v_args);
    when 'user_save' then return kokolio._user_save(me, p, v_args);
    when 'contract_set' then return kokolio._contract_set(me, p, v_args);
    when 'users_import' then return kokolio._users_import(me, p, v_args);
    when 'activation_new' then return kokolio._activation_new(me, p, v_args);
    when 'balance_add' then return kokolio._balance_add(me, p, v_args);
    when 'balance_bulk' then return kokolio._balance_bulk(me, p, v_args);
    when 'month_check' then return kokolio._month_check(me, v_args);
    when 'month_close' then return kokolio._month_close(me, p, v_args);
    when 'month_reopen' then return kokolio._month_reopen(me, p, v_args);
    when 'closures' then return kokolio._closures(me);
    when 'closure_get' then return kokolio._closure_get(me, p, v_args);
    when 'journal' then return kokolio._journal(me, v_args);
    when 'journal_verify' then return kokolio._journal_verify(me, v_args);
    when 'settings_set' then return kokolio._settings_set(me, p, v_args);
    when 'type_save' then return kokolio._type_save(me, p, v_args);
    when 'status' then return kokolio._status(me);
    when 'password_change' then return kokolio._password_change(me, p, v_args);
    when 'sessions' then return kokolio._sessions(me, p);
    when 'sessions_revoke' then
      delete from kokolio.sessions s where s.user_id = me.id and s.token_hash <> coalesce(p->>'token', '');
      return '{}'::jsonb;
    when 'selftest' then
      if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
      return kokolio.selftest();
    else null;
  end case;
  perform kokolio._fail('requete', 'Action inconnue.');
  return null;
end $$;

-- Seule fonction visible de l'API. Elle s'exécute avec les droits du propriétaire des tables,
-- mais n'est appelable que par le rôle serveur, et ne fait rien sans session valide.
create or replace function public.kokolio_api(p jsonb) returns jsonb
language plpgsql security definer set search_path = kokolio, pg_temp as $$
declare v_code text;
begin
  begin
    return jsonb_build_object('ok', true, 'data', kokolio._dispatch(coalesce(p, '{}'::jsonb)));
  exception when others then
    if sqlerrm like 'KK:%' then
      v_code := split_part(sqlerrm, ':', 2);
      return jsonb_build_object('ok', false, 'code', v_code, 'message', substr(sqlerrm, 5 + length(v_code)));
    end if;
    return jsonb_build_object('ok', false, 'code', 'interne', 'message', 'Erreur interne.', 'debug', sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- Droits : personne d'autre que le rôle serveur ne peut appeler la porte d'entrée ; personne n'accède au schéma.
revoke all on function public.kokolio_api(jsonb) from public;
revoke all on all functions in schema kokolio from public;
alter default privileges in schema kokolio revoke execute on functions from public;
do $$
declare v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role) then
      execute format('revoke all on function public.kokolio_api(jsonb) from %I', v_role);
      execute format('revoke all on schema kokolio from %I', v_role);
      execute format('revoke all on all tables in schema kokolio from %I', v_role);
      execute format('revoke all on all sequences in schema kokolio from %I', v_role);
      execute format('revoke all on all functions in schema kokolio from %I', v_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles r where r.rolname = 'service_role') then
    execute 'grant execute on function public.kokolio_api(jsonb) to service_role';
  end if;
end $$;

-- Compte administrateur de départ : à lancer une fois depuis la console SQL. Renvoie un code d'activation à usage unique.
-- Relancée sur un compte administrateur existant, elle génère un nouveau code (dépannage).
create or replace function kokolio.bootstrap_admin(p_login text default 'admin', p_last_name text default 'Administrateur') returns text language plpgsql as $$
declare
  u kokolio.users; v_login text := lower(trim(p_login)); v_raw bytea; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := ''; v_i int; v_days int; c kokolio.contracts;
begin
  if v_login !~ '^[a-z0-9][a-z0-9._@-]{2,63}$' then raise exception 'Identifiant invalide.'; end if;
  v_raw := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8'));
  for v_i in 0..11 loop
    v_code := v_code || substr(v_alpha, (get_byte(v_raw, v_i) % 32) + 1, 1);
  end loop;
  select * into u from kokolio.users x where lower(x.login) = v_login for update;
  if u.id is null then
    insert into kokolio.users (login, role, last_name) values (v_login, 'admin', p_last_name) returning * into u;
    c := kokolio._contract_apply(u.id, date '2000-01-01', '{}'::jsonb, null);
  elsif u.role <> 'admin' then
    raise exception 'Le compte % existe déjà et n''est pas administrateur.', v_login;
  end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';
  update kokolio.users set act_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
    act_expires = now() + make_interval(days => coalesce(v_days, 14)), failed_count = 0, locked_until = null, disabled = false
  where id = u.id;
  perform kokolio._audit(null, 'administrateur_initialise', u.id, v_login, '{}'::jsonb, '');
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
end $$;
revoke all on function kokolio.bootstrap_admin(text, text) from public;

insert into kokolio.meta (key, value) values ('schema_version', '1'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';
