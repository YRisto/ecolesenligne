-- =====================================================================
-- Kokolio — environnement de test
-- =====================================================================
-- Une seconde installation complète vit dans le schéma « kokolio_test » : mêmes tables, mêmes fonctions, et sa propre porte
-- d'entrée (public.kokolio_test_api). Elle est créée par le script install-test.sql, qui est ce script-ci où le nom du schéma
-- est remplacé partout. Les deux installations ne partagent aucune table : ce qui est fait dans l'une ne touche jamais l'autre.
-- Seule passerelle, à sens unique : la copie ci-dessous, lancée depuis la production par un administrateur. Elle remplace tout
-- le contenu du test par celui de la production (comptes et mots de passe compris ; le contenu des justificatifs excepté).
-- Rien, dans le test, ne peut écrire en production.

-- Tables copiées. Les sessions et le compteur d'essais de connexion ne le sont pas : après une copie, chacun se reconnecte au test.
create or replace function kokolio._test_tables() returns text[] language sql immutable as $$
  select array['users', 'absence_types', 'day_models', 'cycles', 'contracts', 'plan_days', 'annual_periods', 'annual_goals', 'annual_entries',
               'anomaly_acks', 'days', 'punch_log', 'absences', 'attachments', 'balance_entries', 'closures', 'audit']
$$;

-- État de l'environnement de test, vu de la production : installé ou non, version, date de la dernière copie, volume.
create or replace function kokolio._test_status(me kokolio.users) returns jsonb language plpgsql as $$
declare v_dst constant text := 'kokolio_test'; v_installed boolean; v_schema jsonb; v_clone jsonb; v_users bigint; v_bytes bigint;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  if kokolio._env() <> 'production' then
    return jsonb_build_object('environment', 'test', 'cloned', (select m.value from kokolio.meta m where m.key = 'test_clone'));
  end if;
  v_installed := to_regclass(v_dst || '.meta') is not null and to_regclass(v_dst || '.users') is not null;
  if v_installed then
    execute format('select (select m.value from %1$I.meta m where m.key = ''schema_version''), (select m.value from %1$I.meta m where m.key = ''test_clone''), (select count(*) from %1$I.users)', v_dst)
      into v_schema, v_clone, v_users;
    select coalesce(sum(pg_total_relation_size(c.oid)), 0) into v_bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = v_dst and c.relkind = 'r';
  end if;
  return jsonb_build_object('environment', 'production', 'installed', v_installed, 'schema', v_schema,
    'schema_production', (select m.value from kokolio.meta m where m.key = 'schema_version'), 'cloned', v_clone, 'users', v_users, 'db_bytes', v_bytes);
end $$;

-- Copie de la production vers le test. Tout ou rien : en cas d'échec, le test garde son contenu précédent.
create or replace function kokolio._test_clone(me kokolio.users, p jsonb) returns jsonb language plpgsql as $$
declare
  v_dst constant text := 'kokolio_test'; v_tables text[] := kokolio._test_tables(); v_all text[]; t text; v_cols text; v_src text;
  v_temoin constant bytea := convert_to('Ce justificatif n''a pas été copié dans l''environnement de test : les documents déposés par les salariés restent en production.', 'UTF8');
  v_a jsonb; v_b jsonb; v_missing text; v_sql text := ''; v_sel text := ''; v_counts jsonb; v_total bigint := 0; v_seq record;
  v_at timestamptz := kokolio._now(); k text;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  if kokolio._env() <> 'production' then perform kokolio._fail('etat', 'La copie se lance depuis la production, pas depuis l''environnement de test.'); end if;
  if to_regclass(v_dst || '.meta') is null or to_regclass(v_dst || '.users') is null then
    perform kokolio._fail('etat', 'L''environnement de test n''est pas encore installé dans la base (script install-test.sql).');
  end if;
  select m.value into v_a from kokolio.meta m where m.key = 'schema_version';
  execute format('select m.value from %I.meta m where m.key = ''schema_version''', v_dst) into v_b;
  if v_a is distinct from v_b then
    perform kokolio._fail('etat', 'L''environnement de test n''est pas à la même version que la production : rejouez son script d''installation, puis recommencez.');
  end if;
  -- toute table de la production est soit copiée, soit volontairement laissée de côté : une table oubliée arrête la copie
  select string_agg(c.relname, ', ' order by c.relname) into v_missing from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'kokolio' and c.relkind = 'r' and c.relname <> all (v_tables || array['meta', 'sessions', 'throttle']);
  if v_missing is not null then perform kokolio._fail('interne', 'Tables absentes de la copie : ' || v_missing); end if;

  -- une copie à la fois
  perform 1 from kokolio.meta m where m.key = 'schema_version' for update;
  v_all := v_tables || array['sessions', 'throttle'];
  -- vider le test ; ses protections (journal et pointages non effaçables, mois clôturés) sont suspendues le temps de la copie
  foreach t in array v_all loop execute format('alter table %I.%I disable trigger user', v_dst, t); end loop;
  execute 'truncate ' || (select string_agg(format('%I.%I', v_dst, x), ', ') from unnest(v_all) x) || ' restart identity';

  -- une seule requête pour toutes les tables : elles sont lues au même instant, la copie est cohérente sans bloquer la production
  foreach t in array v_tables loop
    -- les justificatifs ne quittent pas la production : ce sont des documents personnels, souvent médicaux, et ce qui pèse le plus lourd.
    -- Chaque absence garde sa pièce jointe dans le test, mais son contenu est remplacé par un fichier témoin de quelques octets.
    select string_agg(quote_ident(s.column_name), ', ' order by s.ordinal_position),
           string_agg(case when t <> 'attachments' then quote_ident(s.column_name)
                           when s.column_name = 'filename' then quote_literal('justificatif-non-copie.txt')
                           when s.column_name = 'mime' then quote_literal('text/plain')
                           when s.column_name = 'size' then octet_length(v_temoin)::text
                           when s.column_name = 'data' then format('decode(%L, ''hex'')', encode(v_temoin, 'hex'))
                           else quote_ident(s.column_name) end, ', ' order by s.ordinal_position)
      into v_cols, v_src
      from information_schema.columns s
      join information_schema.columns d on d.table_schema = v_dst and d.table_name = s.table_name and d.column_name = s.column_name
      where s.table_schema = 'kokolio' and s.table_name = t and s.is_generated = 'NEVER' and d.is_generated = 'NEVER';
    if v_cols is null then perform kokolio._fail('interne', 'Table introuvable dans l''environnement de test : ' || t); end if;
    v_sql := v_sql || format('c_%s as (insert into %I.%I (%s) select %s from kokolio.%I returning 1), ', t, v_dst, t, v_cols, v_src, t);
    v_sel := v_sel || format('%L, (select count(*) from c_%s), ', t, t);
  end loop;
  -- réglages et états (version du schéma exceptée) dans la même lecture : la tête du journal correspond à sa dernière ligne.
  -- La simulation d'activité arrive arrêtée : le test est une image fixe de la production, qu'on anime ou non depuis son propre onglet « Test ».
  v_sql := 'with ' || v_sql || format('c_meta as (insert into %I.meta (key, value) select m.key, '
    || 'case when m.key = ''simulation'' and coalesce((m.value->>''on'')::boolean, false) then m.value || jsonb_build_object(''on'', false, ''stopped_at'', %L::text) else m.value end '
    || 'from kokolio.meta m where m.key not in (''schema_version'', ''test_clone'') '
    || 'on conflict (key) do update set value = excluded.value, updated_at = now() returning 1) ', v_dst, kokolio._iso(v_at))
    || 'select jsonb_build_object(' || v_sel || '''meta'', (select count(*) from c_meta))';
  execute format('delete from %I.meta d where d.key <> ''schema_version'' and not exists (select 1 from kokolio.meta m where m.key = d.key)', v_dst);
  execute v_sql into v_counts;
  foreach t in array v_all loop execute format('alter table %I.%I enable trigger user', v_dst, t); end loop;

  -- compteurs automatiques : repartir après la plus grande valeur copiée
  for v_seq in select c.table_name, c.column_name, pg_get_serial_sequence(format('%I.%I', v_dst, c.table_name), c.column_name) as seq
               from information_schema.columns c where c.table_schema = v_dst and c.table_name = any (v_tables) and c.column_default like 'nextval(%' loop
    if v_seq.seq is not null then
      execute format('select setval(%L, coalesce((select max(%I) from %I.%I), 0) + 1, false)', v_seq.seq, v_seq.column_name, v_dst, v_seq.table_name);
    end if;
  end loop;
  foreach k in array v_tables loop v_total := v_total + coalesce((v_counts->>k)::bigint, 0); end loop;
  -- la marque de la copie, affichée dans le bandeau de l'environnement de test
  execute format('insert into %I.meta (key, value) values (''test_clone'', $1) on conflict (key) do update set value = excluded.value, updated_at = now()', v_dst)
    using jsonb_build_object('at', v_at, 'by', me.login, 'rows', v_total, 'users', v_counts->'users');
  perform kokolio._audit(me.id, 'test_copie', null, '', jsonb_build_object('lignes', v_total, 'comptes', v_counts->'users'), coalesce(p->>'ip', ''));
  return jsonb_build_object('at', v_at, 'rows', v_total, 'counts', v_counts);
end $$;
