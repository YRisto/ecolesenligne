-- =====================================================================
-- Kokolio — anomalies : acquittement
-- Acquitter, c'est noter qu'une anomalie a été vue et qu'elle n'appelle pas de correction. Cela ne change aucun chiffre.
-- Réservé au responsable direct du salarié et aux RH, jamais au salarié lui-même.
-- =====================================================================
create or replace function kokolio._anomaly_ack(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb; v_uid uuid; v_day date; v_kind text; v_comment text := left(trim(coalesce(p_args->>'comment', '')), 300);
  v_undo boolean := coalesce((p_args->>'undo')::boolean, false); v_n int := 0; v_ok jsonb := '{}'::jsonb; v_touch jsonb := '{}'::jsonb; v_k text; v_login text;
begin
  if jsonb_typeof(p_args->'items') is distinct from 'array' or jsonb_array_length(p_args->'items') < 1 or jsonb_array_length(p_args->'items') > 1000 then
    perform kokolio._fail('requete', 'Sélectionnez entre 1 et 1 000 anomalies.');
  end if;
  for r in select y.v from jsonb_array_elements(p_args->'items') with ordinality as y(v, o) order by y.o loop
    v_uid := nullif(r->>'user_id', '')::uuid; v_day := nullif(r->>'day', '')::date; v_kind := coalesce(r->>'kind', '');
    if v_uid is null or v_day is null then perform kokolio._fail('requete', 'Anomalie invalide.'); end if;
    if v_kind not in ('depart', 'vide', 'retard', 'depart_anticipe', 'hors_plage', 'presence_insuffisante', 'travail_absence', 'pause_courte', 'pause_longue', 'pause_non_prise') then
      perform kokolio._fail('requete', 'Type d''anomalie inconnu.');
    end if;
    if not (v_ok ? v_uid::text) then
      if not kokolio._can_manage(me, v_uid) then perform kokolio._fail('interdit', 'Vous ne pouvez pas traiter les anomalies de ce salarié.'); end if;
      v_ok := v_ok || jsonb_build_object(v_uid::text, true);
    end if;
    if v_undo then
      delete from kokolio.anomaly_acks k where k.user_id = v_uid and k.day = v_day and k.kind = v_kind;
      if not found then continue; end if;
    else
      insert into kokolio.anomaly_acks (user_id, day, kind, comment, acked_by, acked_at) values (v_uid, v_day, v_kind, v_comment, me.id, kokolio._now())
      on conflict (user_id, day, kind) do update set comment = excluded.comment, acked_by = excluded.acked_by, acked_at = excluded.acked_at;
    end if;
    v_n := v_n + 1;
    v_touch := jsonb_set(v_touch, array[v_uid::text], coalesce(v_touch->(v_uid::text), '[]'::jsonb) || jsonb_build_object('jour', v_day, 'anomalie', v_kind));
  end loop;
  for v_k in select jsonb_object_keys(v_touch) loop
    select x.login into v_login from kokolio.users x where x.id = v_k::uuid;
    perform kokolio._audit(me.id, case when v_undo then 'acquittement_annule' else 'anomalies_acquittees' end, v_k::uuid, coalesce(v_login, ''),
      jsonb_build_object('nombre', jsonb_array_length(v_touch->v_k)) || case when v_comment <> '' then jsonb_build_object('commentaire', v_comment) else '{}'::jsonb end
        || case when jsonb_array_length(v_touch->v_k) <= 40 then jsonb_build_object('detail', v_touch->v_k) else '{}'::jsonb end, coalesce(p->>'ip', ''));
  end loop;
  return jsonb_build_object('done', v_n);
end $$;
