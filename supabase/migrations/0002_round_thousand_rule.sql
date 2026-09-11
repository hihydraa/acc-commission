-- Adds the "must be an exact multiple of 1,000 liters" qualifying rule
-- (marketing-commission-calc SKILL correction, ส.ค. 2569) as a per-department
-- flag rather than hardcoding it in application code, matching how
-- min_liters/fixed_freight are already modeled.
--
-- Full-truck delivery departments (A7/B7/68) are always dispatched in
-- round-thousand-liter increments, so this defaults to true for them.
-- กรอกหลังปั๊ม (B3) genuinely has fractional-liter qualifying lines (e.g.
-- 1,470.25 L, confirmed against real ส.ค. 2569 data and covered by
-- tests/calc/commissionEngine.test.ts), so it must stay false.

alter table departments
  add column if not exists require_round_thousand boolean not null default true;

update departments set require_round_thousand = false where code = 'B3';
