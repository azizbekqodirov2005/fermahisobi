-- Yem turlari ro'yxati (katalog): har bir tur uchun joriy 1 kg narxi.
-- Yemish yozuvlari (feed_records) o'z narxini o'zida saqlaydi, shuning uchun bu yerdagi narxni
-- o'zgartirish eski yozuvlar va hisobotlarni o'zgartirmaydi.
create table if not exists feed_types (
  id            bigint generated always as identity primary key,
  name          text not null check (length(btrim(name)) between 1 and 60),
  price_per_kg  numeric(12,2) not null default 0 check (price_per_kg >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists feed_types_name_unique on feed_types (lower(btrim(name)));

drop trigger if exists feed_types_updated on feed_types;
create trigger feed_types_updated before update on feed_types for each row execute function set_updated_at();

-- Bazaga faqat server orqali kiriladi (siyosatlar yo'q = ochiq API orqali kirish yo'q).
alter table feed_types enable row level security;
