-- =====================================================================
-- Kokolio — comptes : connexion, activation, mot de passe
-- Le mot de passe n'arrive jamais ici en clair : le serveur l'a déjà transformé (scrypt) avec le sel du compte.
-- =====================================================================

create or replace function kokolio._account_ok(u kokolio.users) returns boolean language sql stable as $$
  select (u).id is not null and not (u).disabled and ((u).exit_date is null or (u).exit_date >= kokolio._today())
$$;

-- Sel du compte. Pour un identifiant inconnu, un sel factice mais stable est renvoyé :
-- la réponse ne permet pas de savoir si le compte existe.
create or replace function kokolio._auth_salt(p_args jsonb) returns jsonb language plpgsql stable as $$
declare u kokolio.users; v_login text := lower(trim(coalesce(p_args->>'login', ''))); v_pepper text;
begin
  select * into u from kokolio.users x where lower(x.login) = v_login;
  if u.id is not null and u.pw_hash is not null then
    return jsonb_build_object('salt', u.pw_salt, 'params', u.pw_params);
  end if;
  select m.value->>'v' into v_pepper from kokolio.meta m where m.key = 'pepper';
  return jsonb_build_object(
    'salt', substr(encode(sha256(convert_to(coalesce(v_pepper, '') || '|' || v_login, 'UTF8')), 'hex'), 1, 32),
    'params', null);
end $$;

create or replace function kokolio._auth_fail(u kokolio.users, p_ip text) returns jsonb language plpgsql as $$
declare v_now timestamptz := kokolio._now();
begin
  perform kokolio._throttle_hit(p_ip);
  if u.id is null then
    return jsonb_build_object('status', 'fail');
  end if;
  if u.failed_count + 1 >= 5 then
    update kokolio.users set failed_count = 0, locked_until = v_now + interval '15 minutes' where id = u.id;
    perform kokolio._audit(null, 'compte_bloque', u.id, u.login, jsonb_build_object('motif', '5 échecs consécutifs'), p_ip);
    return jsonb_build_object('status', 'locked', 'until', v_now + interval '15 minutes');
  end if;
  update kokolio.users set failed_count = u.failed_count + 1 where id = u.id;
  return jsonb_build_object('status', 'fail');
end $$;

create or replace function kokolio._login(p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  u kokolio.users; v_now timestamptz := kokolio._now(); v_ip text := coalesce(p->>'ip', '');
  v_login text := lower(trim(coalesce(p_args->>'login', '')));
begin
  if kokolio._throttled(v_ip) then
    return jsonb_build_object('status', 'throttled');
  end if;
  select * into u from kokolio.users x where lower(x.login) = v_login for update;
  if u.id is not null and u.locked_until is not null and u.locked_until > v_now then
    return jsonb_build_object('status', 'locked', 'until', u.locked_until);
  end if;
  if not coalesce(kokolio._account_ok(u) and u.pw_hash is not null and u.pw_hash = coalesce(p_args->>'pw_hash', ''), false) then
    return kokolio._auth_fail(u, v_ip);
  end if;
  update kokolio.users set failed_count = 0, locked_until = null where id = u.id;
  perform kokolio._session_new(u.id, p_args->>'new_token', v_ip, p->>'ua');
  perform kokolio._audit(u.id, 'connexion', u.id, '', '{}'::jsonb, v_ip);
  return jsonb_build_object('status', 'ok', 'user', kokolio._user_json(u, true));
end $$;

create or replace function kokolio._pw_check(p_args jsonb) returns void language plpgsql as $$
begin
  if coalesce(p_args->>'salt', '') !~ '^[0-9a-f]{32}$' or coalesce(p_args->>'pw_hash', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_args->'params') is distinct from 'object' then
    perform kokolio._fail('requete', 'Mot de passe mal formé.');
  end if;
end $$;

-- Première connexion ou mot de passe oublié : identifiant + code d'activation + nouveau mot de passe.
create or replace function kokolio._activate(p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  u kokolio.users; v_now timestamptz := kokolio._now(); v_ip text := coalesce(p->>'ip', '');
  v_login text := lower(trim(coalesce(p_args->>'login', '')));
begin
  perform kokolio._pw_check(p_args);
  if kokolio._throttled(v_ip) then
    return jsonb_build_object('status', 'throttled');
  end if;
  select * into u from kokolio.users x where lower(x.login) = v_login for update;
  if u.id is not null and u.locked_until is not null and u.locked_until > v_now then
    return jsonb_build_object('status', 'locked', 'until', u.locked_until);
  end if;
  if not coalesce(kokolio._account_ok(u) and u.act_hash is not null and u.act_expires > v_now
          and u.act_hash = coalesce(p_args->>'code_hash', ''), false) then
    return kokolio._auth_fail(u, v_ip);
  end if;
  update kokolio.users set pw_salt = p_args->>'salt', pw_hash = p_args->>'pw_hash', pw_params = p_args->'params', pw_set_at = v_now,
    act_hash = null, act_expires = null, failed_count = 0, locked_until = null, updated_at = v_now
  where id = u.id returning * into u;
  delete from kokolio.sessions s where s.user_id = u.id;
  perform kokolio._session_new(u.id, p_args->>'new_token', v_ip, p->>'ua');
  perform kokolio._audit(u.id, 'compte_active', u.id, '', '{}'::jsonb, v_ip);
  return jsonb_build_object('status', 'ok', 'user', kokolio._user_json(u, true));
end $$;

create or replace function kokolio._password_change(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_now timestamptz := kokolio._now();
begin
  perform kokolio._pw_check(p_args);
  if not coalesce(me.pw_hash = coalesce(p_args->>'old_hash', ''), false) then
    perform kokolio._fail('mot_de_passe', 'Le mot de passe actuel est incorrect.');
  end if;
  update kokolio.users set pw_salt = p_args->>'salt', pw_hash = p_args->>'pw_hash', pw_params = p_args->'params', pw_set_at = v_now, updated_at = v_now
  where id = me.id;
  delete from kokolio.sessions s where s.user_id = me.id and s.token_hash <> coalesce(p->>'token', '');
  perform kokolio._audit(me.id, 'mot_de_passe_change', me.id, '', '{}'::jsonb, coalesce(p->>'ip', ''));
  return '{}'::jsonb;
end $$;

-- Nouveau code d'activation (le code lui-même est tiré au hasard par le serveur, seule son empreinte arrive ici).
-- Salarié : ses RH ou son responsable direct. Compte RH ou administrateur : un administrateur uniquement.
create or replace function kokolio._activation_new(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare u kokolio.users; v_days int; v_now timestamptz := kokolio._now();
begin
  select * into u from kokolio.users x where x.id = nullif(p_args->>'user_id', '')::uuid for update;
  if u.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  if u.id = me.id then perform kokolio._fail('interdit', 'Pour votre propre compte, utilisez « Changer mon mot de passe ».'); end if;
  if u.role = 'salarie' then
    if not (me.role in ('rh', 'admin') or u.manager_id = me.id) then
      perform kokolio._fail('interdit', 'Vous ne pouvez pas générer de code pour ce salarié.');
    end if;
  elsif me.role <> 'admin' then
    perform kokolio._fail('interdit', 'Seul un administrateur peut générer un code pour un compte RH ou administrateur.');
  end if;
  if coalesce(p_args->>'code_hash', '') !~ '^[0-9a-f]{64}$' then perform kokolio._fail('requete', 'Code mal formé.'); end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';
  update kokolio.users set act_hash = p_args->>'code_hash', act_expires = v_now + make_interval(days => coalesce(v_days, 14)),
    failed_count = 0, locked_until = null, updated_at = v_now where id = u.id returning * into u;
  perform kokolio._audit(me.id, 'code_activation_genere', u.id, u.login, jsonb_build_object('deja_active', u.pw_hash is not null), coalesce(p->>'ip', ''));
  return jsonb_build_object('user', kokolio._user_json(u, me.role in ('rh', 'admin')), 'expires', u.act_expires);
end $$;

create or replace function kokolio._sessions(me kokolio.users, p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('current', s.token_hash = coalesce(p->>'token', ''), 'created_at', s.created_at,
    'last_seen', s.last_seen, 'ua', s.ua) order by s.last_seen desc), '[]'::jsonb)
  from kokolio.sessions s where s.user_id = (me).id and s.expires_at > kokolio._now()
$$;
