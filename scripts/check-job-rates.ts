#!/usr/bin/env node
/**
 * ตรวจ/แก้ income + driverWage ของงานให้ตรงกับเรตที่ตั้งไว้
 *
 *   npm run check-rates -- --m=2026-08 --validate   # ดูอย่างเดียว ไม่แก้
 *   npm run check-rates -- --m=2026-08 --execute    # แก้จริง
 *
 * เลือก DB ด้วย --env=.env.prod (ไม่ใส่ = ใช้ .env.local ที่ make ก็อปไว้)
 *
 * ใช้หลังยุบโรงงาน/ลูกค้าที่ซ้ำกัน เพราะงานที่ย้ายมาอาจอ้างเรตคนละตัวกับเดิม
 *
 * ต่างจาก POST /api/jobs/prefill-rates ตรงที่ตัวนั้นเติมเฉพาะช่องที่ยัง null
 * ส่วนตัวนี้แก้ค่าที่ไม่ตรงกับเรตด้วย (รวมงานที่ clearStatus=true)
 *
 * logic การคำนวณลอกมาจาก app/api/jobs/prefill-rates/route.ts ทุกบรรทัด:
 *   income     = rate_income.income + fuel surcharge ตามราคาน้ำมัน ณ วันที่งาน
 *   driverWage = rate_driver_wage.driverWage (towing ไม่ผูกกับโรงงาน)
 *
 * ข้าม jobType advance/noJob และงานที่ isCancelled — ไม่มีอัตราค่าขนส่ง
 */

import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// ---------------------------------------------------------------- args

const args = process.argv.slice(2);
const monthArg = args.find((a) => a.startsWith('--m='));
const month = monthArg ? monthArg.slice(4) : null;
const execute = args.includes('--execute');
const validate = args.includes('--validate');
const envArg = args.find((a) => a.startsWith('--env='));

// ---------------------------------------------------------------- env
//
// อ่าน .env เองเพราะรันนอก next (next โหลด .env.local ให้อัตโนมัติ แต่ tsx ไม่โหลด)
// ลำดับ: --env=xxx → .env.local (ตัวที่ make ก็อปมาให้) → .env
// DATABASE_URL ที่ตั้งมาจาก shell อยู่แล้วชนะทุกอย่าง (override: false)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = envArg
  ? resolve(root, envArg.slice(6))
  : ['.env.local', '.env'].map((f) => resolve(root, f)).find(existsSync);

if (envFile) {
  if (!existsSync(envFile)) {
    console.error(`\n  ไม่พบไฟล์ env: ${envFile}\n`);
    process.exit(1);
  }
  config({ path: envFile, quiet: true });
}

function usage(msg?: string): never {
  if (msg) console.error(`\n  ${msg}`);
  console.error(`
  ใช้งาน:
    npm run check-rates -- --m=YYYY-MM --validate    ดูอย่างเดียว ไม่แก้
    npm run check-rates -- --m=YYYY-MM --execute     แก้จริง

  เลือก DB:
    --env=.env.prod    ระบุไฟล์ env (ไม่ใส่ = ใช้ .env.local ที่ make ก็อปไว้)
`);
  process.exit(1);
}

if (!month || !/^\d{4}-\d{2}$/.test(month)) usage('ต้องระบุเดือน เช่น --m=2026-08');
if (execute && validate) usage('เลือกได้อย่างเดียว: --validate หรือ --execute');
if (!execute && !validate) usage('ต้องระบุ --validate หรือ --execute');

// ---------------------------------------------------------------- types

type Field = 'income' | 'driverWage';
type RateData = { income?: number; driverWage?: number };
type Fill = { field: Field; to: number };
type Fix = { field: Field; from: number; to: number };

/** งานที่ดึงมาตรวจ — ชนิดอิงจาก select ด้านล่างโดยตรง */
type Job = {
  id: string;
  jobNumber: string;
  jobDate: Date;
  jobType: string;
  size: string | null;
  factoryLocationId: string | null;
  customerId: string | null;
  income: unknown;
  driverWage: unknown;
  clearStatus: boolean;
  factoryLocation: { name: string } | null;
  customer: { name: string } | null;
};

// ---------------------------------------------------------------- helpers

/** เทียบ Decimal แบบทศนิยม 2 ตำแหน่ง เลี่ยงปัญหา floating point */
const same = (a: unknown, b: number) => {
  if (a === null || a === undefined) return false;
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
};

// ต่อ DB แบบเดียวกับ lib/prisma.ts — localhost ไม่เปิด SSL, คลาวด์เปิด
const connectionString = process.env.DATABASE_URL;
if (!connectionString) usage('ไม่พบ DATABASE_URL — รันผ่าน make หรือ export ก่อน');
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
  log: ['error'],
});

async function main() {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const jobs = await prisma.job.findMany({
    where: {
      jobDate: { gte: start, lt: end },
      isCancelled: false,
      jobType: { notIn: ['advance', 'noJob'] },
    },
    select: {
      id: true,
      jobNumber: true,
      jobDate: true,
      jobType: true,
      size: true,
      factoryLocationId: true,
      customerId: true,
      income: true,
      driverWage: true,
      clearStatus: true,
      factoryLocation: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: [{ jobDate: 'asc' }, { jobNumber: 'asc' }],
  });

  console.log(`\n📅 เดือน ${month} — พบงาน ${jobs.length} รายการ`);
  if (jobs.length === 0) {
    console.log('   ไม่มีงานให้ตรวจ\n');
    return;
  }

  const [incomeRates, wageRates, fuelLogs] = await Promise.all([
    prisma.rateIncome.findMany({ include: { fuelSurcharges: true } }),
    prisma.rateDriverWage.findMany(),
    prisma.fuelPriceLog.findMany({ orderBy: { effectiveDate: 'desc' } }),
  ]);

  const incomeByKey = new Map(
    incomeRates.map((r) => [`${r.jobType}|${r.size}|${r.factoryLocationId}|${r.customerId}`, r])
  );
  const wageByKey = new Map(
    wageRates.map((r) => [`${r.jobType}|${r.size}|${r.factoryLocationId ?? ''}`, r])
  );

  /** ราคาน้ำมันที่มีผล ณ วันที่งาน = log ล่าสุดที่ effectiveDate <= jobDate */
  const fuelPriceAt = (date: Date) => {
    const log = fuelLogs.find((l) => l.effectiveDate <= date);
    return log ? Number(log.pricePerLiter) : null;
  };

  /** income ที่ควรเป็น = ฐาน + surcharge ตามช่วงราคาน้ำมัน */
  const expectedIncome = (job: Job) => {
    if (!job.jobType || !job.size || !job.factoryLocationId || !job.customerId) return null;
    const rate = incomeByKey.get(
      `${job.jobType}|${job.size}|${job.factoryLocationId}|${job.customerId}`
    );
    if (!rate) return null;

    let surcharge = 0;
    if (rate.fuelSurcharges.length > 0) {
      const price = fuelPriceAt(job.jobDate);
      if (price !== null) {
        const matched = rate.fuelSurcharges.find(
          (s) => price >= Number(s.fuelPriceMin) && price < Number(s.fuelPriceMax)
        );
        if (matched) surcharge = Number(matched.surcharge);
      }
    }
    return Number(rate.income) + surcharge;
  };

  /** ทอยตู้ไม่ผูกกับโรงงาน — ประเภทอื่นต้องมี factoryLocationId ถึงจะหาอัตราได้ */
  const expectedWage = (job: Job) => {
    if (!job.jobType || !job.size) return null;
    if (job.jobType !== 'towing' && !job.factoryLocationId) return null;
    const rate = wageByKey.get(`${job.jobType}|${job.size}|${job.factoryLocationId ?? ''}`);
    return rate ? Number(rate.driverWage) : null;
  };

  const missingRate: { job: Job; field: Field }[] = [];        // ไม่มีเรตให้เทียบ
  const toFill: { job: Job; data: RateData; items: Fill[] }[] = [];  // ช่องเป็น null แต่มีเรต
  const toFix: { job: Job; data: RateData; items: Fix[] }[] = [];    // มีค่าแล้วแต่ไม่ตรงเรต

  for (const job of jobs) {
    const data: RateData = {};
    const fills: Fill[] = [];
    const fixes: Fix[] = [];

    const expInc = expectedIncome(job);
    if (expInc === null) {
      missingRate.push({ job, field: 'income' });
    } else if (job.income === null) {
      data.income = expInc;
      fills.push({ field: 'income', to: expInc });
    } else if (!same(job.income, expInc)) {
      data.income = expInc;
      fixes.push({ field: 'income', from: Number(job.income), to: expInc });
    }

    const expWage = expectedWage(job);
    if (expWage === null) {
      missingRate.push({ job, field: 'driverWage' });
    } else if (job.driverWage === null) {
      data.driverWage = expWage;
      fills.push({ field: 'driverWage', to: expWage });
    } else if (!same(job.driverWage, expWage)) {
      data.driverWage = expWage;
      fixes.push({ field: 'driverWage', from: Number(job.driverWage), to: expWage });
    }

    if (fills.length) toFill.push({ job, data, items: fills });
    if (fixes.length) toFix.push({ job, data, items: fixes });
  }

  // ---------------------------------------------------------------- summary

  const updates = new Map<string, RateData>();
  for (const { job, data } of [...toFill, ...toFix]) {
    updates.set(job.id, { ...(updates.get(job.id) ?? {}), ...data });
  }

  // นับแยกฝั่ง — งานหนึ่งอาจโดนทั้ง income และ wage จึงนับแยกเป็นช่อง
  const n = (rows: { items: { field: Field }[] }[], f: Field) =>
    rows.reduce((acc, r) => acc + r.items.filter((i) => i.field === f).length, 0);
  const miss = (f: Field) => missingRate.filter((m) => m.field === f).length;

  const fillInc = n(toFill, 'income');
  const fillWage = n(toFill, 'driverWage');
  const fixInc = n(toFix, 'income');
  const fixWage = n(toFix, 'driverWage');

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`   ตรวจ ${jobs.length} งาน`);
  console.log();
  console.log(`                    ค่าขนส่ง   ค่าเที่ยวคนขับ`);
  console.log(`   เติมช่องว่าง     ${String(fillInc).padStart(6)}   ${String(fillWage).padStart(10)}`);
  console.log(`   แก้ค่าไม่ตรง     ${String(fixInc).padStart(6)}   ${String(fixWage).padStart(10)}`);
  console.log(`   ไม่มีเรต         ${String(miss('income')).padStart(6)}   ${String(miss('driverWage')).padStart(10)}`);
  console.log();
  console.log(`   รวมงานที่จะแก้ ${updates.size} งาน`);
  console.log(`${'─'.repeat(52)}\n`);

  if (updates.size === 0) {
    console.log('✅ ทุกอย่างตรงกับเรตแล้ว ไม่ต้องแก้\n');
    return;
  }

  if (validate) {
    console.log('ℹ️  โหมด --validate ไม่ได้แก้อะไร');
    const envFlag = envArg ? ` ${envArg}` : '';
    console.log(`   รันจริง: npm run check-rates -- --m=${month}${envFlag} --execute\n`);
    return;
  }

  // อยู่ใน transaction เดียว — พังตรงไหน rollback ทั้งหมด
  //
  // ยิง update ทีละแถวไม่ไหว: 270 แถว = 270 round-trip ไป DB บนคลาวด์ ชน timeout 5 วิ
  // จับกลุ่มตามค่าที่จะเซ็ตแทน แล้ว updateMany ทีเดียวต่อกลุ่ม — เหลือไม่กี่ query
  const entries = [...updates.entries()];
  const groups = new Map<string, { data: RateData; ids: string[] }>();
  for (const [id, data] of entries) {
    const key = `${data.income ?? ''}|${data.driverWage ?? ''}`;
    const g = groups.get(key) ?? { data, ids: [] };
    g.ids.push(id);
    groups.set(key, g);
  }

  await prisma.$transaction(
    [...groups.values()].map((g) =>
      prisma.job.updateMany({ where: { id: { in: g.ids } }, data: g.data })
    ),
    { timeout: 120_000 }
  );

  console.log(`✅ แก้แล้ว ${entries.length} งาน` +
    `  (ค่าขนส่ง ${fillInc + fixInc} ช่อง, ค่าเที่ยวคนขับ ${fillWage + fixWage} ช่อง)\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ เกิดข้อผิดพลาด:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
