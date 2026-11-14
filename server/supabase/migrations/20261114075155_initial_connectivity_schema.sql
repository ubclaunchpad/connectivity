-- Initial connectivity schema: tests, revisions, probes, credentials, and measurements.

create table public.tests (
    id uuid not null,
    name text not null,
    created_at timestamptz not null default now(),
    constraint tests_pkey primary key (id),
    constraint tests_name_nonblank check (name ~ '[^[:space:]]')
);

create table public.test_revisions (
    id uuid not null,
    test_id uuid not null,
    version_number integer not null,
    source_commit_sha text not null,
    script_path text not null,
    definition_path text not null,
    script_sha256 text not null,
    definition_sha256 text not null,
    definition jsonb not null,
    published_at timestamptz not null default now(),
    constraint test_revisions_pkey primary key (id),
    constraint test_revisions_test_id_fkey
        foreign key (test_id) references public.tests (id)
        on update no action on delete no action,
    constraint test_revisions_version_number_positive
        check (version_number > 0),
    constraint test_revisions_source_commit_sha_format
        check (source_commit_sha ~ '^[0-9a-f]{40}$'),
    constraint test_revisions_script_path_nonblank
        check (script_path ~ '[^[:space:]]'),
    constraint test_revisions_definition_path_nonblank
        check (definition_path ~ '[^[:space:]]'),
    constraint test_revisions_script_path_relative
        check (
            script_path !~ '^/'
            and script_path !~ '(^|/)[.][.](/|$)'
        ),
    constraint test_revisions_definition_path_relative
        check (
            definition_path !~ '^/'
            and definition_path !~ '(^|/)[.][.](/|$)'
        ),
    constraint test_revisions_paths_different
        check (script_path <> definition_path),
    constraint test_revisions_script_sha256_format
        check (script_sha256 ~ '^[0-9a-f]{64}$'),
    constraint test_revisions_definition_sha256_format
        check (definition_sha256 ~ '^[0-9a-f]{64}$'),
    constraint test_revisions_definition_object
        check (jsonb_typeof(definition) = 'object'),
    constraint test_revisions_definition_test_id
        check (
            definition ? 'test_id'
            and jsonb_typeof(definition -> 'test_id') = 'string'
            and definition ->> 'test_id' = test_id::text
        ),
    constraint test_revisions_test_version_unique
        unique (test_id, version_number),
    constraint test_revisions_test_commit_unique
        unique (test_id, source_commit_sha),
    constraint test_revisions_script_path_unique
        unique (script_path),
    constraint test_revisions_definition_path_unique
        unique (definition_path)
);

create table public.probes (
    id uuid not null default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now(),
    disabled_at timestamptz,
    desired_revision_id uuid,
    desired_interval_seconds integer,
    constraint probes_pkey primary key (id),
    constraint probes_name_nonblank check (name ~ '[^[:space:]]'),
    constraint probes_desired_revision_id_fkey
        foreign key (desired_revision_id) references public.test_revisions (id)
        on update no action on delete no action,
    constraint probes_desired_assignment_check
        check (
            (desired_revision_id is null and desired_interval_seconds is null)
            or (
                desired_revision_id is not null
                and desired_interval_seconds is not null
                and desired_interval_seconds > 0
            )
        )
);

create index probes_desired_revision_id_idx
    on public.probes (desired_revision_id);

create table public.probe_credentials (
    id uuid not null default gen_random_uuid(),
    probe_id uuid not null,
    token_hash text not null,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    constraint probe_credentials_pkey primary key (id),
    constraint probe_credentials_probe_id_fkey
        foreign key (probe_id) references public.probes (id)
        on update no action on delete no action,
    constraint probe_credentials_token_hash_format
        check (token_hash ~ '^[0-9a-f]{64}$'),
    constraint probe_credentials_token_hash_unique
        unique (token_hash)
);

create index probe_credentials_probe_id_idx
    on public.probe_credentials (probe_id);

create table public.measurements (
    id uuid not null,
    schema_version smallint not null,
    probe_id uuid not null,
    test_revision_id uuid not null,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    received_at timestamptz not null default now(),
    status text not null,
    result_code integer,
    result_data jsonb not null,
    location jsonb,
    constraint measurements_pkey primary key (id),
    constraint measurements_schema_version_check
        check (schema_version = 1),
    constraint measurements_probe_id_fkey
        foreign key (probe_id) references public.probes (id)
        on update no action on delete no action,
    constraint measurements_test_revision_id_fkey
        foreign key (test_revision_id) references public.test_revisions (id)
        on update no action on delete no action,
    constraint measurements_finished_at_check
        check (finished_at >= started_at),
    constraint measurements_status_check
        check (status in ('completed', 'failed', 'timeout')),
    constraint measurements_result_code_check
        check (
            status <> 'completed'
            or (result_code is not null and result_code = 0)
        ),
    constraint measurements_result_data_object_check
        check (jsonb_typeof(result_data) = 'object'),
    constraint measurements_result_data_empty_check
        check (
            status = 'completed'
            or result_data = '{}'::jsonb
        ),
    constraint measurements_location_check
        check (
            location is null
            or jsonb_typeof(location) = 'object'
        )
);

create index measurements_probe_received_idx
    on public.measurements (probe_id, received_at desc, id desc);

create index measurements_test_revision_received_idx
    on public.measurements (test_revision_id, received_at desc, id desc);

alter table public.tests enable row level security;
alter table public.test_revisions enable row level security;
alter table public.probes enable row level security;
alter table public.probe_credentials enable row level security;
alter table public.measurements enable row level security;

-- Supabase grants broad table privileges to client roles by default. Revoke
-- those defaults explicitly, then grant only the operations the server needs.
revoke all on table public.tests from anon, authenticated, public, service_role;
revoke all on table public.test_revisions from anon, authenticated, public, service_role;
revoke all on table public.probes from anon, authenticated, public, service_role;
revoke all on table public.probe_credentials from anon, authenticated, public, service_role;
revoke all on table public.measurements from anon, authenticated, public, service_role;

grant select, insert, update, delete on table public.tests to service_role;
grant select, insert, update, delete on table public.probes to service_role;
grant select, insert, update, delete on table public.probe_credentials to service_role;

-- Revisions and measurements are append-only through service_role.
grant select, insert on table public.test_revisions to service_role;
grant select, insert on table public.measurements to service_role;
