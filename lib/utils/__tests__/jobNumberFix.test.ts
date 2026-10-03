import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STANDARD_JOB_NUMBER_REGEX,
  needsJobNumberFix,
  cleanupJobNumber,
  differsByOneInsertion,
  robustRange,
  suggestJobNumberFix,
  parseCsv,
  toCsv,
  type ReferenceJob,
} from '../jobNumberFix'
import { validateJobNumber } from '../jobNumber'

const ref = (jobNumber: string, date = '2026-08-05', customerId: string | null = 'c1'): ReferenceJob => ({
  id: `ref-${jobNumber}`,
  jobNumber,
  jobDate: new Date(`${date}T00:00:00Z`),
  customerId,
})

const target = (jobNumber: string, date = '2026-08-05', customerId: string | null = 'c1') => ({
  id: 'bad1',
  jobNumber,
  jobDate: new Date(`${date}T00:00:00Z`),
  customerId,
})

const existing = (refs: ReferenceJob[], extra: string[] = []) =>
  new Set([...refs.map((r) => r.jobNumber), ...extra])

test('STANDARD_JOB_NUMBER_REGEX: 6/6 + suffix 1-2 หลัก', () => {
  for (const v of ['163339/544310', '163608/545167-1', '161616/538122-23']) {
    assert.ok(STANDARD_JOB_NUMBER_REGEX.test(v), v)
  }
  for (const v of ['1625527/541456', '16262/541833', '162954542990', '161616/538122-123', 'A5']) {
    assert.equal(STANDARD_JOB_NUMBER_REGEX.test(v), false, v)
  }
})

test('needsJobNumberFix: ไม่นับรูปแบบมาตรฐาน, รูปแบบ A และเลขที่ mark -X แล้ว', () => {
  for (const v of ['163339/544310', '163608/545167-1', 'A5', 'A33', 'A47/B155040', '163157/544551-X', '163157/544551-X2']) {
    assert.equal(needsJobNumberFix(v), false, v)
  }
  for (const v of ['16262/541833', 'ิ163700/545513', '16420.3/547228', '163735/ตู้อุบัติเหตุ', '2', 'A47/155040', 'B5']) {
    assert.equal(needsJobNumberFix(v), true, v)
  }
})

test('cleanupJobNumber: ตัดสระไทย ช่องว่าง ตัวล่องหน และแปลคำที่รู้จัก', () => {
  assert.deepEqual(cleanupJobNumber('ิ163700/545513'), { value: '163700/545513', droppedDot: false, translated: [] })
  assert.deepEqual(cleanupJobNumber(' 163339 /​544310'), { value: '163339/544310', droppedDot: false, translated: [] })
  assert.deepEqual(cleanupJobNumber('163735/ตู้อุบัติเหตุ'), {
    value: '163735/ACCIDENT',
    droppedDot: false,
    translated: ['ตู้อุบัติเหตุ → ACCIDENT'],
  })
  assert.deepEqual(cleanupJobNumber('16420.3/547228'), { value: '164203/547228', droppedDot: true, translated: [] })
})

test('differsByOneInsertion', () => {
  assert.equal(differsByOneInsertion('16337', '163337'), true)
  assert.equal(differsByOneInsertion('1625527', '162527'), true)
  assert.equal(differsByOneInsertion('16337', '163338'), false)
  assert.equal(differsByOneInsertion('163337', '163337'), false)
})

test('robustRange: ตัด outlier ออกจากช่วงเลขวิ่ง', () => {
  assert.deepEqual(robustRange([544100, 544150, 544200, 544250, 163359]), { min: 544100, max: 544250 })
  assert.deepEqual(robustRange([5]), { min: 5, max: 5 })
  assert.equal(robustRange([]), null)
})

test('ไทย: สระนำหน้า → ตัดออก high และบอกว่าผิดกฎบันทึก', () => {
  const r = suggestJobNumberFix(target('ิ163700/545513'), [], new Set())
  assert.equal(r.suggested, '163700/545513')
  assert.equal(r.confidence, 'high')
  assert.match(r.evidence, /ผิดกฎบันทึก/)
})

test('จุด: 16420.3/547228 → 164203/547228 confidence low', () => {
  const r = suggestJobNumberFix(target('16420.3/547228'), [], new Set())
  assert.equal(r.suggested, '164203/547228')
  assert.equal(r.confidence, 'low')
  assert.match(r.evidence, /ผิดกฎบันทึก/)
})

test('ไทย: ตู้อุบัติเหตุ → 163735/ACCIDENT', () => {
  const r = suggestJobNumberFix(target('163735/ตู้อุบัติเหตุ'), [], new Set())
  assert.equal(r.suggested, '163735/ACCIDENT')
  assert.equal(r.confidence, 'high')
  assert.match(r.evidence, /ผิดกฎบันทึก.*ACCIDENT/)
  assert.ok(validateJobNumber(r.suggested).ok)
})

test('ไทยที่แปลไม่ได้ → ให้คนกรอกเอง', () => {
  const r = suggestJobNumberFix(target('163735/ตู้เสีย'), [], new Set())
  assert.equal(r.suggested, '')
  assert.match(r.evidence, /ผิดกฎบันทึก/)
})

test('ไทย + typo: สระนำหน้าแล้ว booking ขาด 1 หลัก → เดาจากงานลูกค้าเดียวกัน', () => {
  const refs = [ref('164000/546936', '2026-08-31')]
  const r = suggestJobNumberFix(target('ิ16400/546937', '2026-08-31'), refs, existing(refs))
  assert.equal(r.suggested, '164000/546937')
  assert.equal(r.confidence, 'high')
  assert.match(r.evidence, /ผิดกฎบันทึก/)
})

test('typo: booking ขาด 1 หลัก หาได้จากงานลูกค้าเดียวกัน → high', () => {
  const refs = [ref('163337/544737', '2026-08-06'), ref('163400/544800', '2026-08-06')]
  const r = suggestJobNumberFix(target('16337/544595'), refs, existing(refs))
  assert.equal(r.suggested, '163337/544595')
  assert.equal(r.confidence, 'high')
  assert.match(r.evidence, /163337\/544737/)
  assert.doesNotMatch(r.evidence, /ผิดกฎบันทึก/)
})

test('typo: booking เกิน 1 หลัก → high', () => {
  const refs = [ref('162527/541400')]
  const r = suggestJobNumberFix(target('1625527/541456'), refs, existing(refs))
  assert.equal(r.suggested, '162527/541456')
  assert.equal(r.confidence, 'high')
})

test('typo: งานลูกค้าเดียวกันอยู่นอกช่วง ±3 วัน → ไม่ใช้', () => {
  const refs = [ref('163337/544737', '2026-08-12')]
  assert.equal(suggestJobNumberFix(target('16337/544595'), refs, existing(refs)).suggested, '')
})

test('typo: booking จากลูกค้าอื่นเท่านั้น → low', () => {
  const refs = [ref('163337/544737', '2026-08-05', 'c2')]
  const r = suggestJobNumberFix(target('16337/544595'), refs, existing(refs))
  assert.equal(r.suggested, '163337/544595')
  assert.equal(r.confidence, 'low')
})

test('typo: booking มีหลายตัวเลือก → ให้คนเลือก', () => {
  const refs = [ref('163337/544737'), ref('163370/544738')]
  const r = suggestJobNumberFix(target('16337/544595'), refs, existing(refs))
  assert.equal(r.suggested, '')
  assert.match(r.evidence, /หลายตัวเลือก/)
})

test('typo: เลข 12 หลักไม่มี "/" + booking ยืนยัน → high, ไม่มีงานยืนยัน → low', () => {
  const refs = [ref('162954/542900')]
  const a = suggestJobNumberFix(target('162954542990'), refs, existing(refs))
  assert.deepEqual([a.suggested, a.confidence], ['162954/542990', 'high'])
  const b = suggestJobNumberFix(target('162954542990'), [], new Set())
  assert.deepEqual([b.suggested, b.confidence], ['162954/542990', 'low'])
})

test('typo: เลขใบงาน 7 หลัก ตัวเลือกเดียวในช่วงเลขวิ่ง → low', () => {
  const refs = [ref('163600/545160'), ref('163610/545169')]
  const r = suggestJobNumberFix(target('163608/5455167'), refs, existing(refs))
  assert.deepEqual([r.suggested, r.confidence], ['163608/545167', 'low'])
})

test('typo: เลขใบงานตีความได้หลายแบบ → ให้คนเลือก', () => {
  const refs = [ref('163600/545100'), ref('163610/545200')]
  const r = suggestJobNumberFix(target('163608/5451671'), refs, existing(refs))
  assert.equal(r.suggested, '')
  assert.match(r.evidence, /545167-1/)
})

test('ชนกับงานที่มีอยู่ → ต่อท้าย -X และบอกว่าชนกับงานไหน', () => {
  const refs = [ref('163157/544551', '2026-08-06'), ref('163157/544500')]
  const r = suggestJobNumberFix(target('1631157/544551'), refs, existing(refs))
  assert.equal(r.suggested, '163157/544551-X')
  assert.match(r.evidence, /ชนกับงาน 163157\/544551 \(2026-08-06, id ref-163157\/544551\)/)
  assert.ok(validateJobNumber(r.suggested).ok)
  assert.equal(needsJobNumberFix(r.suggested), false)
})

test('-X ชนอีก → -X2, -X3', () => {
  const refs = [ref('163157/544551'), ref('163157/544500')]
  const r = suggestJobNumberFix(
    target('1631157/544551'),
    refs,
    existing(refs, ['163157/544551-X', '163157/544551-X2']),
  )
  assert.equal(r.suggested, '163157/544551-X3')
})

test('ล้างแล้วชน (สระนำหน้า) → -X', () => {
  const r = suggestJobNumberFix(target('ิ163700/545513'), [ref('163700/545513')], new Set(['163700/545513']))
  assert.equal(r.suggested, '163700/545513-X')
  assert.match(r.evidence, /ผิดกฎบันทึก/)
})

test('เดาไม่ได้ → ว่าง', () => {
  for (const v of ['2', '5383', '164164222/547294']) {
    const r = suggestJobNumberFix(target(v), [ref('163337/544737')], new Set())
    assert.equal(r.suggested, '', v)
    assert.equal(r.confidence, '', v)
  }
})

test('มีแต่ booking → evidence แสดงงานที่ใช้ booking เดียวกัน', () => {
  const refs = [ref('162484/541000')]
  const r = suggestJobNumberFix(target('162484'), refs, existing(refs))
  assert.equal(r.suggested, '')
  assert.match(r.evidence, /162484\/541000/)
})

test('CSV: เขียนแล้วอ่านกลับได้ค่าเดิม (มี , " และภาษาไทย)', () => {
  const rows = [
    ['id', 'evidence', 'final'],
    ['x1', 'booking 1→2; "quoted", ok', ''],
    ['x2', 'ทอยตู้\nบรรทัดใหม่', '163337/544595'],
  ]
  assert.deepEqual(parseCsv('﻿' + toCsv(rows)), rows)
})
