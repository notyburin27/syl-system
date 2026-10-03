#!/usr/bin/env node
/**
 * แก้เลข JOB (jobs.jobNumber) ของงานเก่าที่กรอกผิด
 *   - ผิดกฎบันทึก (มีภาษาไทย/จุด — lib/utils/jobNumber.ts) → ต้องแก้
 *   - ไม่ใช่รูปแบบมาตรฐาน 123456/123456(-1) → เสนอแก้ typo (lib/utils/jobNumberFix.ts)
 *   - ไม่นับ: รูปแบบ A (A5, A47/B155040), เลขที่ mark งานซ้ำไว้แล้ว (-X), advance/noJob
 *
 * 1) DRY RUN (ค่าเริ่มต้น — อ่านอย่างเดียว ไม่แก้ DB)
 *      npx tsx scripts/fix-job-numbers.ts --env=.env.stag --out=/tmp/job-numbers.csv
 *    เขียน CSV: id, jobDate, jobType, driver, customer, current, suggested, confidence, evidence, final
 *      suggested/confidence/evidence = ที่สคริปต์เดาให้ (high = เชื่อได้, low = ต้องตรวจ, ว่าง = กรอกเอง)
 *      ค่าที่เสนอชนกับเลขที่มีอยู่ (งานน่าจะซ้ำ) → ต่อท้าย -X, -X2, ... (evidence บอกว่าชนกับงานไหน)
 *      final = ว่างไว้ ให้คนกรอกค่าที่ตรวจแล้ว (copy จาก suggested ได้)
 *
 * 2) APPLY — อ่านเฉพาะคอลัมน์ id + final (แถวที่ final ว่าง = ข้าม)
 *      npx tsx scripts/fix-job-numbers.ts --env=.env.stag --apply=/tmp/job-numbers.csv          # ตรวจ + สรุป ยังไม่เขียน
 *      npx tsx scripts/fix-job-numbers.ts --env=.env.stag --apply=/tmp/job-numbers.csv --yes    # เขียนจริง (transaction เดียว)
 *    ตรวจ final ทุกแถวด้วย validator เดียวกับ API (ห้ามไทย/จุด), ห้ามชนกับเลขที่มีอยู่แล้ว, ห้ามซ้ำกันเองใน CSV
 *    มี error แม้แถวเดียว → ไม่เขียนอะไรเลย
 *    เขียนสำเร็จ → log old→new ลงไฟล์ <csv>.applied-<timestamp>.log
 *
 * เลือก DB: --env=<ไฟล์> (ไม่ใส่ = .env.local ที่ make ก็อปไว้ → .env)
 *           DATABASE_URL ที่ export ไว้ใน shell ชนะทุกอย่าง เช่น
 *           DATABASE_URL="postgresql://e2e:e2epass@localhost:5442/syl_e2e" npx tsx scripts/fix-job-numbers.ts --out=...
 * รับ argument ได้ทั้ง --out=path และ --out path
 */

import { config } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { AUTO_NUMBER_JOB_TYPES, isAutoNumberJobType, validateJobNumber } from '../lib/utils/jobNumber'
import {
  STANDARD_JOB_NUMBER_REGEX,
  needsJobNumberFix,
  suggestJobNumberFix,
  parseCsv,
  toCsv,
  type ReferenceJob,
} from '../lib/utils/jobNumberFix'

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2)

/** --name=value หรือ --name value */
function arg(name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const i = argv.indexOf(`--${name}`)
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]
  return undefined
}

const outPath = arg('out')
const applyPath = arg('apply')
const envArg = arg('env')
const yes = argv.includes('--yes')

function usage(msg?: string): never {
  if (msg) console.error(`\n  ${msg}`)
  console.error(`
  ใช้งาน:
    npx tsx scripts/fix-job-numbers.ts [--env=.env.stag] --out=<file.csv>             dry run → เขียน CSV
    npx tsx scripts/fix-job-numbers.ts [--env=.env.stag] --apply=<file.csv>           ตรวจคอลัมน์ final + สรุป
    npx tsx scripts/fix-job-numbers.ts [--env=.env.stag] --apply=<file.csv> --yes     เขียนลง DB จริง
`)
  process.exit(1)
}

if (!outPath && !applyPath) usage('ต้องระบุ --out (dry run) หรือ --apply')
if (outPath && applyPath) usage('เลือกได้อย่างเดียว: --out หรือ --apply')
if (yes && !applyPath) usage('--yes ใช้คู่กับ --apply เท่านั้น')

// ---------------------------------------------------------------- env / db
//
// อ่าน .env เองเพราะรันนอก next — ลำดับเดียวกับ scripts/check-job-rates.ts
// DATABASE_URL ที่ตั้งมาจาก shell อยู่แล้วชนะ (dotenv ไม่ override)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = envArg
  ? resolve(root, envArg)
  : ['.env.local', '.env'].map((f) => resolve(root, f)).find(existsSync)
if (envFile) {
  if (!existsSync(envFile)) usage(`ไม่พบไฟล์ env: ${envFile}`)
  config({ path: envFile, quiet: true })
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) usage('ไม่พบ DATABASE_URL — ระบุ --env=... หรือ export ก่อน')

// ต่อ DB แบบเดียวกับ lib/prisma.ts — localhost ไม่เปิด SSL, คลาวด์เปิด
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
  log: ['error'],
})

const dbLabel = (() => {
  try {
    const u = new URL(connectionString)
    return `${u.hostname}:${u.port || 5432}${u.pathname}`
  } catch {
    return '(อ่าน host ไม่ได้)'
  }
})()

const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

// ---------------------------------------------------------------- dry run

async function dryRun(out: string) {
  const jobs = await prisma.job.findMany({
    where: { jobType: { notIn: [...AUTO_NUMBER_JOB_TYPES] } },
    select: {
      id: true,
      jobNumber: true,
      jobDate: true,
      jobType: true,
      customerId: true,
      customer: { select: { name: true } },
      driver: { select: { name: true } },
    },
    orderBy: [{ jobDate: 'asc' }, { createdAt: 'asc' }],
  })
  const allNumbers = await prisma.job.findMany({ select: { jobNumber: true } })
  // ค่าที่เสนอให้แถวก่อนหน้าถูกจองไว้ด้วย — แถวหลังที่ได้ค่าเดียวกันจะได้ -X แทนการชนกันเอง
  const reserved = new Set(allNumbers.map((j) => j.jobNumber))

  const references: ReferenceJob[] = jobs.filter((j) => STANDARD_JOB_NUMBER_REGEX.test(j.jobNumber))
  const bad = jobs.filter((j) => needsJobNumberFix(j.jobNumber))

  const rows = bad.map((j) => {
    const s = suggestJobNumberFix(j, references, reserved)
    if (s.suggested) reserved.add(s.suggested)
    return { job: j, ...s }
  })

  const header = ['id', 'jobDate', 'jobType', 'driver', 'customer', 'current', 'suggested', 'confidence', 'evidence', 'final']
  const body = rows.map((r) => [
    r.job.id,
    fmtDate(r.job.jobDate),
    r.job.jobType,
    r.job.driver?.name ?? '',
    r.job.customer?.name ?? '',
    r.job.jobNumber,
    r.suggested,
    r.confidence,
    r.evidence,
    '',
  ])
  // BOM ให้ Excel อ่านภาษาไทยถูก
  writeFileSync(out, '﻿' + toCsv([header, ...body]), 'utf8')

  const high = rows.filter((r) => r.confidence === 'high').length
  const low = rows.filter((r) => r.confidence === 'low').length
  console.log(`
  DB: ${dbLabel}  (dry run — ไม่ได้แก้ข้อมูล)
  งานทั้งหมด (ไม่รวม advance/noJob): ${jobs.length}
  เลข JOB ที่ต้องแก้: ${bad.length}  (ผิดกฎบันทึก ไทย/จุด: ${rows.filter((r) => r.evidence.includes('ผิดกฎบันทึก')).length}, ใส่ -X: ${rows.filter((r) => /-X\d*$/.test(r.suggested)).length})
    high (เชื่อได้):   ${high}
    low (ต้องตรวจ):    ${low}
    กรอกเอง:          ${bad.length - high - low}
  เขียนไฟล์: ${out}
  ขั้นต่อไป: กรอกคอลัมน์ final แล้วรัน --apply=${out}
`)
}

// ---------------------------------------------------------------- apply

async function apply(csvPath: string) {
  if (!existsSync(csvPath)) usage(`ไม่พบไฟล์: ${csvPath}`)
  const table = parseCsv(readFileSync(csvPath, 'utf8'))
  const [header, ...data] = table
  const idCol = header?.indexOf('id') ?? -1
  const finalCol = header?.indexOf('final') ?? -1
  if (idCol < 0 || finalCol < 0) usage('CSV ต้องมีคอลัมน์ id และ final')

  const errors: string[] = []
  const wanted: { id: string; final: string; line: number }[] = []
  data.forEach((row, i) => {
    const line = i + 2 // +1 header, +1 นับจาก 1
    const id = (row[idCol] ?? '').trim()
    const rawFinal = (row[finalCol] ?? '').trim()
    if (!rawFinal) return
    if (!id) {
      errors.push(`บรรทัด ${line}: ไม่มี id`)
      return
    }
    const v = validateJobNumber(rawFinal)
    if (!v.ok) {
      errors.push(`บรรทัด ${line}: final "${rawFinal}" — ${v.error}`)
      return
    }
    wanted.push({ id, final: v.value, line })
  })

  // ซ้ำกันเองใน CSV
  const seenFinal = new Map<string, number>()
  const seenId = new Map<string, number>()
  for (const w of wanted) {
    if (seenFinal.has(w.final)) {
      errors.push(`บรรทัด ${w.line}: final ${w.final} ซ้ำกับบรรทัด ${seenFinal.get(w.final)}`)
    } else seenFinal.set(w.final, w.line)
    if (seenId.has(w.id)) errors.push(`บรรทัด ${w.line}: id ${w.id} ซ้ำกับบรรทัด ${seenId.get(w.id)}`)
    else seenId.set(w.id, w.line)
  }

  const jobs = await prisma.job.findMany({
    where: { id: { in: wanted.map((w) => w.id) } },
    select: { id: true, jobNumber: true, jobType: true, jobDate: true },
  })
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const collisions = await prisma.job.findMany({
    where: { jobNumber: { in: wanted.map((w) => w.final) } },
    select: { id: true, jobNumber: true },
  })
  const holder = new Map(collisions.map((c) => [c.jobNumber, c.id]))

  const updates: { id: string; from: string; to: string; jobDate: Date }[] = []
  const skipped: string[] = []
  for (const w of wanted) {
    const job = byId.get(w.id)
    if (!job) {
      errors.push(`บรรทัด ${w.line}: ไม่พบงาน id ${w.id} ใน DB นี้`)
      continue
    }
    if (isAutoNumberJobType(job.jobType)) {
      errors.push(`บรรทัด ${w.line}: งาน ${job.jobNumber} เป็น ${job.jobType} — ไม่แก้เลขที่ระบบออกให้`)
      continue
    }
    if (job.jobNumber === w.final) {
      skipped.push(`${job.jobNumber} (ค่าเดิมเท่ากับ final อยู่แล้ว)`)
      continue
    }
    if (!needsJobNumberFix(job.jobNumber)) {
      // มีคนแก้ให้ถูกแล้วหลังจาก dry run — ไม่ทับ
      skipped.push(`${job.jobNumber} (ใน DB ถูกแล้ว ไม่ทับด้วย ${w.final})`)
      continue
    }
    const other = holder.get(w.final)
    if (other && other !== job.id) {
      errors.push(`บรรทัด ${w.line}: final ${w.final} ซ้ำกับงานที่มีอยู่แล้ว (id ${other})`)
      continue
    }
    updates.push({ id: job.id, from: job.jobNumber, to: w.final, jobDate: job.jobDate })
  }

  console.log(`\n  DB: ${dbLabel}`)
  console.log(`  แถวที่มี final: ${wanted.length}  จะแก้: ${updates.length}  ข้าม: ${skipped.length}  error: ${errors.length}\n`)
  for (const u of updates) console.log(`    ${fmtDate(u.jobDate)}  ${u.from}  →  ${u.to}`)
  if (skipped.length) {
    console.log('\n  ข้าม:')
    for (const s of skipped) console.log(`    ${s}`)
  }
  if (errors.length) {
    console.error('\n  ERROR — ไม่ได้เขียนอะไรลง DB:')
    for (const e of errors) console.error(`    ${e}`)
    process.exitCode = 1
    return
  }
  if (updates.length === 0) {
    console.log('\n  ไม่มีอะไรต้องแก้')
    return
  }
  if (!yes) {
    console.log('\n  ยังไม่ได้เขียน — ตรวจรายการด้านบนแล้วรันซ้ำพร้อม --yes เพื่อบันทึกจริง\n')
    return
  }

  await prisma.$transaction(
    updates.map((u) => prisma.job.update({ where: { id: u.id }, data: { jobNumber: u.to } })),
  )
  const logPath = `${csvPath}.applied-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
  writeFileSync(
    logPath,
    [`# ${new Date().toISOString()} DB=${dbLabel}`, 'id\tjobDate\told\tnew',
      ...updates.map((u) => `${u.id}\t${fmtDate(u.jobDate)}\t${u.from}\t${u.to}`)].join('\n') + '\n',
    'utf8',
  )
  console.log(`\n  บันทึกแล้ว ${updates.length} งาน — log: ${logPath}\n`)
}

// ---------------------------------------------------------------- main

;(applyPath ? apply(resolve(applyPath)) : dryRun(resolve(outPath!)))
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
