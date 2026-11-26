-- =====================================================================
-- Kokolio — organigramme, et simulation d'activité
-- =====================================================================

-- ---------------------------------------------------------------------
-- Organigramme : la ligne hiérarchique, visible de tous. On n'y trouve que les personnes qui encadrent quelqu'un
-- (nom, poste, équipe, effectif), la place de celui qui regarde et la chaîne de ses responsables. Aucune liste de salariés.
-- ---------------------------------------------------------------------
create or replace function kokolio._org_chart(me kokolio.users) returns jsonb language plpgsql stable as $$
declare v_today date := kokolio._today(); v_nodes jsonb; v_chain jsonb := '[]'::jsonb; v_total int; v_id uuid := me.manager_id; v_n int := 0;
begin
  with recursive actifs as (
    select u.id, u.manager_id, trim(u.first_name || ' ' || u.last_name) as name, u.job, u.team
    from kokolio.users u where not u.disabled and (u.exit_date is null or u.exit_date >= v_today)
  ),
  -- chaque salarié sous chacun de ses responsables, directs ou non (profondeur bornée : une boucle de rattachements ne tourne pas sans fin)
  sous (chef, id, niveau) as (
    select a.manager_id, a.id, 1 from actifs a where a.manager_id is not null
    union
    select c.manager_id, s.id, s.niveau + 1 from sous s join actifs c on c.id = s.chef where c.manager_id is not null and s.niveau < 12
  ),
  effectifs as (select s.chef, count(distinct s.id) filter (where s.niveau = 1) as direct, count(distinct s.id) as total from sous s group by s.chef)
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'job', a.job, 'team', a.team, 'manager_id', a.manager_id, 'direct', e.direct, 'total', e.total)
                            order by e.total desc, a.name), '[]'::jsonb),
         (select count(*) from actifs)
    into v_nodes, v_total
  from actifs a join effectifs e on e.chef = a.id;
  -- la chaîne des responsables de celui qui regarde, du plus proche au plus haut
  while v_id is not null and v_n < 12 loop
    v_chain := v_chain || to_jsonb(v_id);
    select u.manager_id into v_id from kokolio.users u where u.id = v_id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('nodes', v_nodes, 'total', v_total, 'chain', v_chain,
    'me', jsonb_build_object('id', me.id, 'name', trim(me.first_name || ' ' || me.last_name), 'job', me.job, 'team', me.team, 'manager_id', me.manager_id));
end $$;

-- ---------------------------------------------------------------------
-- Simulation d'activité : des salariés fictifs pointent, s'absentent, corrigent ; leurs responsables valident.
-- Elle n'existe que dans l'environnement de test, ou en production tant que le mode démonstration est actif.
-- Elle ne touche que des fiches jamais activées (aucun mot de passe posé) et présentes au moment de sa mise en marche :
-- une personne réelle, ou une fiche importée ensuite, n'est jamais simulée.
-- Le serveur calcule les événements (lib/kokolio/engine/simulation.mjs) ; ici, ils sont joués un à un par les fonctions
-- ordinaires de l'outil, à l'heure simulée de chacun : mêmes règles, mêmes refus, même journal qu'une action réelle.
-- ---------------------------------------------------------------------
create or replace function kokolio._sim_allowed() returns boolean language sql stable as $$
  select kokolio._env() = 'test' or exists (select 1 from kokolio.meta m where m.key = 'demo')
$$;

create or replace function kokolio._iso(p timestamptz) returns text language sql immutable as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function kokolio._sim_ids(st jsonb) returns uuid[] language sql stable as $$
  select coalesce(array_agg(u.id), '{}') from kokolio.users u
  where u.pw_hash is null and not u.disabled and u.role = 'salarie' and u.created_at <= (st->>'enrolled_at')::timestamptz
$$;

-- État, pour l'écran de l'administrateur.
create or replace function kokolio._sim_state(me kokolio.users) returns jsonb language plpgsql stable as $$
declare st jsonb;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  select m.value into st from kokolio.meta m where m.key = 'simulation';
  return jsonb_build_object('allowed', kokolio._sim_allowed(), 'environment', kokolio._env(),
    'demo', exists (select 1 from kokolio.meta m where m.key = 'demo'),
    'on', coalesce((st->>'on')::boolean, false) and kokolio._sim_allowed(), 'state', st - 'by_id' - 'claim',
    'enrolled', case when st is not null then coalesce(array_length(kokolio._sim_ids(st), 1), 0) end,
    'candidates', (select count(*) from kokolio.users u where u.pw_hash is null and not u.disabled and u.role = 'salarie'),
    'now', kokolio._iso(kokolio._now()));
end $$;

-- Mise en marche et arrêt. La première mise en marche part de la veille ; une reprise repart de l'instant présent.
create or replace function kokolio._sim_set(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare st jsonb; v_on boolean := coalesce((p_args->>'on')::boolean, false); v_now timestamptz := kokolio._now(); v_depart timestamptz;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  select m.value into st from kokolio.meta m where m.key = 'simulation' for update;
  if v_on then
    if not kokolio._sim_allowed() then
      perform kokolio._fail('etat', 'La simulation d''activité n''existe que dans l''environnement de test, ou en production tant que le mode démonstration est actif.');
    end if;
    if coalesce((st->>'on')::boolean, false) then return kokolio._sim_state(me); end if;
    -- première mise en marche : la journée de la veille est créée, et les absences déjà en cours sont posées (amorce)
    v_depart := case when st is null then ((kokolio._today() - 1)::timestamp at time zone kokolio._tz()) else v_now end;
    st := (coalesce(st, '{}'::jsonb) - 'claim') || jsonb_build_object('on', true, 'by', me.login, 'by_id', me.id, 'enrolled_at', clock_timestamp(),   -- horloge réelle, comme la date de création des fiches
      'started_at', kokolio._iso(v_now), 'last', kokolio._iso(v_depart), 'amorce', coalesce((st->>'amorce')::boolean, false));
    if not (st ? 'since') then st := st || jsonb_build_object('since', kokolio._today() - 1); end if;
    insert into kokolio.meta (key, value) values ('simulation', st) on conflict (key) do update set value = excluded.value, updated_at = now();
    perform kokolio._audit(me.id, 'simulation_activee', null, '', jsonb_build_object('comptes', coalesce(array_length(kokolio._sim_ids(st), 1), 0)), coalesce(p->>'ip', ''));
  else
    if st is null or not coalesce((st->>'on')::boolean, false) then return kokolio._sim_state(me); end if;
    update kokolio.meta set value = (st - 'claim') || jsonb_build_object('on', false, 'stopped_at', kokolio._iso(v_now)), updated_at = now() where key = 'simulation';
    perform kokolio._audit(me.id, 'simulation_arretee', null, '', '{}'::jsonb, coalesce(p->>'ip', ''));
  end if;
  return kokolio._sim_state(me);
end $$;

-- Lecture pour un passage de la simulation (appelée par le serveur, sans session : elle ne renvoie rien si la simulation est arrêtée,
-- et le serveur n'en transmet que des compteurs). Un passage par tranche de cinq minutes au plus.
create or replace function kokolio._sim_read(p_args jsonb) returns jsonb language plpgsql as $$
declare st jsonb; me kokolio.users; v_ids uuid[]; v_last timestamptz; v_now timestamptz := kokolio._now(); v_from date;
begin
  select m.value into st from kokolio.meta m where m.key = 'simulation';
  if st is null or not coalesce((st->>'on')::boolean, false) or not kokolio._sim_allowed() then return jsonb_build_object('on', false); end if;
  v_last := (st->>'last')::timestamptz;
  if coalesce((st->>'amorce')::boolean, false) and v_now - v_last < interval '5 minutes' then
    return jsonb_build_object('on', true, 'due', false, 'last', st->>'last');
  end if;
  -- un passage à la fois : celui qui lit réserve le passage (horloge réelle), les autres repartent aussitôt, sans rien lire de lourd.
  -- La réservation tombe à l'application du lot, ou d'elle-même au bout d'une minute si le passage n'est pas allé au bout.
  select m.value into st from kokolio.meta m where m.key = 'simulation' for update;
  if not coalesce((st->>'on')::boolean, false) then return jsonb_build_object('on', false); end if;
  if (st->>'last')::timestamptz is distinct from v_last then                      -- un autre passage vient d'avancer pendant l'attente du verrou
    return jsonb_build_object('on', true, 'due', false, 'busy', true, 'last', st->>'last');
  end if;
  if (st->>'claim') is not null and clock_timestamp() - (st->>'claim')::timestamptz < interval '60 seconds' then
    return jsonb_build_object('on', true, 'due', false, 'busy', true, 'last', st->>'last');
  end if;
  update kokolio.meta set value = st || jsonb_build_object('claim', clock_timestamp()) where key = 'simulation';
  select * into me from kokolio.users u where u.role = 'admin' and not u.disabled order by u.created_at limit 1;
  if me.id is null then return jsonb_build_object('on', false); end if;
  v_ids := kokolio._sim_ids(st);
  v_from := greatest((v_last at time zone kokolio._tz())::date, kokolio._today() - 7) - 6;
  return kokolio._read(me, jsonb_build_object('scope', 'users', 'user_ids', to_jsonb(v_ids), 'from', v_from, 'to', kokolio._today() + 120, 'days', true, 'ctx', true))
    || jsonb_build_object('on', true, 'due', true, 'last', st->>'last', 'now', kokolio._iso(v_now), 'amorce', coalesce((st->>'amorce')::boolean, false),
                          'enrolled', coalesce(array_length(v_ids, 1), 0));
end $$;

-- Application d'un lot d'événements. Chaque événement est joué par la fonction ordinaire de l'outil, au nom du salarié simulé,
-- à l'heure de l'événement. Un refus de gestion (journée validée, absence qui en chevauche une autre…) est compté, pas bloquant.
create or replace function kokolio._sim_apply(p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  st jsonb; ev jsonb; u kokolio.users; v_rh kokolio.users; v_ids uuid[]; v_kind text; v_code text; r jsonb;
  v_faits jsonb := '{}'::jsonb; v_refus jsonb := '{}'::jsonb; v_p jsonb := jsonb_build_object('ip', 'simulation', 'ua', 'simulation');
begin
  select m.value into st from kokolio.meta m where m.key = 'simulation' for update;
  if st is null or not coalesce((st->>'on')::boolean, false) or not kokolio._sim_allowed() then return jsonb_build_object('on', false); end if;
  -- un autre passage a déjà avancé la simulation : celui-ci ne rejoue rien
  if coalesce(st->>'last', '') <> coalesce(p_args->>'expect_last', '') then return jsonb_build_object('on', true, 'skipped', true, 'last', st->>'last'); end if;
  if jsonb_typeof(p_args->'events') is distinct from 'array' or jsonb_array_length(p_args->'events') > 4000 then
    perform kokolio._fail('requete', 'Lot d''événements invalide.');
  end if;
  if coalesce(p_args->>'upto', '') < coalesce(st->>'last', '') or (p_args->>'upto')::timestamptz > kokolio._now() + interval '1 minute' then
    perform kokolio._fail('requete', 'Borne de simulation invalide.');
  end if;
  v_ids := kokolio._sim_ids(st);
  select * into v_rh from kokolio.users x where x.id = (st->>'by_id')::uuid and x.role = 'admin' and not x.disabled;
  for ev in select x from jsonb_array_elements(p_args->'events') x loop
    v_kind := coalesce(ev->>'kind', '');
    begin
      if v_kind = 'absence_rh' then
        -- amorce : absence déjà en cours, saisie d'un coup au nom de l'administrateur qui a mis la simulation en marche
        if v_rh.id is null or not ((ev#>>'{args,user_id}')::uuid = any (v_ids)) then perform kokolio._fail('simulation', 'Compte non simulé.'); end if;
        r := kokolio._absence_create(v_rh, v_p, ev->'args');
      else
        select * into u from kokolio.users x where x.id = (ev->>'user')::uuid;
        if u.id is null or not (u.id = any (v_ids)) then perform kokolio._fail('simulation', 'Compte non simulé.'); end if;
        if (ev->>'t')::timestamptz > kokolio._now() + interval '1 minute' then perform kokolio._fail('simulation', 'Événement à venir.'); end if;
        perform set_config('kokolio.sim_now', ev->>'t', true);
        case v_kind
          when 'punch' then r := kokolio._punch(u, v_p, coalesce(ev->'args', '{}'::jsonb));
          when 'absence' then r := kokolio._absence_create(u, v_p, (ev->'args') - 'user_id');
          when 'correct' then r := kokolio._day_set(u, v_p, (ev->'args') - 'user_id');
          when 'decide_days' then r := kokolio._days_decide(u, v_p, ev->'args');
          when 'decide_absence' then r := kokolio._absence_decide(u, v_p, ev->'args');
          else perform kokolio._fail('simulation', 'Événement inconnu.');
        end case;
        perform set_config('kokolio.sim_now', '', true);
      end if;
      v_faits := jsonb_set(v_faits, array[v_kind], to_jsonb(coalesce((v_faits->>v_kind)::int, 0) + 1));
    exception when others then
      perform set_config('kokolio.sim_now', '', true);
      if sqlerrm not like 'KK:%' then raise; end if;
      v_code := split_part(sqlerrm, ':', 2);
      v_refus := jsonb_set(v_refus, array[v_code], to_jsonb(coalesce((v_refus->>v_code)::int, 0) + 1));
    end;
  end loop;
  perform set_config('kokolio.sim_now', '', true);
  st := (st - 'claim') || jsonb_build_object('last', p_args->>'upto', 'amorce', coalesce((st->>'amorce')::boolean, false) or coalesce((p_args->>'amorce')::boolean, false),
    'passages', coalesce((st->>'passages')::int, 0) + 1, 'dernier_passage', kokolio._iso(kokolio._now()),
    'total', coalesce((st->>'total')::int, 0) + jsonb_array_length(p_args->'events'));
  update kokolio.meta set value = st, updated_at = now() where key = 'simulation';
  return jsonb_build_object('on', true, 'last', st->>'last', 'faits', v_faits, 'refus', v_refus);
end $$;
