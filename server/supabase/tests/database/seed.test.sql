-- Verify the synthetic local seed fixture.
begin;

select plan(4);

select ok(
    exists (
        select 1
        from public.tests t
        join public.test_revisions r on r.test_id = t.id
        join public.probes p on p.desired_revision_id = r.id
        join public.probe_credentials c on c.probe_id = p.id
        join public.measurements m
            on m.probe_id = p.id
            and m.test_revision_id = r.id
        where t.id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
            and r.id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
            and p.id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            and c.id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
            and m.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
            and p.disabled_at is null
            and p.desired_interval_seconds = 300
            and c.revoked_at is null
    ),
    'seed fixture joins across all seeded tables'
);

select is(
    (
        select jsonb_build_object(
            'name', t.name,
            'version_number', r.version_number,
            'source_commit_sha', r.source_commit_sha,
            'script_path', r.script_path,
            'definition_path', r.definition_path,
            'script_sha256', r.script_sha256,
            'definition_sha256', r.definition_sha256,
            'definition', r.definition
        )
        from public.tests t
        join public.test_revisions r on r.test_id = t.id
        where t.id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
            and r.id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    ),
    '{
        "name": "Ping",
        "version_number": 1,
        "source_commit_sha": "62bd52e3533eabcd815c2e63254c0d111bc531dc",
        "script_path": "ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd/run.sh",
        "definition_path": "ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd/test.json",
        "script_sha256": "1973ef9b4e9fb956b06e6645214939912bac0e39f50d631a9391107376bc3e26",
        "definition_sha256": "b478fc8687cff81046fd1c3a4707ef7bf105924279d729c950c2a4f8ca8a6c4b",
        "definition": {
            "test_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            "name": "Ping",
            "metrics": {
                "rtt_avg_ms": {
                    "label": "Average latency",
                    "type": "number",
                    "unit": "ms",
                    "nullable": true
                },
                "packet_loss_pct": {
                    "label": "Packet loss",
                    "type": "number",
                    "unit": "%",
                    "nullable": false
                }
            },
            "map": {
                "default_metric": "rtt_avg_ms"
            }
        }
    }'::jsonb,
    'Ping manifest metadata matches fixture'
);

select is(
    (
        select c.token_hash
        from public.probe_credentials c
        where c.id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
            and c.probe_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            and c.revoked_at is null
    ),
    encode(
        sha256(convert_to('connectivity-local-probe-token', 'UTF8')),
        'hex'
    ),
    'active credential uses the synthetic local token digest'
);

select is(
    (
        select jsonb_build_object(
            'schema_version', m.schema_version,
            'status', m.status,
            'result_code', m.result_code,
            'result_data', m.result_data,
            'location', m.location
        )
        from public.measurements m
        where m.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
            and m.probe_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            and m.test_revision_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
            and m.finished_at >= m.started_at
    ),
    '{
        "schema_version": 1,
        "status": "completed",
        "result_code": 0,
        "result_data": {
            "rtt_avg_ms": 18.4,
            "packet_loss_pct": 0
        },
        "location": null
    }'::jsonb,
    'completed measurement shape matches fixture'
);

select * from finish();

rollback;
