# ระบบคำนวณค่าคอมมิชชั่นการตลาด (KN)

หจก.สามทองบริการ / เค.ซี.คอร์ปอเรชั่น สาขาสามทอง/โลจิสติกส์

Next.js (App Router) + Supabase (Postgres/Auth/Storage), deployed on Vercel. Built from
`# สเปคระบบคำนวณค่าคอมมิชชั่นการตลาด_V2.txt` — all section references (`§4.3`, `§8`, ...)
in code comments point back to that spec.

## ⚠️ ระบบ login ถูกถอดออกชั่วคราว

ตอนนี้เว็บนี้**ไม่มีหน้า login และไม่บังคับ auth** — ใครก็ตามที่มี anon key เข้าอ่าน/แก้ทุกตารางได้
(ดูรายละเอียดใน `supabase/migrations/0001_init.sql`: RLS ปิดอยู่ตั้งใจ, ไม่ได้ลืม) โค้ด/schema
สำหรับ auth (Supabase Auth + `profiles` table + `auth_branch()`/`auth_is_manager()` helper
functions) ยังอยู่ครบ แค่ไม่ได้ผูกใช้งาน — พร้อมเปิดกลับได้ทีหลังโดยไม่ต้องแก้ schema ใหม่
**ห้ามใช้กับข้อมูลลูกค้า/การเงินจริงจนกว่าจะเปิด RLS กลับ**

หน้า Review/ArMatchList ตอนนี้ใช้ช่อง "ชื่อผู้แก้ไข" (เก็บใน localStorage ของเบราว์เซอร์ ไม่ใช่ auth
จริง) แทน email ผู้ใช้ สำหรับบันทึกลง `adjustments.actor`

## ⚠️ ก่อนใช้งานจริง — อ่านก่อน

**Parser ยังไม่ได้ทดสอบกับ PDF จริง.** ตอนสร้างโค้ดชุดนี้ไม่มีไฟล์ PDF ตัวอย่างแนบมาด้วย
มีเพียงตัวอย่างบรรทัด/รูปแบบที่ยกมาในสเปค (§3.2–§3.6) เท่านั้น `src/lib/parser/salesReport.ts`,
`arReport.ts`, และ `distanceMaster.ts` มีคอมเมนต์ระบุ **ASSUMPTION** ไว้ทุกจุดที่เป็นการเดารูปแบบ
คอลัมน์จากคำอธิบายในสเปค ไม่ใช่จากไฟล์จริง — สิ่งที่ต้องทำก่อน production:

1. อัปโหลดไฟล์ PDF จริง (รายงานขาย/ลูกหนี้/master ระยะทาง) ผ่านหน้า Upload
2. ถ้า checksum ไม่ผ่าน (spec §3.6 ออกแบบให้ fail-closed เสมอ ไม่ปล่อยผ่านเงียบๆ) ให้ดู
   `warnings`/`issues` ที่ระบบแสดง แล้วเทียบกับข้อความจริงในไฟล์ PDF (เปิดด้วย `pdftotext -layout`
   เพื่อดู raw text) แล้วปรับ regex ใน parser ให้ตรง
3. รัน `npm test` ซ้ำหลังแก้ — ชุดเทสมีอยู่แล้วสำหรับ normalize/checksum/calc engine/AR match
   ที่ตรงกับตัวเลขอ้างอิงเดือน 8/2569 ใน spec §8 ทุกตัว (ไม่ต้องแก้ ใช้ตรวจ regression ได้เลย)

โค้ดส่วนที่ **ไม่ต้องกังวล** (ตรวจกับตัวเลขสเปคแล้ว ผ่านหมด): `src/lib/calc/*` (สูตร L–R,
ตารางค่าขนส่ง, ขั้นบันไดค่าคอม, กฎปัดเศษ/แบ่งทีม) และ `src/lib/arMatch.ts` — เขียนตาม spec §4.3–§4.6
แบบตรงตัวและมี unit test ครบ

## Tech stack

| ชั้น | เทคโนโลยี |
|---|---|
| Frontend + API | Next.js 14 (App Router), TypeScript, Tailwind |
| Database + Auth + Storage | Supabase |
| PDF → text | `pdf-parse` (pure JS, ไม่ต้องพึ่ง poppler บน Vercel) |
| Excel master (ทางเลือก) | `exceljs` แปลง .xlsx → text ก่อนเข้า parser เดียวกัน |
| Export Excel | `exceljs` — L–R เขียนเป็นสูตร Excel จริง ไม่ใช่ค่าคงที่ |
| เลขการเงิน | `decimal.js` ทุกจุด (ห้าม float ธรรมดา) |
| Test | `vitest` |

## โครงสร้างโปรเจกต์

```
src/lib/parser/      -- PDF/text → JSON (normalize, sales/AR/distance-master parsers, checksum)
src/lib/calc/         -- สูตร L-R, ตารางค่าขนส่ง, ขั้นบันไดค่าคอม, ปัดเศษ, แบ่งทีม
src/lib/arMatch.ts    -- match ลูกหนี้ค้างชำระ (spec §5.3)
src/lib/excelExport.ts -- export 4 ชีตตาม spec §7
src/lib/supabase/     -- Supabase client (browser/server/service-role) + DB types
src/app/              -- Next.js pages: /periods, /periods/[id]/{upload,review,summary}, /settings/*
src/app/api/periods/[id]/{parse,calculate,close,export}/route.ts -- backend API
supabase/migrations/0001_init.sql -- schema + seed data (spec §6) — RLS/auth wired but OFF for now
tests/                -- vitest, ตรงกับตัวเลขอ้างอิง spec §3.6 และ §8
```

## Setup

### 1. Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com)
2. เปิด SQL editor → รัน `supabase/migrations/0001_init.sql` ทั้งไฟล์ (สร้างตาราง + seed
   ข้อมูลเริ่มต้น: departments, freight_tiers, products, commission_config — RLS ปิดอยู่ตั้งใจ
   เพราะยังไม่มี login ดูหัวข้อ "ระบบ login ถูกถอดออกชั่วคราว" ด้านบน)
3. Project Settings → API → คัดลอก Project URL, `anon` key, `service_role` key
   (ไม่ต้องสร้างผู้ใช้ Authentication ตอนนี้ เพราะเว็บยังไม่บังคับ login)

### 2. Environment variables

คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่าจากข้อ 1.5:

```bash
cp .env.example .env.local
```

### 3. ติดตั้งและรันในเครื่อง

```bash
npm install
npm test        # ต้องผ่านทั้งหมด (70 tests)
npm run build   # ตรวจ TypeScript + build production
npm run dev     # http://localhost:3000
```

### 4. Deploy

1. Push repo นี้ขึ้น GitHub (`git remote add origin ... && git push -u origin main`)
2. Import โปรเจกต์เข้า [Vercel](https://vercel.com/new) จาก GitHub repo
3. ใส่ environment variables 3 ตัวเดียวกับ `.env.local` ใน Vercel project settings
4. Deploy — ทุก push ขึ้น `main` จะ auto-deploy ตาม spec §9

## ขั้นตอนใช้งาน (spec §1)

```
Upload  → ลากไฟล์ PDF รายงานขาย/ลูกหนี้/master ระยะทาง เข้าหน้า /periods/[id]/upload
Parse   → ระบบ checksum อัตโนมัติ (spec §3.6) — ไม่ตรง = หยุด ไม่คำนวณต่อ
Calc    → กดปุ่ม "คำนวณค่าคอม" คำนวณ L-R ด้วยโค้ดล้วน (spec §4.3)
Review  → หน้า /periods/[id]/review — เคลียร์ทุกแถวที่ blocked/flagged ก่อนปิดรอบได้ (spec §5)
Close   → หน้า /periods/[id]/summary — Export Excel แล้วกด "ปิดรอบ" (ระบบปฏิเสธถ้ายังมีแถว blocked)
```

## Known gaps / simplifications (จงใจตัดออกจาก scope รอบนี้ — ดู plan)

- **ไม่มี login, RLS ปิดอยู่** — ดูหัวข้อ "ระบบ login ถูกถอดออกชั่วคราว" ด้านบน (สำคัญที่สุดถ้าจะใช้กับข้อมูลจริง)
- **Parser ยังไม่ validate กับ PDF จริง** — ดูหัวข้อ "ก่อนใช้งานจริง" ด้านบน
- Excel master file (.xlsx) รองรับแบบ basic (อ่านชีตแรก แปลงเป็น pseudo-text) — ถ้า layout ซับซ้อน
  อาจต้องปรับ `src/lib/parser/xlsxExtract.ts`
- Q ติดลบ (negative-Q penalty, spec §4.3) ต้อง "รอบัญชียืนยันก่อนปิดรอบ" ตามสเปค — ระบบตอนนี้แสดง
  flag ให้เห็นในหน้า Review แต่ยังไม่ block การปิดรอบด้วยเหตุผลนี้โดยเฉพาะ (block เฉพาะ
  ระยะทางหาย/เกิน 209 กม./แผนกไม่รู้จัก) — เพิ่ม per-row confirmation field ถ้าต้องการบังคับจริงจัง
  ก่อนปิดรอบ
  ให้ครบตามเจตนาของสเปค
- ไม่มี Storage upload ของไฟล์ PDF ต้นฉบับ (spec §6 บอกให้เก็บไว้ audit ย้อนหลัง) — ตอนนี้
  `source_files.storage_path` เป็นแค่ path string ที่ยังไม่ได้ upload ไฟล์จริงเข้า Supabase Storage
- Claude API สำหรับตรวจความผิดปกติ (เฟส 2 ตามสเปค) — ยังไม่ทำ ตามที่สเปคบอกว่าเป็นเฟสถัดไป
- หลายสาขา (เฟส 2) — schema เตรียม `branch` column ไว้แล้วทุกตาราง แต่ UI/config ยังทดสอบกับ
  สาขาเดียว (สามทอง/โลจิสติกส์) ตามสเปค

## Test coverage

`npm test` รัน 70 unit tests ครอบคลุม:

- `tests/parser/normalize.test.ts` — normalizeDocNo, baseDocNo, normalizeThai (spec §3.4–§3.5)
- `tests/parser/salesReport.test.ts` — parse + checksum end-to-end (synthetic fixture)
- `tests/parser/arReport.test.ts`, `distanceMaster.test.ts` — scaffold parsers
- `tests/calc/freightTable.test.ts` — ตารางค่าขนส่งครบทุกขั้น + BLOCK (spec §4.3)
- `tests/calc/commissionEngine.test.ts` — ตัวเลขอ้างอิง §8 ตรงเป๊ะ (44.1075, 63.81, penalty, ฯลฯ)
- `tests/calc/teamSplit.test.ts` — ปัดเศษ + แบ่งทีม ตรงกับตัวอย่างอ้อม 4,499.11 (spec §4.4, §8)
- `tests/arMatch.test.ts` — กฎ match ลูกหนี้ค้างชำระ 4 ข้อ (spec §5.3)
