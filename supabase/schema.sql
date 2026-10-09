-- おうちクラウド: ミッションアプリ用テーブル（1家族=1アカウント=1行）
create table if not exists public.household_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.household_state enable row level security;

drop policy if exists "own row select" on public.household_state;
drop policy if exists "own row insert" on public.household_state;
drop policy if exists "own row update" on public.household_state;
drop policy if exists "own row delete" on public.household_state;

create policy "own row select" on public.household_state for select using (auth.uid() = user_id);
create policy "own row insert" on public.household_state for insert with check (auth.uid() = user_id);
create policy "own row update" on public.household_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.household_state for delete using (auth.uid() = user_id);

-- リアルタイム同期（親のスマホで承認 → 子のiPadに即反映）
alter publication supabase_realtime add table public.household_state;
