-- =====================================================================
-- Kokolio — mode démonstration
-- Un jeu de données fictives se charge dans un outil vide ou en cours d'essai, pour le découvrir ou le présenter.
-- Tant qu'il est là, l'outil est « en mode démonstration » : c'est le seul état où tout peut être effacé.
-- Un outil en service (un mois clôturé, ou plus de dix salariés) ne peut pas y entrer.
-- =====================================================================

-- Chargement : les lignes sont préparées par le serveur (lib/kokolio/engine/demo.mjs), cette fonction les enregistre d'un bloc.
create or replace function kokolio._demo_seed(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb; u kokolio.users; c kokolio.contracts; v_dec uuid; v_tz text := kokolio._tz(); v_now timestamptz := kokolio._now(); v_today date := kokolio._today();
  v_days int; v_go text := coalesce(p_args->>'go_live', ''); v_ok boolean; v_status text; v_day date; v_times text[]; v_t text; v_i int;
  v_nu int := 0; v_nd int := 0; v_na int := 0; v_ne int := 0; v_avant date;
  v_models jsonb := '[]'::jsonb; v_cycles jsonb := '[]'::jsonb; k kokolio.cycles;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  if exists (select 1 from kokolio.meta m where m.key = 'demo') then
    perform kokolio._fail('etat', 'Les données de démonstration sont déjà chargées. Effacez-les avant de les recharger.');
  end if;
  -- Un outil en service ne passe jamais en mode démonstration : dès qu'un mois a été clôturé, ou au-delà de dix salariés, c'est refusé.
  -- En deçà (outil vide, ou quelques comptes d'essai), le chargement est accepté et ne touche pas à l'existant.
  if exists (select 1 from kokolio.closures) then
    perform kokolio._fail('etat', 'Un mois a déjà été clôturé : cet outil est en service, les données de démonstration ne peuvent plus y être chargées.');
  end if;
  if (select count(*) from kokolio.users x where x.role <> 'admin') > 10 then
    perform kokolio._fail('etat', 'L''outil contient déjà plus de dix salariés : les données de démonstration ne se chargent que dans un outil vide ou en cours d''essai.');
  end if;
  select x.login into v_t from kokolio.users x where x.login in (select lower(y->>'login') from jsonb_array_elements(case when jsonb_typeof(p_args->'users') = 'array' then p_args->'users' else '[]'::jsonb end) y) limit 1;
  if v_t is not null then
    perform kokolio._fail('etat', 'Un compte porte déjà l''identifiant « ' || v_t || ' », utilisé par les données de démonstration.');
  end if;
  if v_go !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_go::date > v_today then perform kokolio._fail('requete', 'Période de démonstration invalide.'); end if;
  if jsonb_typeof(p_args->'users') is distinct from 'array' or jsonb_array_length(p_args->'users') < 1 or jsonb_array_length(p_args->'users') > 50
     or jsonb_array_length(coalesce(p_args->'days', '[]'::jsonb)) > 6000 or jsonb_array_length(coalesce(p_args->'absences', '[]'::jsonb)) > 500 then
    perform kokolio._fail('requete', 'Jeu de données invalide.');
  end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';

  -- Les comptes déjà créés ne sont pas concernés par l'historique fictif : la mise en service va reculer de plusieurs mois,
  -- leur suivi, lui, reste celui d'avant le chargement. Sans cela, ils se retrouveraient avec des mois entiers sans pointage.
  select case when m.value->>'go_live' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (m.value->>'go_live')::date end into v_avant from kokolio.meta m where m.key = 'settings';
  update kokolio.users set tracked_from = coalesce(v_avant, v_today) where tracked_from is null;
  get diagnostics v_ne = row_count;

  -- bibliothèque d'exemple : horaires journaliers et cycles, créés seulement s'ils n'existent pas déjà (on note lesquels, pour l'effacement)
  for r in select x from jsonb_array_elements(coalesce(p_args->'models', '[]'::jsonb)) x loop
    if not exists (select 1 from kokolio.day_models m where m.code = upper(r->>'code')) then
      insert into kokolio.day_models (code, label, minutes, ranges, color, sort, created_by)
      values (upper(r->>'code'), left(coalesce(r->>'label', ''), 60), (r->>'minutes')::int, kokolio._ranges(r->'ranges'), coalesce(r->>'color', ''), coalesce((r->>'sort')::int, 100), me.id);
      v_models := v_models || to_jsonb(upper(r->>'code'));
    end if;
  end loop;
  for r in select x from jsonb_array_elements(coalesce(p_args->'cycles', '[]'::jsonb)) x loop
    if not exists (select 1 from kokolio.cycles y where lower(y.name) = lower(r->>'name')) then
      insert into kokolio.cycles (name, weeks, created_by) values (left(r->>'name', 60), r->'weeks', me.id) returning * into k;
      v_cycles := v_cycles || to_jsonb(k.id);
    end if;
  end loop;

  -- comptes fictifs : salariés ou RH, jamais administrateurs
  for r in select x from jsonb_array_elements(p_args->'users') x loop
    v_ok := coalesce(r->>'code_hash', '') ~ '^[0-9a-f]{64}$';
    insert into kokolio.users (login, role, first_name, last_name, matricule, team, job, entry_date, details, act_hash, act_expires)
    values (lower(r->>'login'), case when r->>'role' = 'rh' then 'rh' else 'salarie' end, coalesce(r->>'first_name', ''), r->>'last_name', coalesce(r->>'matricule', ''),
            coalesce(r->>'team', ''), coalesce(r->>'job', ''), nullif(r->>'entry_date', '')::date, coalesce(r->'details', '{}'::jsonb),
            case when v_ok then r->>'code_hash' end, case when v_ok then v_now + make_interval(days => coalesce(v_days, 14)) end)
    returning * into u;
    -- un salarié fictif peut suivre un cycle de la bibliothèque (désigné par son nom)
    select * into k from kokolio.cycles y where lower(y.name) = lower(coalesce(r->>'cycle', ''));
    c := kokolio._contract_apply(u.id, coalesce(u.entry_date, date '2000-01-01'),
      coalesce(r->'contract', '{}'::jsonb) || case when k.id is not null then jsonb_build_object('cycle_id', k.id) else '{}'::jsonb end, me.id);
    v_nu := v_nu + 1;
  end loop;
  for r in select x from jsonb_array_elements(p_args->'users') x loop
    if coalesce(r->>'manager_login', '') <> '' then
      update kokolio.users set manager_id = (select x.id from kokolio.users x where x.login = lower(r->>'manager_login')) where login = lower(r->>'login');
    end if;
  end loop;

  for r in select x from jsonb_array_elements(coalesce(p_args->'entries', '[]'::jsonb)) x loop
    insert into kokolio.balance_entries (user_id, kind, year, amount, reason, tag, created_by)
    select x.id, r->>'kind', (r->>'year')::int, (r->>'amount')::numeric, left(coalesce(r->>'reason', 'Démonstration'), 200), '', me.id
    from kokolio.users x where x.login = lower(r->>'login');
  end loop;

  -- journées : validées ou refusées au nom du responsable (à défaut, de l'administrateur), avec leur trace de pointage
  for r in select x from jsonb_array_elements(coalesce(p_args->'days', '[]'::jsonb)) x loop
    select x.* into u from kokolio.users x where x.login = lower(r->>'login');
    v_day := (r->>'day')::date;
    if u.id is null or v_day >= v_today then continue; end if;
    v_status := case when r->>'status' in ('valide', 'refuse') then r->>'status' else 'a_valider' end;
    v_times := kokolio._times(r->'times');
    v_dec := case when v_status <> 'a_valider' then coalesce(u.manager_id, me.id) end;
    insert into kokolio.days (user_id, day, times, lieu, status, corrected, comment, refusal_reason, decided_by, decided_at)
    values (u.id, v_day, v_times, case when kokolio._lieu_ok(coalesce(r->>'lieu', '')) then r->>'lieu' else 'bureau' end, v_status,
            coalesce((r->>'corrected')::boolean, false), left(coalesce(r->>'comment', ''), 500), left(coalesce(r->>'refusal_reason', ''), 300),
            v_dec, case when v_dec is not null then v_now end);
    if not coalesce((r->>'corrected')::boolean, false) then
      v_i := 0;
      foreach v_t in array v_times loop
        v_i := v_i + 1;
        insert into kokolio.punch_log (user_id, ts, day, hhmm, kind)
        values (u.id, (v_day::text || ' ' || v_t)::timestamp at time zone v_tz, v_day, v_t, case when v_i % 2 = 1 then 'arrivee' else 'depart' end);
      end loop;
    end if;
    v_nd := v_nd + 1;
  end loop;

  for r in select x from jsonb_array_elements(coalesce(p_args->'absences', '[]'::jsonb)) x loop
    select x.* into u from kokolio.users x where x.login = lower(r->>'login');
    if u.id is null or not exists (select 1 from kokolio.absence_types t where t.code = r->>'type') then continue; end if;
    v_status := case when r->>'status' in ('valide', 'refuse') then r->>'status' else 'en_attente' end;
    v_dec := case when v_status <> 'en_attente' then coalesce(u.manager_id, me.id) end;
    insert into kokolio.absences (user_id, type_code, start_date, end_date, half, days_count, comment, status, decided_by, decided_at, refusal_reason, created_by)
    values (u.id, r->>'type', (r->>'start')::date, (r->>'end')::date, coalesce(r->>'half', ''), (r->>'days_count')::numeric, left(coalesce(r->>'comment', ''), 500),
            v_status, v_dec, case when v_dec is not null then v_now end, left(coalesce(r->>'refusal_reason', ''), 500),
            case when coalesce((r->>'par_rh')::boolean, false) then me.id else u.id end);
    v_na := v_na + 1;
  end loop;

  -- la mise en service recule au début de la période de démonstration, et l'outil passe en mode démonstration
  update kokolio.meta set value = jsonb_set(jsonb_set(value, '{go_live}', to_jsonb(v_go)), '{version}', to_jsonb(coalesce((value->>'version')::int, 1) + 1)), updated_at = now()
  where key = 'settings';
  insert into kokolio.meta (key, value) values ('demo', jsonb_build_object('charge_le', v_now, 'par', me.id, 'modeles', v_models, 'cycles', v_cycles));
  perform kokolio._audit(me.id, 'donnees_demo_chargees', null, '', jsonb_build_object('comptes', v_nu, 'journees', v_nd, 'absences', v_na, 'comptes_deja_presents', v_ne), coalesce(p->>'ip', ''));
  return jsonb_build_object('users', v_nu, 'days', v_nd, 'absences', v_na, 'existing', v_ne);
end $$;

-- Effacement : tout repart de zéro, sauf les comptes administrateur, les réglages et les motifs d'absence.
-- N'existe qu'en mode démonstration : un outil qui n'a jamais chargé ces données ne peut pas être vidé par ce chemin.
create or replace function kokolio._demo_reset(me kokolio.users, p jsonb) returns jsonb language plpgsql as $$
declare v_users int; v_days int; v_demo jsonb;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  select m.value into v_demo from kokolio.meta m where m.key = 'demo';
  if v_demo is null then
    perform kokolio._fail('etat', 'Cet outil n''est pas en mode démonstration : rien ne peut y être effacé.');
  end if;
  select count(*) into v_users from kokolio.users x where x.role <> 'admin';
  select count(*) into v_days from kokolio.days;
  perform set_config('kokolio.purge', '1', true);
  delete from kokolio.closures;        -- d'abord les clôtures : plus aucun mois n'est verrouillé
  delete from kokolio.attachments;
  delete from kokolio.absences;
  delete from kokolio.plan_days;
  delete from kokolio.days;
  delete from kokolio.punch_log;
  delete from kokolio.balance_entries;
  delete from kokolio.sessions s where s.user_id in (select x.id from kokolio.users x where x.role <> 'admin');
  delete from kokolio.contracts c where c.user_id in (select x.id from kokolio.users x where x.role <> 'admin');
  update kokolio.users set manager_id = null where manager_id is not null;
  delete from kokolio.audit;           -- le journal repart d'une chaîne neuve
  delete from kokolio.throttle;
  delete from kokolio.users x where x.role <> 'admin';
  perform set_config('kokolio.purge', '', true);
  -- la bibliothèque d'exemple apportée par la démonstration repart avec elle, sauf ce qu'un compte restant utilise encore
  delete from kokolio.cycles c where c.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_demo->'cycles', '[]'::jsonb)) x)
    and not exists (select 1 from kokolio.contracts k where k.cycle_id = c.id);
  delete from kokolio.day_models m where m.code in (select x #>> '{}' from jsonb_array_elements(coalesce(v_demo->'modeles', '[]'::jsonb)) x)
    and coalesce(array_length(kokolio._model_cycles(m.code), 1), 0) = 0;
  update kokolio.users set tracked_from = null where tracked_from is not null;   -- les comptes qui restent repartent de la nouvelle mise en service
  update kokolio.meta set value = jsonb_build_object('seq', 0, 'hash', ''), updated_at = now() where key = 'audit_head';
  update kokolio.meta set value = jsonb_set(jsonb_set(value, '{go_live}', to_jsonb(kokolio._today()::text)), '{version}', to_jsonb(coalesce((value->>'version')::int, 1) + 1)), updated_at = now()
  where key = 'settings';
  delete from kokolio.meta where key = 'demo';
  perform kokolio._audit(me.id, 'donnees_demo_effacees', null, '', jsonb_build_object('comptes', v_users, 'journees', v_days), coalesce(p->>'ip', ''));
  return jsonb_build_object('users', v_users, 'days', v_days);
end $$;
