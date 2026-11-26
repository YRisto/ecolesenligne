-- =====================================================================
-- Kokolio — autodiagnostic
-- Rejoue un scénario complet (comptes, droits, pointage, validation, clôture, journal) sur des comptes fictifs,
-- dans une transaction annulée à la fin : aucune trace ne reste en base.
-- =====================================================================
create or replace function kokolio.selftest() returns jsonb language plpgsql as $$
declare
  v_checks jsonb := '[]'::jsonb; v_r jsonb; v_tag text := 'kktest_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_rh uuid; v_mgr uuid; v_e1 uuid; v_e2 uuid; v_seq0 bigint; v_fp text; v_ok boolean; v_day uuid; v_abs uuid; c kokolio.contracts;
  t_rh text; t_mgr text; t_e1 text; t_e2 text; v_t0 timestamptz := '2001-02-15T09:00:00+01:00'; v_adm uuid; t_adm text; v_n bigint;
begin
  begin
    insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb) on conflict (key) do update set value = 'true'::jsonb;
    perform set_config('kokolio.test_now', v_t0::text, true);
    select coalesce((m.value->>'seq')::bigint, 0) into v_seq0 from kokolio.meta m where m.key = 'audit_head';

    insert into kokolio.users (login, role, last_name) values (v_tag || '_rh', 'rh', 'Test RH') returning id into v_rh;
    insert into kokolio.users (login, last_name) values (v_tag || '_mgr', 'Test Manager') returning id into v_mgr;
    insert into kokolio.users (login, last_name, manager_id, pw_salt, pw_hash, pw_params)
      values (v_tag || '_e1', 'Test Un', v_mgr, repeat('a', 32), repeat('b', 64), '{"N": 1}'::jsonb) returning id into v_e1;
    insert into kokolio.users (login, last_name) values (v_tag || '_e2', 'Test Deux') returning id into v_e2;
    c := kokolio._contract_apply(v_rh, date '2000-01-01', '{}'::jsonb, null);
    c := kokolio._contract_apply(v_mgr, date '2000-01-01', '{}'::jsonb, null);
    c := kokolio._contract_apply(v_e1, date '2000-01-01', '{}'::jsonb, null);
    c := kokolio._contract_apply(v_e2, date '2000-01-01', '{}'::jsonb, null);
    t_rh := encode(sha256(convert_to(v_tag || 'rh', 'UTF8')), 'hex'); t_mgr := encode(sha256(convert_to(v_tag || 'mgr', 'UTF8')), 'hex');
    t_e1 := encode(sha256(convert_to(v_tag || 'e1', 'UTF8')), 'hex'); t_e2 := encode(sha256(convert_to(v_tag || 'e2', 'UTF8')), 'hex');
    insert into kokolio.sessions (token_hash, user_id, created_at, last_seen, expires_at) values
      (t_rh, v_rh, v_t0, v_t0, v_t0 + interval '1 day'), (t_mgr, v_mgr, v_t0, v_t0, v_t0 + interval '1 day'), (t_e2, v_e2, v_t0, v_t0, v_t0 + interval '1 day');

    -- 1. Comptes
    v_r := public.kokolio_api(jsonb_build_object('action', 'login', 'args', jsonb_build_object('login', v_tag || '_e1', 'pw_hash', repeat('c', 64), 'new_token', t_e1)));
    v_checks := v_checks || jsonb_build_object('name', 'Mot de passe erroné refusé', 'ok', v_r #>> '{data,status}' = 'fail');
    v_r := public.kokolio_api(jsonb_build_object('action', 'login', 'args', jsonb_build_object('login', v_tag || '_e1', 'pw_hash', repeat('b', 64), 'new_token', t_e1)));
    v_checks := v_checks || jsonb_build_object('name', 'Connexion acceptée avec le bon mot de passe', 'ok', v_r #>> '{data,status}' = 'ok');
    v_r := public.kokolio_api(jsonb_build_object('action', 'ctx', 'token', repeat('0', 64)));
    v_checks := v_checks || jsonb_build_object('name', 'Appel sans session valide refusé', 'ok', v_r->>'code' = 'session');
    update kokolio.users set act_hash = repeat('d', 64), act_expires = v_t0 + interval '1 day' where id = v_e2;
    v_r := public.kokolio_api(jsonb_build_object('action', 'activate', 'args', jsonb_build_object('login', v_tag || '_e2', 'code_hash', repeat('e', 64),
      'salt', repeat('a', 32), 'pw_hash', repeat('f', 64), 'params', '{"N": 1}'::jsonb, 'new_token', t_e2)));
    v_checks := v_checks || jsonb_build_object('name', 'Code d''activation erroné refusé', 'ok', v_r #>> '{data,status}' = 'fail');
    v_r := public.kokolio_api(jsonb_build_object('action', 'activate', 'args', jsonb_build_object('login', v_tag || '_e2', 'code_hash', repeat('d', 64),
      'salt', repeat('a', 32), 'pw_hash', repeat('f', 64), 'params', '{"N": 1}'::jsonb, 'new_token', t_e2)));
    v_checks := v_checks || jsonb_build_object('name', 'Activation par code acceptée', 'ok', v_r #>> '{data,status}' = 'ok');

    -- 2. Pointage : heure du serveur, double appui ignoré
    v_r := public.kokolio_api(jsonb_build_object('action', 'punch', 'token', t_e1, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Pointage d''arrivée à l''heure du serveur', 'ok', v_r #>> '{data,kind}' = 'arrivee' and v_r #>> '{data,hm}' = '09:00');
    v_r := public.kokolio_api(jsonb_build_object('action', 'punch', 'token', t_e1, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Double appui ignoré', 'ok', coalesce((v_r #>> '{data,duplicate}')::boolean, false));
    perform set_config('kokolio.test_now', (v_t0 + interval '3 hours')::text, true);
    v_r := public.kokolio_api(jsonb_build_object('action', 'punch', 'token', t_e1, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Pointage de départ', 'ok', v_r #>> '{data,kind}' = 'depart' and jsonb_array_length(v_r #> '{data,day,times}') = 2);

    -- 3. Droits de lecture
    v_r := public.kokolio_api(jsonb_build_object('action', 'read', 'token', t_e2, 'args', jsonb_build_object('scope', 'users', 'user_ids', jsonb_build_array(v_e1), 'from', '2001-01-01', 'to', '2001-02-28')));
    v_checks := v_checks || jsonb_build_object('name', 'Un salarié ne lit pas les données d''un collègue', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'read', 'token', t_e2, 'args', jsonb_build_object('scope', 'all', 'from', '2001-01-01', 'to', '2001-02-28')));
    v_checks := v_checks || jsonb_build_object('name', 'Un salarié ne lit pas l''ensemble des salariés', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'read', 'token', t_mgr, 'args', jsonb_build_object('scope', 'users', 'user_ids', jsonb_build_array(v_e1), 'from', '2001-01-01', 'to', '2001-02-28')));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable lit son équipe, sans les données personnelles de la fiche',
      'ok', coalesce((v_r->>'ok')::boolean, false) and not ((v_r #> '{data,users,0}') ? 'details') and jsonb_array_length(v_r #> '{data,days}') = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'user_save', 'token', t_mgr, 'args', jsonb_build_object('login', v_tag || '_x', 'last_name', 'X')));
    v_checks := v_checks || jsonb_build_object('name', 'Un responsable ne crée pas de fiche', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'user_save', 'token', t_rh, 'args', jsonb_build_object('id', v_e1, 'login', v_tag || '_e1', 'last_name', 'Test Un', 'role', 'admin')));
    v_checks := v_checks || jsonb_build_object('name', 'Les RH ne peuvent pas attribuer le rôle administrateur', 'ok', v_r->>'code' = 'interdit');

    -- 4. Correction et validation
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-10', 'times', jsonb_build_array('09:00', '17:00'), 'comment', 'Journée oubliée')));
    v_day := (v_r #>> '{data,day,id}')::uuid;
    v_checks := v_checks || jsonb_build_object('name', 'Correction d''une journée avec motif', 'ok', v_day is not null and v_r #>> '{data,day,status}' = 'a_valider');
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-11', 'times', jsonb_build_array('09:00', '08:00'), 'comment', 'Erreur')));
    v_checks := v_checks || jsonb_build_object('name', 'Heures dans le désordre refusées', 'ok', v_r->>'code' = 'heures');
    v_r := public.kokolio_api(jsonb_build_object('action', 'days_decide', 'token', t_e1, 'args', jsonb_build_object('decision', 'valide', 'items', jsonb_build_array(jsonb_build_object('id', v_day)))));
    v_checks := v_checks || jsonb_build_object('name', 'Nul ne valide ses propres pointages', 'ok', v_r #>> '{data,failed,0,code}' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'days_decide', 'token', t_e2, 'args', jsonb_build_object('decision', 'valide', 'items', jsonb_build_array(jsonb_build_object('id', v_day)))));
    v_checks := v_checks || jsonb_build_object('name', 'Un collègue ne valide pas pour un autre', 'ok', v_r #>> '{data,failed,0,code}' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'days_decide', 'token', t_mgr, 'args', jsonb_build_object('decision', 'valide', 'items', jsonb_build_array(jsonb_build_object('id', v_day)))));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable valide', 'ok', jsonb_array_length(v_r #> '{data,done}') = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-10', 'times', jsonb_build_array('09:00', '18:00'), 'comment', 'Après validation')));
    v_checks := v_checks || jsonb_build_object('name', 'Une journée validée n''est plus modifiable par le salarié', 'ok', v_r->>'code' = 'verrou');

    -- 5. Absences
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_create', 'token', t_e1, 'args', jsonb_build_object('type', 'cp', 'start', '2001-01-22', 'end', '2001-01-23', 'days_count', 2)));
    v_abs := (v_r #>> '{data,absence,id}')::uuid;
    v_checks := v_checks || jsonb_build_object('name', 'Demande de congé enregistrée en attente', 'ok', v_r #>> '{data,absence,status}' = 'en_attente');
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_create', 'token', t_e1, 'args', jsonb_build_object('type', 'rtt', 'start', '2001-01-23', 'end', '2001-01-24', 'days_count', 2)));
    v_checks := v_checks || jsonb_build_object('name', 'Chevauchement d''absences refusé', 'ok', v_r->>'code' = 'conflit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_decide', 'token', t_e2, 'args', jsonb_build_object('id', v_abs, 'decision', 'valide')));
    v_checks := v_checks || jsonb_build_object('name', 'Un collègue ne valide pas un congé', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_check', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01')));
    v_fp := kokolio._month_fingerprint('2001-01');
    v_checks := v_checks || jsonb_build_object('name', 'Clôture bloquée tant qu''une demande est en attente', 'ok', (v_r #>> '{data,pending_absences}')::int = 1
      and (public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'fingerprint', v_fp,
            'snapshot', '{}'::jsonb, 'export_text', 'x', 'export_sha256', repeat('0', 64)))))->>'code' = 'bloque');
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_decide', 'token', t_mgr, 'args', jsonb_build_object('id', v_abs, 'decision', 'valide')));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable valide le congé', 'ok', v_r #>> '{data,absence,status}' = 'valide');

    -- 5 bis. Planning : qui peut modifier quoi
    v_r := public.kokolio_api(jsonb_build_object('action', 'plan_set', 'token', t_e1, 'args', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('user_id', v_e1, 'day', '2001-01-15', 'minutes', 0)))));
    v_checks := v_checks || jsonb_build_object('name', 'Nul ne modifie son propre planning', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'plan_set', 'token', t_e2, 'args', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('user_id', v_e1, 'day', '2001-01-15', 'minutes', 0)))));
    v_checks := v_checks || jsonb_build_object('name', 'Un collègue ne modifie pas le planning d''un autre', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'plan_set', 'token', t_mgr, 'args', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('user_id', v_e1, 'day', '2001-01-15', 'minutes', 240, 'label', 'Matinée')))));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable planifie son équipe', 'ok', (v_r #>> '{data,set}')::int = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'model_save', 'token', t_mgr, 'args', jsonb_build_object('create', true, 'model', jsonb_build_object('code', 'KKT', 'label', 'Test', 'minutes', 420))));
    v_checks := v_checks || jsonb_build_object('name', 'La bibliothèque d''horaires est réservée aux RH', 'ok', v_r->>'code' = 'interdit');

    v_r := public.kokolio_api(jsonb_build_object('action', 'anomaly_ack', 'token', t_e1, 'args', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('user_id', v_e1, 'day', '2001-01-10', 'kind', 'retard')))));
    v_checks := v_checks || jsonb_build_object('name', 'Nul n''acquitte ses propres anomalies', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'anomaly_ack', 'token', t_mgr, 'args', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('user_id', v_e1, 'day', '2001-01-10', 'kind', 'retard')))));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable acquitte une anomalie de son équipe', 'ok', (v_r #>> '{data,done}')::int = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'annual_goal_set', 'token', t_mgr, 'args', jsonb_build_object('user_id', v_e1, 'period_id', gen_random_uuid(), 'minutes', 60)));
    v_checks := v_checks || jsonb_build_object('name', 'L''objectif annuel est réservé aux RH', 'ok', v_r->>'code' = 'interdit');

    -- 6. Clôture
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_e2, 'args', jsonb_build_object('month', '2001-01')));
    v_checks := v_checks || jsonb_build_object('name', 'Seuls les RH clôturent', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'fingerprint', repeat('0', 64),
      'snapshot', '{}'::jsonb, 'export_text', 'x', 'export_sha256', repeat('0', 64))));
    v_checks := v_checks || jsonb_build_object('name', 'Clôture refusée si les données ont changé depuis le calcul', 'ok', v_r->>'code' = 'conflit');
    v_fp := kokolio._month_fingerprint('2001-01');
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'fingerprint', v_fp,
      'snapshot', '{"totals": {}}'::jsonb, 'export_text', 'x', 'export_sha256', repeat('0', 64))));
    v_checks := v_checks || jsonb_build_object('name', 'Clôture du mois', 'ok', (v_r #>> '{data,version}')::int = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-11', 'times', jsonb_build_array('09:00', '17:00'), 'comment', 'Après clôture')));
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : plus de saisie par l''outil', 'ok', v_r->>'code' = 'cloture');
    v_r := public.kokolio_api(jsonb_build_object('action', 'plan_set', 'token', t_mgr, 'args', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('user_id', v_e1, 'day', '2001-01-16', 'minutes', 0)))));
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : planning figé', 'ok', v_r->>'code' = 'cloture');
    v_ok := false;
    begin
      update kokolio.days set comment = 'modification directe' where id = v_day;
    exception when others then
      v_ok := sqlerrm like 'KK:cloture:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : modification directe en base refusée', 'ok', v_ok);
    v_ok := false;
    begin
      update kokolio.absences set days_count = 9 where id = v_abs;
    exception when others then
      v_ok := sqlerrm like 'KK:cloture:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : absence figée', 'ok', v_ok);
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_reopen', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'reason', 'Autodiagnostic')));
    v_checks := v_checks || jsonb_build_object('name', 'Réouverture motivée par les RH', 'ok', coalesce((v_r->>'ok')::boolean, false) and not kokolio._month_closed('2001-01'));

    -- 7. Journal
    v_ok := false;
    begin
      update kokolio.audit set action = 'falsifie' where seq = (select max(a.seq) from kokolio.audit a);
    exception when others then
      v_ok := sqlerrm like 'KK:journal:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Journal : modification refusée', 'ok', v_ok);
    v_ok := false;
    begin
      delete from kokolio.audit where seq = (select max(a.seq) from kokolio.audit a);
    exception when others then
      v_ok := sqlerrm like 'KK:journal:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Journal : suppression refusée', 'ok', v_ok);
    v_r := public.kokolio_api(jsonb_build_object('action', 'journal_verify', 'token', t_rh, 'args', jsonb_build_object('after', v_seq0, 'limit', 5000)));
    v_checks := v_checks || jsonb_build_object('name', 'Journal : chaîne d''empreintes intacte', 'ok', coalesce((v_r #>> '{data,ok}')::boolean, false) and (v_r #>> '{data,checked}')::int > 5);

    -- 8. Cloisonnement de la base
    v_checks := v_checks || jsonb_build_object('name', 'La porte d''entrée est fermée au rôle public de l''API',
      'ok', not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated') and has_function_privilege(r.rolname, 'public.kokolio_api(jsonb)', 'execute')));
    v_checks := v_checks || jsonb_build_object('name', 'Le schéma de données est inaccessible aux rôles de l''API',
      'ok', not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') and has_schema_privilege(r.rolname, 'kokolio', 'usage')));

    -- 8 bis. Environnement de test : la copie est réservée à l'administrateur, n'oublie aucune table, et ne part que de la production
    v_r := public.kokolio_api(jsonb_build_object('action', 'test_clone', 'token', t_rh, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Copie vers l''environnement de test réservée aux administrateurs', 'ok', v_r->>'code' = 'interdit');
    v_checks := v_checks || jsonb_build_object('name', 'Copie vers l''environnement de test : aucune table oubliée',
      'ok', not exists (select 1 from pg_class tb join pg_namespace ns on ns.oid = tb.relnamespace
                        where ns.nspname = 'kokolio' and tb.relkind = 'r' and tb.relname <> all (kokolio._test_tables() || array['meta', 'sessions', 'throttle'])));

    -- 8 ter. Organigramme : la structure, pas la liste des salariés. Simulation d'activité : réservée, et sourde aux passages forgés.
    v_r := public.kokolio_api(jsonb_build_object('action', 'org_chart', 'token', t_e2));
    v_checks := v_checks || jsonb_build_object('name', 'Organigramme : seuls ceux qui encadrent y figurent',
      'ok', coalesce((v_r->>'ok')::boolean, false)
            and exists (select 1 from jsonb_array_elements(v_r #> '{data,nodes}') x where (x->>'id')::uuid = v_mgr)
            and not exists (select 1 from jsonb_array_elements(v_r #> '{data,nodes}') x where (x->>'id')::uuid in (v_e1, v_e2, v_rh)));
    v_r := public.kokolio_api(jsonb_build_object('action', 'sim_set', 'token', t_rh, 'args', jsonb_build_object('on', true)));
    v_checks := v_checks || jsonb_build_object('name', 'Simulation d''activité : mise en marche réservée aux administrateurs', 'ok', v_r->>'code' = 'interdit');
    select count(*) into v_n from kokolio.punch_log l where l.user_id = v_e1;
    v_r := public.kokolio_api(jsonb_build_object('action', 'sim_apply', 'args', jsonb_build_object('expect_last', 'x', 'upto', 'x',
      'events', jsonb_build_array(jsonb_build_object('kind', 'punch', 'user', v_e1, 't', kokolio._iso(v_t0))))));
    v_checks := v_checks || jsonb_build_object('name', 'Simulation d''activité : un passage forgé ne fait pointer personne',
      'ok', (select count(*) from kokolio.punch_log l where l.user_id = v_e1) = v_n);

    -- 9. Mode démonstration : l'effacement des données n'existe que là, et la simulation d'activité ne sort pas de son périmètre
    if exists (select 1 from kokolio.meta m where m.key = 'demo') then
      v_checks := v_checks || jsonb_build_object('name', 'Effacement des données réservé au mode démonstration (actif ici : contrôle sans objet)', 'ok', true);
      v_checks := v_checks || jsonb_build_object('name', 'Simulation d''activité réservée au test et au mode démonstration (actif ici : contrôle sans objet)', 'ok', true);
    else
      insert into kokolio.users (login, role, last_name) values (v_tag || '_adm', 'admin', 'Test Admin') returning id into v_adm;
      t_adm := encode(sha256(convert_to(v_tag || 'adm', 'UTF8')), 'hex');
      insert into kokolio.sessions (token_hash, user_id, created_at, last_seen, expires_at) values (t_adm, v_adm, v_t0, v_t0, v_t0 + interval '1 day');
      v_r := public.kokolio_api(jsonb_build_object('action', 'demo_reset', 'token', t_adm, 'args', '{}'::jsonb));
      v_checks := v_checks || jsonb_build_object('name', 'Effacement des données impossible hors mode démonstration', 'ok', v_r->>'code' = 'etat');
      v_r := public.kokolio_api(jsonb_build_object('action', 'sim_set', 'token', t_adm, 'args', jsonb_build_object('on', true)));
      v_checks := v_checks || jsonb_build_object('name', case when kokolio._env() = 'test' then 'Simulation d''activité : permise dans l''environnement de test'
                                                              else 'Simulation d''activité impossible en production hors mode démonstration' end,
        'ok', case when kokolio._env() = 'test' then coalesce((v_r->>'ok')::boolean, false) else v_r->>'code' = 'etat' end);
    end if;

    raise exception 'KKTEST:%', v_checks::text;
  exception when others then
    if sqlerrm like 'KKTEST:%' then
      v_checks := substr(sqlerrm, 8)::jsonb;
      return jsonb_build_object(
        'ok', not exists (select 1 from jsonb_array_elements(v_checks) x where not coalesce((x->>'ok')::boolean, false)),
        'checks', v_checks, 'count', jsonb_array_length(v_checks));
    end if;
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'state', sqlstate, 'checks', '[]'::jsonb);
  end;
end $$;
