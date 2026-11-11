# Mening fermam — chorvachilik (qoramol) boshqaruv ilovasi

To‘liq o‘zbek tilidagi (lotin) veb-ilova: mollar, kunlik sut, yemish sarfi, sut sotuvlari, qo‘shimcha xarajatlar, narxlar tarixi va hisobotlar (sut statistikasi + moliyaviy hisobot, CSV eksport).

- **Frontend:** React 19 + TypeScript + Tailwind CSS, React Query, react-hook-form + zod, Recharts
- **Backend:** Node.js (Express) + PostgreSQL. Brauzer bazaga to‘g‘ridan-to‘g‘ri ulanmaydi, maxfiy kalitlar frontendga chiqmaydi.
- **Baza:** Supabase (PostgreSQL) **yoki** mahalliy rejim (PGlite — haqiqiy PostgreSQL, diskdagi papkada saqlanadi).
- **Pul / birliklar:** so‘m (UZS), litr (L), kilogramm (kg). Hafta — dushanbadan yakshanbagacha. Vaqt zonasi: `Asia/Tashkent` (sozlamalarda).

> **Holat:** ilova mahalliy ishga tushirilib sinovdan o‘tkazilgan. **Internetga joylashtirilmagan (deploy qilinmagan)** — buni quyidagi ko‘rsatma bo‘yicha o‘zingiz qilasiz.

## Yemish: yem turlari va narxlari

- **Yemish hisobi → “Yem turlari va narxlari”**: har bir yem turi (Silos, Pichan, Omixta yem…) uchun 1 kg narxini yozib qo‘yasiz.
- **Yemish kiritish**: mollarni tanlaysiz, so‘ng bir nechta yem turini qo‘shasiz — har biri uchun *har bir molga necha kg* va *1 kg narxi*. Jami = kg × narx (masalan, Silos 18 kg × 500 = 9 000 so‘m). Narx katalogdan o‘zi chiqadi, kerak bo‘lsa o‘zgartirasiz.
- Yozuv o‘z narxini o‘zida saqlaydi: katalogdagi narxni keyin o‘zgartirsangiz, eski yozuvlar va hisobotlar o‘zgarmaydi.
- Yemish sahifasida tanlangan davr uchun **yem turlari bo‘yicha** jadval va grafik (kg, o‘rtacha narx, xarajat) bor.
- **Sut narxi**: Sut hisobi sahifasi tepasida ko‘rinadi va u yerning o‘zida yozish/o‘zgartirish mumkin (sanasi bilan; eski sanalar o‘zgarmaydi). Sut yozuvi kiritilganda taxminiy daromad ko‘rsatiladi.
- Yangi jadval (`supabase/migrations/0002_feed_types.sql`) Netlify Function ishga tushganda bazaga o‘zi qo‘llanadi (qayta ishga tushirsa ham xato bermaydi). Boshqa joyda (o‘z serveringiz) ishlatsangiz, server o‘zi migratsiyani qo‘llaydi.

## 1. Tez ishga tushirish (mahalliy rejim)

Kerak: Node.js 20+.

```bash
npm install
cp .env.example .env        # ixtiyoriy; Windows: copy .env.example .env
npm run dev                 # API :3001, ilova http://localhost:5173
```

`DATABASE_URL` berilmasa ilova **mahalliy rejimda** ishlaydi: ma’lumotlar `./data/pglite` papkasida **diskda** saqlanadi (sahifani yangilash va serverni qayta ishga tushirish ma’lumotni yo‘qotmaydi). Cheklov: ma’lumot faqat shu kompyuter/server diskida turadi, boshqa qurilmadan ko‘rinmaydi va zaxira nusxasi sizning ishingiz. Bir nechta qurilmadan foydalanish uchun Supabase’ga ulaning (2-bo‘lim). Brauzerning localStorage’i ma’lumot saqlash uchun **ishlatilmaydi**.

Production ko‘rinishida (bitta jarayon, ilova serverdan beriladi):

```bash
npm run build
APP_PASSWORD=... SESSION_SECRET=... npm start      # http://localhost:3001
```

## 2. Supabase (PostgreSQL) ulash

1. [supabase.com](https://supabase.com) da loyiha yarating.
2. **Project Settings → Database → Connection string (URI)** dan qatorni oling (`DATABASE_URL`). Serverli hostinglar uchun *Session pooler* (5432) tavsiya etiladi.
3. `.env` (yoki hosting muhit o‘zgaruvchilari) ga yozing: `DATABASE_URL=postgresql://...`
4. Serverni ishga tushiring. **Migratsiyalar avtomatik qo‘llanadi** (`supabase/migrations/*.sql`, `schema_migrations` jadvalida kuzatiladi). Xohlasangiz `0001_init.sql` ni Supabase **SQL Editor**ida qo‘lda ham ishga tushirishingiz mumkin.
5. Jadvallarda RLS yoqilgan va policy yo‘q: `anon`/`authenticated` kalitlari bilan to‘g‘ridan-to‘g‘ri kirib bo‘lmaydi; bazaga faqat server (`DATABASE_URL`) orqali kiriladi. **`service_role` yoki bazaga oid parolni hech qachon frontend kodiga yoki Git’ga qo‘ymang.**

## 3. Muhit o‘zgaruvchilari (`.env.example`)

| O‘zgaruvchi | Tavsif |
|---|---|
| `PORT` | Server porti (standart 3001) |
| `APP_PASSWORD` | Ilovaga kirish paroli. `npm start`/`NODE_ENV=production` da **majburiy** (aks holda server ishga tushmaydi; `ALLOW_NO_AUTH=true` bilan o‘chirish mumkin, tavsiya etilmaydi) |
| `SESSION_SECRET` | Kirish tokenlarini imzolash kaliti (≥32 belgi). Bo‘lmasa har qayta ishga tushganda hamma qayta kiradi |
| `DATABASE_URL` | Supabase/PostgreSQL ulanish qatori. Bo‘sh bo‘lsa — mahalliy PGlite |
| `PGLITE_DIR` | Mahalliy rejimda ma’lumotlar papkasi (standart `./data/pglite`) |

Parol bitta umumiy (fermer uchun); noto‘g‘ri urinishlar ketma-ket ko‘payganda vaqtincha bloklanadi. Har bir xodim uchun alohida akkaunt kerak bo‘lsa — buni qo‘shish kerak (hozir yo‘q).

## 4. Internetga joylashtirish (deploy)

Ilova — oddiy Node serveri (ilova + API bitta jarayonda), shuning uchun Render, Railway, Fly.io yoki VPS mos keladi. Vercel/Netlify’ning faqat-statik rejimi mos **emas** (server kerak).

1. Kodni Git omboriga joylang (`.env` va `data/` `.gitignore` da).
2. Supabase’da baza yarating (2-bo‘lim) — hosting diski vaqtinchalik bo‘lishi mumkin, shuning uchun production’da mahalliy PGlite emas, **Supabase tavsiya etiladi**.
3. Hostingda yangi *Web Service* yarating (Docker: `Dockerfile` bor; yoki Build: `npm ci && npm run build`, Start: `npm start`).
4. Muhit o‘zgaruvchilarini kiriting: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, (`NODE_ENV=production`).
5. HTTPS hosting tomonidan beriladi. Birinchi ochilganda Narxlar va sozlamalar sahifasida sut/yemish narxini kiriting.


### Netlify + Netlify Database (tayyor sozlama)

Loyihada `netlify.toml`, `netlify/functions/api.mts` (API) va `netlify/database/migrations/` (sxema) bor. Netlify bazani va migratsiyani deploy paytida o‘zi yaratadi/qo‘llaydi.

1. Netlify’da `APP_PASSWORD` va `SESSION_SECRET` ni (Functions/Runtime scope) o‘rnating.
2. `npm i -g netlify-cli && netlify login && netlify link` (yoki `netlify init`), so‘ng `netlify deploy --prod`.
3. Eslatma: Netlify Database faqat Credit-based rejalarda mavjud.

## 5. Testlar

```bash
npm run typecheck     # TypeScript
npm test              # 62 ta avtomatik test (vitest)
npm run check         # typecheck + test + build
```

- `tests/dates.test.ts`, `tests/calc.test.ts` — hafta (du–ya, oy chegarasidan o‘tuvchi), oy, kunlik jami (ikki marta sanalmaslik), narx tarixi, taxminiy daromad, yemish xarajati, har bir mol bo‘yicha hisob, sut kamayishi.
- `tests/api.test.ts` — API integratsiya testlari (xotiradagi PostgreSQL): CRUD, dublikatlar (409), manfiy/noto‘g‘ri qiymatlar (422), tarixiy narxlar o‘zgarmasligi, tarixi bor molni o‘chirib bo‘lmasligi (faqat nofaol qilish), guruh yemish, hisobotlar.

### Brauzer testi (ixtiyoriy)

`tests/e2e/e2e.py` — Playwright (Python) bilan 61 ta tekshiruv (kirish, formalar, validatsiya, hisobotlar, sahifani yangilagandan keyin saqlanganlik, mobil ko‘rinishda gorizontal skroll yo‘qligi). **Bo‘sh bazada** ishlating:

```bash
pip install playwright && playwright install chromium
NODE_ENV=production APP_PASSWORD=sinov123 SESSION_SECRET=x PORT=3104 PGLITE_DIR=/tmp/ferma-e2e npm start &
BASE_URL=http://localhost:3104 APP_PASSWORD=sinov123 python3 tests/e2e/e2e.py
```

## 6. Hisoblash qoidalari

- **Kunlik sut** = ertalab + kechqurun + qo‘shimcha. Bir mol uchun bir kunda bitta yozuv (`unique(animal_id, record_date)`), ikki marta sanalmaydi.
- **Sotuv daromadi** = sotilgan litr × yozuvdagi narx (haqiqiy). **Taxminiy daromad** = ishlab chiqarilgan sut × o‘sha kunda amal qilgan narx — har doim «taxminiy» deb belgilanadi.
- **Yemish xarajati** = sarflangan kg × yozuvga saqlangan narx. Narx o‘zgarsa, eski yozuvlar o‘zgarmaydi (narxlar tarixi `price_history` da).
- **Sotuv daromadi − yemish xarajati** «sof foyda» deb atalmaydi; qo‘shimcha xarajatlar kiritilsa, alohida ayriladi.
- Sotuvlar molga bog‘lanmaydi, shuning uchun har bir mol bo‘yicha daromad faqat **taxminiy**.
- Yemish: guruh uchun kiritilganda har bir molga alohida yozuv yaratiladi (bir xil mol+sana+turdagi dublikat rad etiladi). Molning standart kunlik miqdorini o‘zgartirish tarixiy yozuvlarni o‘zgartirmaydi.
- Tarixi bor molni o‘chirib bo‘lmaydi — nofaol qilinadi; barcha tarixiy yozuvlar saqlanadi.

## 7. Loyiha tuzilmasi

```
shared/      umumiy zod sxemalar, sana va hisoblash (calc.ts), formatlash
server/      Express API, baza adapteri (PGlite/pg), migratsiya, autentifikatsiya
supabase/    SQL migratsiyalar
src/         React ilovasi (pages, components, lib)
tests/       vitest testlar + e2e/
```
