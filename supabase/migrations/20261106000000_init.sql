-- MailTasks schema: lists, tasks, user settings. Every row is owned by a user and protected by RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- lists
create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  color       text not null default '#6366f1',
  icon        text not null default 'list',
  position    double precision not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lists_user_idx on public.lists(user_id, position);

-- ---------------------------------------------------------------- tasks
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id            uuid references public.lists(id) on delete set null,
  title              text not null check (char_length(title) between 1 and 500),
  notes              text not null default '',
  status             text not null default 'todo' check (status in ('todo','in_progress','waiting','done')),
  priority           smallint not null default 0 check (priority between 0 and 4), -- 0 none,1 low,2 medium,3 high,4 urgent
  due_at             timestamptz,
  all_day            boolean not null default true,
  remind_at          timestamptz,
  recurrence         text check (recurrence in ('daily','weekdays','weekly','monthly','yearly')),
  tags               text[] not null default '{}',
  subtasks           jsonb not null default '[]'::jsonb,  -- [{id, title, done}]
  starred            boolean not null default false,
  position           double precision not null default 0,
  estimate_minutes   integer,
  source             text not null default 'manual' check (source in ('manual','gmail','mobile','import')),
  email_subject      text,
  email_from_name    text,
  email_from_address text,
  email_date         timestamptz,
  email_url          text,
  email_thread_id    text,
  email_snippet      text,
  ai_summary         text,
  completed_at       timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists tasks_user_idx    on public.tasks(user_id, status, due_at);
create index if not exists tasks_list_idx    on public.tasks(list_id);
create index if not exists tasks_thread_idx  on public.tasks(user_id, email_thread_id);
create index if not exists tasks_tags_idx    on public.tasks using gin(tags);

-- ---------------------------------------------------------------- settings
create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name     text,
  ai_provider      text not null default 'gemini' check (ai_provider in ('gemini','openai','anthropic','openai_compatible','none')),
  ai_api_key       text,
  ai_model         text,
  ai_base_url      text,
  default_list_id  uuid references public.lists(id) on delete set null,
  timezone         text default 'Asia/Kolkata',
  preferences      jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists lists_touch on public.lists;
create trigger lists_touch before update on public.lists for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.user_settings;
create trigger settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();

create or replace function public.tasks_before_write() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_before on public.tasks;
create trigger tasks_before before insert or update on public.tasks for each row execute function public.tasks_before_write();

-- When a recurring task is completed, create its next occurrence.
create or replace function public.tasks_spawn_recurrence() returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_due timestamptz;
  shift interval;
begin
  if new.recurrence is null or new.status <> 'done' or old.status = 'done' or new.deleted_at is not null then
    return new;
  end if;
  next_due := coalesce(new.due_at, now());
  if new.recurrence = 'daily' then
    next_due := next_due + interval '1 day';
  elsif new.recurrence = 'weekdays' then
    next_due := next_due + interval '1 day';
    while extract(isodow from next_due) > 5 loop next_due := next_due + interval '1 day'; end loop;
  elsif new.recurrence = 'weekly' then
    next_due := next_due + interval '1 week';
  elsif new.recurrence = 'monthly' then
    next_due := next_due + interval '1 month';
  else
    next_due := next_due + interval '1 year';
  end if;
  shift := next_due - coalesce(new.due_at, now());

  insert into public.tasks (user_id, list_id, title, notes, status, priority, due_at, all_day, remind_at, recurrence,
                            tags, subtasks, starred, position, estimate_minutes, source)
  values (new.user_id, new.list_id, new.title, new.notes, 'todo', new.priority, next_due, new.all_day,
          case when new.remind_at is null then null else new.remind_at + shift end, new.recurrence, new.tags,
          coalesce((select jsonb_agg(jsonb_set(s, '{done}', 'false'::jsonb)) from jsonb_array_elements(new.subtasks) s), '[]'::jsonb),
          new.starred, new.position, new.estimate_minutes, new.source);
  -- the completed instance no longer recurs
  update public.tasks set recurrence = null where id = new.id;
  return new;
end $$;

drop trigger if exists tasks_recur on public.tasks;
create trigger tasks_recur after update of status on public.tasks for each row execute function public.tasks_spawn_recurrence();

-- New users get settings and a few starter lists.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  inbox uuid;
begin
  insert into public.lists (user_id, name, color, icon, position) values (new.id, 'Inbox', '#6366f1', 'inbox', 0) returning id into inbox;
  insert into public.lists (user_id, name, color, icon, position) values
    (new.id, 'Work', '#0ea5e9', 'briefcase', 1),
    (new.id, 'Personal', '#22c55e', 'user', 2),
    (new.id, 'College', '#f59e0b', 'graduation-cap', 3);
  insert into public.user_settings (user_id, default_list_id, display_name)
    values (new.id, inbox, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
    on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "own lists" on public.lists;
create policy "own lists" on public.lists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.lists, public.tasks, public.user_settings to authenticated;

-- ---------------------------------------------------------------- realtime
do $$
begin
  begin alter publication supabase_realtime add table public.tasks; exception when others then null; end;
  begin alter publication supabase_realtime add table public.lists; exception when others then null; end;
end $$;
alter table public.tasks replica identity full;
