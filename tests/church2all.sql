\set ON_ERROR_STOP on
set client_min_messages = warning;
insert into public.team_members (email, role) values ('a@team.com', 'admin'), ('b@team.com', 'member') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@team.com'), ('00000000-0000-0000-0000-00000000000b', 'b@team.com');
do $$ begin
  insert into auth.users (email) values ('stranger@x.com');
  raise exception 'FAIL guard';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise warning 'ok  strangers cannot sign up';
end $$;
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@x.com', '{"c2a": true}'), ('00000000-0000-0000-0000-0000000000c2', 'c2@x.com', '{"c2a": true}'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@y.com', '{"c2a": true}');
insert into public.c2a_links (user_id, church_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'C Um'),
  ('00000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'C Dois'),
  ('00000000-0000-0000-0000-0000000000c3', '22222222-2222-2222-2222-222222222222', 'C Tres');
create or replace function pg_temp.as_(uid text, email text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email)::text, false);
  execute 'set role authenticated'; end $$;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1', 'c1@x.com');
select 'c1 member', public.is_member(), 'team', public.is_team();
select 'c1 people', string_agg(email, ',') from public.team_people();
select 'c1 sees team rows', count(*) from public.team_members;
insert into public.shared_nbs (id, data) values ('nb-c1', '{}');
insert into public.shared_members (nb_id, email) values ('nb-c1', 'c2@x.com');
do $$ begin insert into public.shared_members (nb_id, email) values ('nb-c1', 'c3@y.com'); raise exception 'FAIL other church';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise warning 'ok  no sharing with another church'; end $$;
do $$ begin insert into public.shared_members (nb_id, email) values ('nb-c1', 'a@team.com'); raise exception 'FAIL team';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise warning 'ok  no sharing with the team'; end $$;
insert into public.sermons (id, data, updated_at) values ('p1', '{}', 1);
select 'c1 own pages', count(*) from public.sermons;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', 'a@team.com');
select 'a people', string_agg(email, ',') from public.team_people();
select 'a sees c1 pages', count(*) from public.sermons;
insert into public.shared_nbs (id, data) values ('nb-a', '{}');
insert into public.shared_members (nb_id, email) values ('nb-a', 'b@team.com');
do $$ begin insert into public.shared_members (nb_id, email) values ('nb-a', 'c1@x.com'); raise exception 'FAIL team to church';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise warning 'ok  team does not share with church users'; end $$;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c3', 'c3@y.com');
select 'c3 people', string_agg(email, ',') from public.team_people();
select 'c3 reads nb-c1', count(*) from public.shared_nbs where id = 'nb-c1';
reset role;
