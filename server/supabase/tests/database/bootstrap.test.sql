-- Bootstrap smoke test for the Supabase-managed schemas.
-- The Supabase CLI supplies pgTAP; do not install extensions or create product schema here.
begin;

select plan(3);

select has_schema('public');
select has_table('auth', 'users', 'Auth users table exists');
select has_table('storage', 'buckets', 'Storage buckets table exists');

select * from finish();

rollback;
