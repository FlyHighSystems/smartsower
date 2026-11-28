-- ============================================================
-- SmartSower — banco de dados no Supabase
-- Cole tudo no SQL Editor do seu projeto e clique em "Run".
-- Pode rodar de novo sem problema (o script é idempotente).
-- ============================================================

-- Relógio do servidor em milissegundos (usado como cursor de sincronização)
create or replace function public.ss_now_ms() returns bigint
language sql stable as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.ss_touch() returns trigger
language plpgsql as $$
begin
  new.server_updated := public.ss_now_ms();
  return new;
end $$;

-- Ministrações (uma linha por ministração; o conteúdo vai em JSON)
create table if not exists public.sermons (
  user_id        uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  id             text    not null,
  data           jsonb   not null default '{}'::jsonb,
  updated_at     bigint  not null,              -- quando foi editada (relógio do aparelho)
  deleted        boolean not null default false, -- exclusões também sincronizam
  server_updated bigint  not null default public.ss_now_ms(),
  primary key (user_id, id)
);
create index if not exists sermons_sync_idx on public.sermons (user_id, server_updated, id);
drop trigger if exists sermons_touch on public.sermons;
create trigger sermons_touch before insert or update on public.sermons
  for each row execute function public.ss_touch();

-- Cadernos, seções e tipos de bloco do usuário
create table if not exists public.user_meta (
  user_id        uuid   primary key default auth.uid() references auth.users(id) on delete cascade,
  data           jsonb  not null default '{}'::jsonb,
  updated_at     bigint not null,
  server_updated bigint not null default public.ss_now_ms()
);
drop trigger if exists user_meta_touch on public.user_meta;
create trigger user_meta_touch before insert or update on public.user_meta
  for each row execute function public.ss_touch();

-- Segurança: cada usuário só enxerga e altera os próprios dados
alter table public.sermons   enable row level security;
alter table public.user_meta enable row level security;

drop policy if exists "sermons_own" on public.sermons;
create policy "sermons_own" on public.sermons
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "meta_own" on public.user_meta;
create policy "meta_own" on public.user_meta
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Imagens das ministrações (arquivos privados, uma pasta por usuário)
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

drop policy if exists "images_own_select" on storage.objects;
create policy "images_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_own_insert" on storage.objects;
create policy "images_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_own_update" on storage.objects;
create policy "images_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_own_delete" on storage.objects;
create policy "images_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Links de leitura (compartilhar uma ministração só para ler)
-- ============================================================
create table if not exists public.shares (
  id          text primary key,                 -- código aleatório do link
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sermon_id   text not null,
  data        jsonb not null,                   -- cópia do conteúdo no momento da publicação
  allow_copy  boolean not null default false,
  revoked     boolean not null default false,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.shares enable row level security;
drop policy if exists "shares_own" on public.shares;
create policy "shares_own" on public.shares
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Leitura pública só por quem tem o código (não permite listar os links)
create or replace function public.get_share(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('data', data, 'allow_copy', allow_copy, 'updated_at', updated_at)
  from public.shares
  where id = p_id and not revoked and (expires_at is null or expires_at > now())
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;

-- ============================================================
-- Equipe: só e-mails cadastrados aqui podem criar conta e usar o app
-- (quem já tinha conta quando este trecho rodou pela 1ª vez vira administrador)
-- ============================================================
create table if not exists public.team_members (
  email      text primary key check (email = lower(email)),
  name       text not null default '',
  role       text not null default 'member' check (role in ('admin', 'member')),
  added_by   uuid default auth.uid(),
  created_at timestamptz not null default now()
);
insert into public.team_members (email, name, role)
  select lower(u.email), coalesce(u.raw_user_meta_data->>'full_name', ''), 'admin'
  from auth.users u
  where u.email is not null and not exists (select 1 from public.team_members)
on conflict (email) do nothing;

-- Quem entra pelo Church2all (contas criadas pelo Church2all, ligadas a uma igreja). Não faz parte da equipe:
-- usa os próprios cadernos e, no compartilhamento, só enxerga gente da mesma igreja. Escrito só pelo Church2all.
create table if not exists public.c2a_links (
  user_id      uuid not null references auth.users(id) on delete cascade,
  church_id    uuid not null,
  church_name  text not null default '',
  church_slug  text not null default '',
  role         text not null default '',
  name         text not null default '',
  linked_at    timestamptz not null default now(),
  primary key (user_id, church_id)
);
alter table public.c2a_links enable row level security;
drop policy if exists "c2a_own" on public.c2a_links;
create policy "c2a_own" on public.c2a_links for select to authenticated using (user_id = auth.uid());
grant select on public.c2a_links to authenticated;

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = lower(auth.jwt()->>'email'))
$$;
-- Pode usar o app: a equipe de sempre, ou quem veio do Church2all
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team() or exists (select 1 from public.c2a_links where user_id = auth.uid())
$$;
-- Duas pessoas estão no mesmo "mundo": as duas na equipe, ou as duas ligadas a uma mesma igreja do Church2all
create or replace function public.same_world(a uuid, b_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select (exists (select 1 from auth.users u join public.team_members t on t.email = lower(u.email) where u.id = a)
          and exists (select 1 from public.team_members t where t.email = lower(b_email)))
      or exists (select 1 from public.c2a_links x join public.c2a_links y on y.church_id = x.church_id
                 join auth.users u on u.id = y.user_id where x.user_id = a and lower(u.email) = lower(b_email))
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = lower(auth.jwt()->>'email') and role = 'admin')
$$;

alter table public.team_members enable row level security;
drop policy if exists "team_read" on public.team_members;
create policy "team_read" on public.team_members for select to authenticated
  using (public.is_admin() or email = lower(auth.jwt()->>'email'));
drop policy if exists "team_admin_write" on public.team_members;
create policy "team_admin_write" on public.team_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Nunca deixar a equipe sem administrador
create or replace function public.team_keep_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_members where role = 'admin') then
    raise exception 'A equipe precisa de pelo menos um administrador.';
  end if;
  return null;
end $$;
drop trigger if exists team_keep_admin on public.team_members;
create trigger team_keep_admin after update or delete on public.team_members
  for each statement execute function public.team_keep_admin();

-- Lista para o administrador (mostra quem já fez o primeiro acesso)
create or replace function public.team_list() returns table (email text, name text, role text, created_at timestamptz, registered boolean, last_sign_in timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores.'; end if;
  return query
    select t.email, t.name, t.role, t.created_at, (u.id is not null), u.last_sign_in_at
    from public.team_members t left join auth.users u on lower(u.email) = t.email
    order by t.role, t.name, t.email;
end $$;
revoke all on function public.team_list() from public;
grant execute on function public.team_list() to authenticated;

-- Entrada pelo Church2all: o servidor do Church2all (chave de serviço) avisa o e-mail aqui logo antes de criar a conta,
-- porque o Supabase só grava o app_metadata depois do insert (o guarda abaixo não o vê). Ninguém mais lê nem escreve.
create table if not exists public.c2a_pending (
  email text primary key,
  at    timestamptz not null default now()
);
alter table public.c2a_pending enable row level security;
revoke all on public.c2a_pending from anon, authenticated;

-- Bloqueia a criação de conta (senha, link por e-mail ou Google) de quem não está na equipe
create or replace function public.team_signup_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- contas criadas pelo Church2all (com a chave de serviço, que só o servidor tem) passam
  if coalesce(new.raw_app_meta_data->>'c2a', '') = 'true' then return new; end if;
  if new.email is not null and exists (select 1 from public.c2a_pending
       where email = lower(new.email) and at > now() - interval '10 minutes') then return new; end if;
  if new.email is null or not exists (select 1 from public.team_members where email = lower(new.email)) then
    raise exception 'SS_NOT_INVITED: e-mail não cadastrado na equipe';
  end if;
  return new;
end $$;
drop trigger if exists team_signup_guard on auth.users;
create trigger team_signup_guard before insert on auth.users
  for each row execute function public.team_signup_guard();

-- Quem sai da equipe perde o acesso aos dados na hora (mesmo já tendo conta)
drop policy if exists "sermons_own" on public.sermons;
create policy "sermons_own" on public.sermons for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
drop policy if exists "meta_own" on public.user_meta;
create policy "meta_own" on public.user_meta for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
drop policy if exists "shares_own" on public.shares;
create policy "shares_own" on public.shares for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
drop policy if exists "images_own_select" on storage.objects;
create policy "images_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
drop policy if exists "images_own_insert" on storage.objects;
create policy "images_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
drop policy if exists "images_own_update" on storage.objects;
create policy "images_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
drop policy if exists "images_own_delete" on storage.objects;
create policy "images_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());

-- Conferência: deve listar o seu e-mail como admin
select email, role from public.team_members;

-- ============================================================
-- Cadernos compartilhados (dono escolhe as pessoas da equipe;
-- cada página define "só leitura" ou "colaboração")
-- ============================================================
create table if not exists public.shared_nbs (
  id             text   primary key,
  owner          uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  data           jsonb  not null default '{}'::jsonb,   -- nome, cor, seções, padrão das páginas
  updated_at     bigint not null default public.ss_now_ms(),
  deleted        boolean not null default false,
  server_updated bigint not null default public.ss_now_ms()
);
drop trigger if exists shared_nbs_touch on public.shared_nbs;
create trigger shared_nbs_touch before insert or update on public.shared_nbs
  for each row execute function public.ss_touch();

create table if not exists public.shared_members (
  nb_id  text not null references public.shared_nbs(id) on delete cascade,
  email  text not null check (email = lower(email)),
  primary key (nb_id, email)
);

alter table public.sermons add column if not exists shared_nb text;
create index if not exists sermons_shared_idx on public.sermons (shared_nb, server_updated);

create or replace function public.nb_owner(nb text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_nbs n where n.id = nb and n.owner = auth.uid() and not n.deleted)
$$;
create or replace function public.nb_can_read(nb text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (
    select 1 from public.shared_nbs n where n.id = nb and not n.deleted and (
      n.owner = auth.uid() or exists (select 1 from public.shared_members m where m.nb_id = n.id and m.email = lower(auth.jwt()->>'email'))))
$$;

alter table public.shared_nbs enable row level security;
drop policy if exists "snb_read" on public.shared_nbs;
create policy "snb_read" on public.shared_nbs for select to authenticated
  using (owner = auth.uid() or public.nb_can_read(id));
drop policy if exists "snb_owner_ins" on public.shared_nbs;
create policy "snb_owner_ins" on public.shared_nbs for insert to authenticated
  with check (owner = auth.uid() and public.is_member());
drop policy if exists "snb_owner_upd" on public.shared_nbs;
create policy "snb_owner_upd" on public.shared_nbs for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "snb_owner_del" on public.shared_nbs;
create policy "snb_owner_del" on public.shared_nbs for delete to authenticated using (owner = auth.uid());

alter table public.shared_members enable row level security;
drop policy if exists "smem_read" on public.shared_members;
create policy "smem_read" on public.shared_members for select to authenticated
  using (public.nb_owner(nb_id) or email = lower(auth.jwt()->>'email'));
drop policy if exists "smem_owner_write" on public.shared_members;
create policy "smem_owner_write" on public.shared_members for all to authenticated
  using (public.nb_owner(nb_id)) with check (public.nb_owner(nb_id));
drop policy if exists "smem_self_leave" on public.shared_members;
create policy "smem_self_leave" on public.shared_members for delete to authenticated
  using (email = lower(auth.jwt()->>'email'));

-- Páginas: o autor faz tudo; quem participa do caderno lê; edita só páginas abertas para colaboração
-- (e não pode excluir nem fechar a página de outra pessoa); o dono do caderno pode tudo nas páginas dele.
drop policy if exists "sermons_own" on public.sermons;
drop policy if exists "sermons_read" on public.sermons;
create policy "sermons_read" on public.sermons for select to authenticated
  using ((user_id = auth.uid() and public.is_member()) or (shared_nb is not null and public.nb_can_read(shared_nb)));
drop policy if exists "sermons_ins" on public.sermons;
create policy "sermons_ins" on public.sermons for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and (shared_nb is null or public.nb_can_read(shared_nb)));
drop policy if exists "sermons_upd" on public.sermons;
create policy "sermons_upd" on public.sermons for update to authenticated
  using ((user_id = auth.uid() and public.is_member())
      or (shared_nb is not null and public.nb_owner(shared_nb))
      or (shared_nb is not null and public.nb_can_read(shared_nb) and data->>'shareMode' = 'edit'))
  with check ((user_id = auth.uid() and public.is_member() and (shared_nb is null or public.nb_can_read(shared_nb)))
      or (shared_nb is not null and public.nb_owner(shared_nb))
      or (shared_nb is not null and public.nb_can_read(shared_nb) and data->>'shareMode' = 'edit' and not deleted));
drop policy if exists "sermons_del" on public.sermons;
create policy "sermons_del" on public.sermons for delete to authenticated using (user_id = auth.uid());

-- Diretório da equipe (nome e e-mail) para escolher com quem compartilhar
create or replace function public.team_people() returns table (email text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'Apenas membros da equipe.'; end if;
  -- a equipe vê a equipe; quem veio do Church2all vê as pessoas da(s) própria(s) igreja(s)
  return query
    select x.email, x.name from (
      select t.email, t.name from public.team_members t where public.is_team()
      union
      select lower(u.email), coalesce(nullif(y.name, ''), split_part(u.email, '@', 1))
      from public.c2a_links me join public.c2a_links y on y.church_id = me.church_id join auth.users u on u.id = y.user_id
      where me.user_id = auth.uid() and u.email is not null
    ) x order by x.name, x.email;
end $$;
revoke all on function public.team_people() from public;
grant execute on function public.team_people() to authenticated;

-- Imagens: quem é da equipe consegue abrir as imagens das páginas compartilhadas
-- (os nomes dos arquivos são códigos impossíveis de adivinhar)
drop policy if exists "images_own_select" on storage.objects;
create policy "images_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (public.is_team()
    or (storage.foldername(objects.name))[1] = auth.uid()::text
    or exists (select 1 from public.c2a_links x join public.c2a_links y on y.church_id = x.church_id
               where x.user_id = auth.uid() and y.user_id::text = (storage.foldername(objects.name))[1])));

-- ============================================================
-- Church2all: compartilhar só dentro do mesmo "mundo" (equipe com equipe,
-- igreja com a mesma igreja). Nada muda para a equipe de sempre.
-- ============================================================
create or replace function public.shared_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner into v_owner from public.shared_nbs where id = new.nb_id;
  if v_owner is not null and new.email <> lower(coalesce((select email from auth.users where id = v_owner), ''))
     and not public.same_world(v_owner, new.email) then
    raise exception 'SS_OTHER_CHURCH: só dá para compartilhar com pessoas da sua equipe ou da sua igreja';
  end if;
  return new;
end $$;
drop trigger if exists shared_members_guard on public.shared_members;
create trigger shared_members_guard before insert or update on public.shared_members
  for each row execute function public.shared_members_guard();
