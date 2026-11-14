-- Synthetic local seed rows for development only.
-- Loaded automatically by `npx supabase db reset` (see [db.seed] in config.toml).
-- Do not add real probe identities, locations, or measurement data here.

insert into public.tests (id, name)
values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Ping'
);

insert into public.test_revisions (
    id,
    test_id,
    version_number,
    source_commit_sha,
    script_path,
    definition_path,
    script_sha256,
    definition_sha256,
    definition
)
values (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    1,
    'abaa66e0163788fc0fe5820a13bce17feb1b14c6',
    'ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd/run.sh',
    'ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd/test.json',
    '9552c9a3c46a3ad38ae72552843aa4bb797148796a84a2857b8c27621b533be0',
    'b478fc8687cff81046fd1c3a4707ef7bf105924279d729c950c2a4f8ca8a6c4b',
    '{"test_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","name":"Ping","metrics":{"rtt_avg_ms":{"label":"Average latency","type":"number","unit":"ms","nullable":true},"packet_loss_pct":{"label":"Packet loss","type":"number","unit":"%","nullable":false}},"map":{"default_metric":"rtt_avg_ms"}}'::jsonb
);

insert into public.probes (
    id,
    name,
    desired_revision_id,
    desired_interval_seconds
)
values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Local synthetic ping probe',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    300
);

-- Synthetic local credential only. The digest is SHA-256 of the UTF-8 token
-- "connectivity-local-probe-token".
insert into public.probe_credentials (id, probe_id, token_hash)
values (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    encode(sha256(convert_to('connectivity-local-probe-token', 'UTF8')), 'hex')
);

insert into public.measurements (
    id,
    schema_version,
    probe_id,
    test_revision_id,
    started_at,
    finished_at,
    status,
    result_code,
    result_data,
    location
)
values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    1,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '2026-11-14T00:00:00Z'::timestamptz,
    '2026-11-14T00:00:05Z'::timestamptz,
    'completed',
    0,
    '{"rtt_avg_ms":18.4,"packet_loss_pct":0}'::jsonb,
    null
);
