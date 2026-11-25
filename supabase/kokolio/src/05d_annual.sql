-- =====================================================================
-- Kokolio — annualisation : périodes de référence, objectif par salarié, ajustements datés
-- Les calculs (objectif, réalisé, reste à faire, solde semaine par semaine) sont faits par le moteur à partir de ces lignes.
-- Tout est réservé aux RH et aux administrateurs ; chaque geste est inscrit au journal.
-- =====================================================================

create or replace function kokolio._annual_period_save(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  j jsonb := coalesce(p_args->'period', '{}'::jsonb); v_id uuid := nullif(j->>'id', '')::uuid; v_label text := trim(coalesce(j->>'label', ''));
  v_a date := nullif(j->>'start_date', '')::date; v_b date := nullif(j->>'end_date', '')::date; o kokolio.annual_periods; q kokolio.annual_periods;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  if length(v_label) < 2 or length(v_label) > 60 then perform kokolio._fail('annualisation', 'Donnez un nom à la période (2 à 60 caractères).'); end if;
  if v_a is null or v_b is null or v_b < v_a then perform kokolio._fail('annualisation', 'Dates de période invalides.'); end if;
  if v_b - v_a > 400 then perform kokolio._fail('annualisation', 'Une période d''annualisation dure au plus treize mois.'); end if;
  if exists (select 1 from kokolio.annual_periods x where (v_id is null or x.id <> v_id) and x.start_date <= v_b and x.end_date >= v_a) then
    perform kokolio._fail('annualisation', 'Cette période en chevauche une autre.');
  end if;
  if v_id is null then
    insert into kokolio.annual_periods (label, start_date, end_date, created_by) values (v_label, v_a, v_b, me.id) returning * into q;
    perform kokolio._audit(me.id, 'periode_annualisation_creee', null, v_label, jsonb_build_object('du', v_a, 'au', v_b), coalesce(p->>'ip', ''));
  else
    select * into o from kokolio.annual_periods x where x.id = v_id for update;
    if o.id is null then perform kokolio._fail('introuvable', 'Période introuvable.'); end if;
    if p_args ? 'version' and (p_args->>'version')::int <> o.version then perform kokolio._fail('conflit', 'Cette période a été modifiée entre-temps. Rechargez la page.'); end if;
    -- les ajustements déjà passés doivent rester dans la période
    if exists (select 1 from kokolio.annual_entries e where e.period_id = v_id and (e.day < v_a or e.day > v_b)) then
      perform kokolio._fail('annualisation', 'Des ajustements d''objectif sont datés hors de ces nouvelles bornes.');
    end if;
    update kokolio.annual_periods set label = v_label, start_date = v_a, end_date = v_b, version = o.version + 1 where id = v_id returning * into q;
    perform kokolio._audit(me.id, 'periode_annualisation_modifiee', null, v_label, kokolio._diff(to_jsonb(o), to_jsonb(q), array['label', 'start_date', 'end_date']), coalesce(p->>'ip', ''));
  end if;
  return jsonb_build_object('period', to_jsonb(q) - 'created_by' - 'created_at');
end $$;

-- Fixer l'objectif d'un salarié pour une période, ou le retirer (minutes absentes) pour revenir à l'objectif calculé d'après le planning.
create or replace function kokolio._annual_goal_set(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_uid uuid := nullif(p_args->>'user_id', '')::uuid; v_pid uuid := nullif(p_args->>'period_id', '')::uuid; u kokolio.users; q kokolio.annual_periods;
  o kokolio.annual_goals; v_note text := left(trim(coalesce(p_args->>'note', '')), 200); v_min int;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select * into u from kokolio.users x where x.id = v_uid;
  if u.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  select * into q from kokolio.annual_periods x where x.id = v_pid;
  if q.id is null then perform kokolio._fail('introuvable', 'Période introuvable.'); end if;
  select * into o from kokolio.annual_goals g where g.user_id = v_uid and g.period_id = v_pid for update;
  if p_args->'minutes' is null or jsonb_typeof(p_args->'minutes') = 'null' then
    delete from kokolio.annual_goals g where g.user_id = v_uid and g.period_id = v_pid;
    if o.user_id is not null then
      perform kokolio._audit(me.id, 'objectif_annuel_retire', v_uid, q.label, jsonb_build_object('avant_minutes', o.minutes, 'motif', v_note), coalesce(p->>'ip', ''));
    end if;
    return jsonb_build_object('goal', null);
  end if;
  if jsonb_typeof(p_args->'minutes') <> 'number' or (p_args->>'minutes')::numeric <> trunc((p_args->>'minutes')::numeric)
     or (p_args->>'minutes')::numeric < 0 or (p_args->>'minutes')::numeric > 300000 then
    perform kokolio._fail('annualisation', 'Objectif invalide : entre 0 et 5 000 heures.');
  end if;
  v_min := (p_args->>'minutes')::int;
  insert into kokolio.annual_goals (user_id, period_id, minutes, note, set_by, set_at) values (v_uid, v_pid, v_min, v_note, me.id, kokolio._now())
  on conflict (user_id, period_id) do update set minutes = excluded.minutes, note = excluded.note, set_by = excluded.set_by, set_at = excluded.set_at;
  perform kokolio._audit(me.id, 'objectif_annuel_fixe', v_uid, q.label,
    jsonb_build_object('minutes', v_min, 'motif', v_note) || case when o.user_id is not null then jsonb_build_object('avant_minutes', o.minutes) else '{}'::jsonb end, coalesce(p->>'ip', ''));
  return jsonb_build_object('goal', jsonb_build_object('user_id', v_uid, 'period_id', v_pid, 'minutes', v_min, 'note', v_note));
end $$;

-- Ajustement daté de l'objectif : des minutes en plus ou en moins, avec un motif. Ne se modifie pas : on passe l'écriture inverse.
create or replace function kokolio._annual_entry_add(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_uid uuid := nullif(p_args->>'user_id', '')::uuid; v_pid uuid := nullif(p_args->>'period_id', '')::uuid; q kokolio.annual_periods;
  v_day date := nullif(p_args->>'day', '')::date; v_reason text := trim(coalesce(p_args->>'reason', '')); v_min int; v_id bigint; v_login text;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select x.login into v_login from kokolio.users x where x.id = v_uid;
  if v_login is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  select * into q from kokolio.annual_periods x where x.id = v_pid;
  if q.id is null then perform kokolio._fail('introuvable', 'Période introuvable.'); end if;
  if v_day is null or v_day < q.start_date or v_day > q.end_date then perform kokolio._fail('date', 'La date de l''ajustement doit être dans la période.'); end if;
  if jsonb_typeof(p_args->'minutes') is distinct from 'number' or (p_args->>'minutes')::numeric <> trunc((p_args->>'minutes')::numeric)
     or (p_args->>'minutes')::numeric = 0 or abs((p_args->>'minutes')::numeric) > 60000 then
    perform kokolio._fail('annualisation', 'Ajustement invalide : un nombre d''heures non nul, 1 000 heures au plus.');
  end if;
  if length(v_reason) < 3 or length(v_reason) > 200 then perform kokolio._fail('motif', 'Indiquez le motif de l''ajustement (200 caractères au plus).'); end if;
  v_min := (p_args->>'minutes')::int;
  insert into kokolio.annual_entries (user_id, period_id, day, minutes, reason, created_by, created_at) values (v_uid, v_pid, v_day, v_min, v_reason, me.id, kokolio._now()) returning id into v_id;
  perform kokolio._audit(me.id, 'objectif_annuel_ajuste', v_uid, q.label, jsonb_build_object('jour', v_day, 'minutes', v_min, 'motif', v_reason), coalesce(p->>'ip', ''));
  return jsonb_build_object('entry', jsonb_build_object('id', v_id, 'user_id', v_uid, 'period_id', v_pid, 'day', v_day, 'minutes', v_min, 'reason', v_reason));
end $$;
