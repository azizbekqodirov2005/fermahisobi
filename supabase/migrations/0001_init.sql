-- Ferma: chorvachilik boshqaruv tizimi — PostgreSQL sxemasi
-- Supabase (PostgreSQL) va mahalliy PGlite uchun bir xil ishlaydi.

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------- animals
create table animals (
  id               bigint generated always as identity primary key,
  tag_number       text not null,
  name             text not null,
  birth_date       date,
  age_years        integer check (age_years between 0 and 40),
  age_months       integer check (age_months between 0 and 11),
  age_recorded_on  date,
  daily_feed_kg    numeric(8,2) not null default 0 check (daily_feed_kg >= 0 and daily_feed_kg <= 500),
  notes            text,
  status           text not null default 'active' check (status in ('active', 'inactive')),
  date_added       date not null default current_date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint animals_tag_not_blank  check (char_length(btrim(tag_number)) > 0),
  constraint animals_name_not_blank check (char_length(btrim(name)) > 0),
  constraint animals_age_source     check (birth_date is not null or age_years is not null or age_months is not null)
);
create unique index animals_tag_unique on animals (lower(btrim(tag_number)));
create index animals_status_idx on animals (status);

-- ---------------------------------------------------------- milk_records
-- Bir mol uchun bir kunda bitta qator: ertalab + kechqurun + qo'shimcha sog'im.
-- unique(animal_id, record_date) takroriy kiritishni bazaning o'zi to'sadi.
create table milk_records (
  id           bigint generated always as identity primary key,
  animal_id    bigint not null references animals(id) on delete restrict,
  record_date  date not null,
  morning_l    numeric(8,2) not null default 0 check (morning_l >= 0 and morning_l <= 200),
  evening_l    numeric(8,2) not null default 0 check (evening_l >= 0 and evening_l <= 200),
  extra_l      numeric(8,2) not null default 0 check (extra_l >= 0 and extra_l <= 200),
  total_l      numeric(9,2) generated always as (morning_l + evening_l + extra_l) stored,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint milk_records_one_per_day unique (animal_id, record_date)
);
create index milk_records_date_idx on milk_records (record_date);

-- ---------------------------------------------------------- feed_records
-- Guruhli kiritish ham har bir mol uchun alohida qator bo'lib saqlanadi (batch_id bilan bog'lanadi),
-- shuning uchun individual va guruhli yozuvlar ikki marta hisoblanmaydi.
-- Narx yozuvning o'zida saqlanadi — keyingi narx o'zgarishi tarixni buzmaydi.
create table feed_records (
  id            bigint generated always as identity primary key,
  animal_id     bigint not null references animals(id) on delete restrict,
  record_date   date not null,
  feed_type     text not null default '',
  quantity_kg   numeric(9,2) not null check (quantity_kg >= 0 and quantity_kg <= 5000),
  price_per_kg  numeric(12,2) not null check (price_per_kg >= 0),
  total_cost    numeric(16,2) generated always as (round(quantity_kg * price_per_kg, 2)) stored,
  batch_id      uuid,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index feed_records_unique_per_day on feed_records (animal_id, record_date, lower(feed_type));
create index feed_records_date_idx on feed_records (record_date);

-- ------------------------------------------------------------ milk_sales
create table milk_sales (
  id             bigint generated always as identity primary key,
  sale_date      date not null,
  quantity_l     numeric(10,2) not null check (quantity_l > 0 and quantity_l <= 100000),
  price_per_l    numeric(12,2) not null check (price_per_l >= 0),
  total_revenue  numeric(16,2) generated always as (round(quantity_l * price_per_l, 2)) stored,
  customer_name  text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index milk_sales_date_idx on milk_sales (sale_date);

-- --------------------------------------------------------- farm_expenses
create table farm_expenses (
  id            bigint generated always as identity primary key,
  expense_date  date not null,
  category      text not null check (char_length(btrim(category)) > 0),
  amount        numeric(16,2) not null check (amount >= 0),
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index farm_expenses_date_idx on farm_expenses (expense_date);

-- ----------------------------------------------------------- farm_settings
create table farm_settings (
  id              smallint primary key default 1 check (id = 1),
  farm_name       text not null default 'Mening fermam',
  currency_label  text not null default 'so''m' check (currency_label in ('so''m', 'UZS')),
  timezone        text not null default 'Asia/Tashkent',
  updated_at      timestamptz not null default now()
);
insert into farm_settings (id) values (1);

-- ------------------------------------------------------------ price_history
-- Narxlar tarixi: har bir sana uchun qaysi narx amalda bo'lganini aniqlash uchun.
create table price_history (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('milk', 'feed')),
  price           numeric(12,2) not null check (price >= 0),
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  constraint price_history_unique unique (kind, effective_from)
);
insert into price_history (kind, price, effective_from) values ('milk', 0, '2000-01-01'), ('feed', 0, '2000-01-01');

-- --------------------------------------------------------- updated_at triggers
create trigger animals_updated        before update on animals        for each row execute function set_updated_at();
create trigger milk_records_updated   before update on milk_records   for each row execute function set_updated_at();
create trigger feed_records_updated   before update on feed_records   for each row execute function set_updated_at();
create trigger milk_sales_updated     before update on milk_sales     for each row execute function set_updated_at();
create trigger farm_expenses_updated  before update on farm_expenses  for each row execute function set_updated_at();
create trigger farm_settings_updated  before update on farm_settings  for each row execute function set_updated_at();

-- ------------------------------------------------------------- xavfsizlik
-- Supabase'da jadvallarga to'g'ridan-to'g'ri (anon/authenticated kalitlari bilan) kirishni yopamiz.
-- Ilova bazaga faqat server orqali (DATABASE_URL) ulanadi; RLS siyosatlari yo'q = ochiq API orqali kirish yo'q.
alter table animals        enable row level security;
alter table milk_records   enable row level security;
alter table feed_records   enable row level security;
alter table milk_sales     enable row level security;
alter table farm_expenses  enable row level security;
alter table farm_settings  enable row level security;
alter table price_history  enable row level security;
