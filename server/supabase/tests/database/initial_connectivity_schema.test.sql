-- Tests for the initial connectivity schema.
begin;

select no_plan();

-- Tables
select has_table('public', 'tests', 'tests table exists');
select has_table('public', 'test_revisions', 'test_revisions table exists');
select has_table('public', 'probes', 'probes table exists');
select has_table('public', 'probe_credentials', 'probe_credentials table exists');
select has_table('public', 'measurements', 'measurements table exists');

-- Row level security is enabled everywhere and no client role has table access.
select ok(c.relrowsecurity, format('RLS enabled on %s', c.relname))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tests', 'test_revisions', 'probes', 'probe_credentials', 'measurements')
order by c.relname;

select is(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename in ('tests', 'test_revisions', 'probes', 'probe_credentials', 'measurements')),
  0::bigint,
  'no RLS policies grant client access'
);

select ok(
  not bool_or(has_table_privilege(r, 'public.' || t, p)),
  format('%s has no table privileges on %s', r, t)
)
from unnest(array['anon', 'authenticated']) as r
cross join unnest(array['tests', 'test_revisions', 'probes', 'probe_credentials', 'measurements']) as t
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p
group by r, t
order by r, t;

-- service_role may mutate the mutable tables.
select ok(has_table_privilege('service_role', 'public.' || t, p),
          format('service_role has %s on %s', p, t))
from unnest(array['tests', 'probes', 'probe_credentials']) as t
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p
order by t, p;

-- Revisions and measurements are append-only through service_role.
select ok(has_table_privilege('service_role', 'public.' || t, p),
          format('service_role has %s on %s', p, t))
from unnest(array['test_revisions', 'measurements']) as t
cross join unnest(array['SELECT', 'INSERT']) as p
order by t, p;

select ok(not has_table_privilege('service_role', 'public.' || t, p),
          format('service_role cannot %s %s', p, t))
from unnest(array['test_revisions', 'measurements']) as t
cross join unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) as p
order by t, p;

-- Foreign-key indexes and descending measurement indexes.
select has_index('public', 'probes', 'probes_desired_revision_id_idx',
                 array['desired_revision_id'], 'probes desired revision FK is indexed');
select has_index('public', 'probe_credentials', 'probe_credentials_probe_id_idx',
                 array['probe_id'], 'probe credentials probe FK is indexed');
select has_index('public', 'measurements', 'measurements_probe_received_idx',
                 array['probe_id', 'received_at', 'id'], 'measurements probe/received index exists');
select has_index('public', 'measurements', 'measurements_test_revision_received_idx',
                 array['test_revision_id', 'received_at', 'id'], 'measurements revision/received index exists');

select ok(
  (select indexdef ilike '%received_at DESC, id DESC%' from pg_indexes
   where schemaname = 'public' and indexname = 'measurements_probe_received_idx'),
  'measurements probe index sorts received_at and id descending'
);
select ok(
  (select indexdef ilike '%received_at DESC, id DESC%' from pg_indexes
   where schemaname = 'public' and indexname = 'measurements_test_revision_received_idx'),
  'measurements revision index sorts received_at and id descending'
);

-- Synthetic fixtures, isolated by the surrounding transaction.
select lives_ok($$
  insert into public.tests (id, name)
  values ('00000000-0000-0000-0000-000000000001', 'Synthetic Initial Schema Test')
$$, 'inserts synthetic test');

select lives_ok($$
  insert into public.test_revisions (
    id, test_id, version_number, source_commit_sha, script_path, definition_path,
    script_sha256, definition_sha256, definition
  ) values (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    1,
    repeat('a', 40),
    'tests/synthetic.sh',
    'tests/synthetic.json',
    repeat('b', 64),
    repeat('c', 64),
    '{"test_id":"00000000-0000-0000-0000-000000000001"}'::jsonb
  )
$$, 'inserts synthetic revision');

select lives_ok($$
  insert into public.test_revisions (
    id, test_id, version_number, source_commit_sha, script_path, definition_path,
    script_sha256, definition_sha256, definition
  ) values (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    2,
    repeat('d', 40),
    'tests/synthetic-2.sh',
    'tests/synthetic-2.json',
    repeat('e', 64),
    repeat('f', 64),
    '{"test_id":"00000000-0000-0000-0000-000000000001"}'::jsonb
  )
$$, 'inserts second synthetic revision');

select lives_ok($$
  insert into public.probes (id, name, desired_revision_id, desired_interval_seconds)
  values ('00000000-0000-0000-0000-000000000201', 'Synthetic Probe',
          '00000000-0000-0000-0000-000000000101', 60)
$$, 'inserts probe assigned to a revision');

select lives_ok($$
  insert into public.probe_credentials (id, probe_id, token_hash)
  values ('00000000-0000-0000-0000-000000000301',
          '00000000-0000-0000-0000-000000000201', repeat('a', 64))
$$, 'inserts probe credential');

select lives_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data, location
  ) values (
    '00000000-0000-0000-0000-000000000401', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z',
    'completed', 0, '{"ok":true}'::jsonb, '{"city":"Synthetic"}'::jsonb
  )
$$, 'inserts synthetic measurement');

select is((select name from public.tests
           where id = '00000000-0000-0000-0000-000000000001'),
          'Synthetic Initial Schema Test',
          'synthetic test row persisted');

-- tests name must be non-blank.
select throws_ok($$
  insert into public.tests (id, name)
  values ('00000000-0000-0000-0000-000000000002', '   ')
$$, '23514', null, 'rejects blank test names');

-- Assignment pair must be both null or a revision with a positive interval.
select throws_ok($$
  insert into public.probes (id, name, desired_revision_id, desired_interval_seconds)
  values ('00000000-0000-0000-0000-000000000202', 'Bad Probe',
          '00000000-0000-0000-0000-000000000101', null)
$$, '23514', null, 'rejects assigned revision with null interval');

select throws_ok($$
  insert into public.probes (id, name, desired_revision_id, desired_interval_seconds)
  values ('00000000-0000-0000-0000-000000000203', 'Bad Probe', null, 60)
$$, '23514', null, 'rejects interval without an assigned revision');

select throws_ok($$
  insert into public.probes (id, name, desired_revision_id, desired_interval_seconds)
  values ('00000000-0000-0000-0000-000000000204', 'Bad Probe',
          '00000000-0000-0000-0000-000000000101', 0)
$$, '23514', null, 'rejects zero interval');

select throws_ok($$
  insert into public.probes (id, name, desired_revision_id, desired_interval_seconds)
  values ('00000000-0000-0000-0000-000000000205', 'Bad Probe',
          '00000000-0000-0000-0000-000000000101', -5)
$$, '23514', null, 'rejects negative interval');

select throws_ok($$
  insert into public.probes (id, name, desired_revision_id, desired_interval_seconds)
  values ('00000000-0000-0000-0000-000000000206', 'Bad Probe',
          '00000000-0000-0000-0000-000000000999', 60)
$$, '23503', null, 'rejects assignment to a missing revision');

-- Revision definition.test_id must match the revision's test_id.
select throws_ok($$
  insert into public.test_revisions (
    id, test_id, version_number, source_commit_sha, script_path, definition_path,
    script_sha256, definition_sha256, definition
  ) values (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001', 3, repeat('1', 40),
    'tests/bad-1.sh', 'tests/bad-1.json', repeat('1', 64), repeat('1', 64),
    '{"test_id":"00000000-0000-0000-0000-000000000002"}'::jsonb
  )
$$, '23514', null, 'rejects revision definition with a different test_id');

select throws_ok($$
  insert into public.test_revisions (
    id, test_id, version_number, source_commit_sha, script_path, definition_path,
    script_sha256, definition_sha256, definition
  ) values (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001', 4, repeat('2', 40),
    'tests/bad-2.sh', 'tests/bad-2.json', repeat('2', 64), repeat('2', 64),
    '{}'::jsonb
  )
$$, '23514', null, 'rejects revision definition missing test_id');

-- Probe credentials validate hash format, uniqueness, and the probe FK.
select throws_ok($$
  insert into public.probe_credentials (id, probe_id, token_hash)
  values ('00000000-0000-0000-0000-000000000302',
          '00000000-0000-0000-0000-000000000201', 'not-a-hash')
$$, '23514', null, 'rejects malformed credential token hash');

select throws_ok($$
  insert into public.probe_credentials (id, probe_id, token_hash)
  values ('00000000-0000-0000-0000-000000000303',
          '00000000-0000-0000-0000-000000000201', repeat('a', 64))
$$, '23505', null, 'rejects duplicate credential token hash');

select throws_ok($$
  insert into public.probe_credentials (id, probe_id, token_hash)
  values ('00000000-0000-0000-0000-000000000304',
          '00000000-0000-0000-0000-000000000999', repeat('3', 64))
$$, '23503', null, 'rejects credential for a missing probe');

-- Measurement checks.
select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000402', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'completed', null, '{"ok":true}'::jsonb
  )
$$, '23514', null, 'rejects completed measurement with NULL result code');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000403', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'completed', 1, '{"ok":true}'::jsonb
  )
$$, '23514', null, 'rejects completed measurement with nonzero result code');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000404', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'failed', null, '{"error":"boom"}'::jsonb
  )
$$, '23514', null, 'rejects non-empty result data for failed measurements');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000405', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:01Z', '2026-01-02T00:00:00Z',
    'completed', 0, '{"ok":true}'::jsonb
  )
$$, '23514', null, 'rejects finished_at before started_at');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000406', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'completed', 0, '[]'::jsonb
  )
$$, '23514', null, 'rejects non-object result data');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data, location
  ) values (
    '00000000-0000-0000-0000-000000000407', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'completed', 0, '{"ok":true}'::jsonb, '[]'::jsonb
  )
$$, '23514', null, 'rejects non-object location');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000408', 2,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'completed', 0, '{"ok":true}'::jsonb
  )
$$, '23514', null, 'rejects unsupported measurement schema version');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000409', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z',
    'bogus', null, '{}'::jsonb
  )
$$, '23514', null, 'rejects unsupported measurement status');

select throws_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000401', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '2026-01-03T00:00:00Z', '2026-01-03T00:00:01Z',
    'completed', 0, '{"ok":true}'::jsonb
  )
$$, '23505', null, 'rejects duplicate measurement run UUID');

-- Historical measurements may report a revision that differs from the probe's
-- current assignment (for example while a probe has not yet updated).
select lives_ok($$
  insert into public.measurements (
    id, schema_version, probe_id, test_revision_id, started_at, finished_at,
    status, result_code, result_data
  ) values (
    '00000000-0000-0000-0000-000000000410', 1,
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000102',
    '2026-01-04T00:00:00Z', '2026-01-04T00:00:01Z',
    'completed', 0, '{"ok":true}'::jsonb
  )
$$, 'accepts a reported revision that differs from the assigned revision');

select is((select test_revision_id from public.measurements
           where id = '00000000-0000-0000-0000-000000000410'),
          '00000000-0000-0000-0000-000000000102'::uuid,
          'reported actual revision persisted');

select * from finish();

rollback;
