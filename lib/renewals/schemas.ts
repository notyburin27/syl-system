import { z } from 'zod'
import {
  BULK_LIMIT,
  COVERAGE_CLASSES,
  COVERAGE_TYPES,
  MAX_MONEY,
  NOT_RENEWED_REASONS,
  VEHICLE_STATUSES,
  type CoverageTypeKey,
} from './constants'
import { isValidYmd } from './dateOnly'
import { normalizePlate } from './plate'
import { THAI_PROVINCES } from './provinces'

/** issue code ที่ข้อความ default ของ zod เป็นอังกฤษ — แทนด้วยข้อความไทย (code ที่เหลือใช้ข้อความไทยที่เรากำหนดเอง) */
const ENGLISH_DEFAULT_CODES = new Set<string>([
  'invalid_type',
  'invalid_enum_value',
  'invalid_literal',
  'invalid_union',
  'invalid_union_discriminator',
  'unrecognized_keys',
  'invalid_date',
  'invalid_string',
  'not_multiple_of',
])

export function firstZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'ข้อมูลไม่ถูกต้อง'
  if (!ENGLISH_DEFAULT_CODES.has(issue.code)) return issue.message
  const field = issue.path.join('.') || 'body'
  if (issue.code === 'invalid_type' && issue.received === 'undefined') return `กรุณากรอก ${field}`
  return `ข้อมูลไม่ถูกต้อง: ${field}`
}

/** ข้อความว่าง / null / undefined → null */
const optionalText = (max: number) =>
  z.string().trim().max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`).nullish().transform((v) => v || null)

export const ymdSchema = z.string().refine(isValidYmd, 'วันที่ไม่ถูกต้อง')
const optionalYmd = ymdSchema.nullish().transform((v) => v ?? null)
const optionalId = z.string().min(1).nullish().transform((v) => v ?? null)
const money = z
  .number()
  .min(0, 'จำนวนเงินต้องไม่ติดลบ')
  .max(MAX_MONEY, 'จำนวนเงินต้องไม่เกิน 99,999,999.99')
  .nullish()
  .transform((v) => v ?? null)

/** จำนวนเต็มไม่ติดลบ — ว่าง → null */
const optionalCount = (label: string, max: number) =>
  z
    .number()
    .int(`${label}ต้องเป็นจำนวนเต็ม`)
    .min(0, `${label}ต้องไม่ติดลบ`)
    .max(max, `${label}มากเกินไป`)
    .nullish()
    .transform((v) => v ?? null)

export const vehicleInputSchema = z.object({
  plate: z
    .string()
    .transform(normalizePlate)
    .pipe(z.string().min(1, 'กรุณากรอกทะเบียน').max(30, 'ทะเบียนยาวเกิน 30 ตัวอักษร')),
  plateProvince: z
    .enum(THAI_PROVINCES)
    .nullish()
    .transform((v) => v ?? null),
  registrationDate: optionalYmd,
  fleetNumber: optionalText(50),
  ownerName: z.string().trim().min(1, 'กรุณากรอกบริษัท').max(100, 'ชื่อบริษัทยาวเกิน 100 ตัวอักษร'),
  vehicleType: z.string().trim().min(1, 'กรุณากรอกลักษณะรถ').max(50, 'ลักษณะรถยาวเกิน 50 ตัวอักษร'),
  brand: optionalText(100),
  modelName: optionalText(100),
  color: optionalText(50),
  chassisNumber: optionalText(100),
  chassisPosition: optionalText(100),
  engineNumber: optionalText(100),
  engineCylinders: optionalCount('จำนวนสูบ', 100),
  engineHorsepower: optionalCount('แรงม้า', 10_000),
  axleCount: optionalCount('จำนวนเพลา', 20),
  fuelType: optionalText(50),
  weightKg: optionalCount('น้ำหนัก', 100_000),
  status: z.enum(VEHICLE_STATUSES).default('ACTIVE'),
  statusDate: optionalYmd,
  note: optionalText(500),
})
export type VehicleInput = z.infer<typeof vehicleInputSchema>

const coverageFieldsObject = z.object({
  insurerId: optionalId,
  coverageClass: z.enum(COVERAGE_CLASSES).nullish().transform((v) => v ?? null),
  policyNumber: optionalText(100),
  startDate: optionalYmd,
  endDate: ymdSchema,
  amount: money,
  serviceFee: money,
  pairedVehicleId: optionalId,
  renewalNote: optionalText(500),
})

const startNotAfterEnd = (v: { startDate: string | null; endDate: string }) => !v.startDate || v.startDate <= v.endDate
const START_AFTER_END = { message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', path: ['endDate'] }

export const coverageFieldsSchema = coverageFieldsObject.refine(startNotAfterEnd, START_AFTER_END)
export type CoverageFields = z.infer<typeof coverageFieldsSchema>

export const coverageCreateSchema = coverageFieldsObject
  .extend({ vehicleId: z.string().min(1, 'กรุณาเลือกรถ'), type: z.enum(COVERAGE_TYPES) })
  .refine(startNotAfterEnd, START_AFTER_END)
export type CoverageCreateInput = z.infer<typeof coverageCreateSchema>

const idsSchema = z
  .array(z.string().min(1))
  .min(1, 'กรุณาเลือกรายการ')
  .max(BULK_LIMIT, `เลือกได้ไม่เกิน ${BULK_LIMIT} รายการ`)

export const bulkRenewSchema = z
  .object({ ids: idsSchema, insurerId: optionalId, startDate: optionalYmd, endDate: ymdSchema })
  .refine(startNotAfterEnd, START_AFTER_END)
export type BulkRenewInput = z.infer<typeof bulkRenewSchema>

export const bulkStatusSchema = z
  .object({
    ids: idsSchema,
    status: z.enum(['PENDING', 'IN_PROGRESS', 'NOT_RENEWED']),
    reason: z.enum(NOT_RENEWED_REASONS).nullish().transform((v) => v ?? null),
    note: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'NOT_RENEWED') return
    if (!v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'กรุณาเลือกเหตุผลที่ไม่ต่อ', path: ['reason'] })
    } else if (v.reason === 'OTHER' && !v.note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'เหตุผล "อื่นๆ" ต้องกรอกหมายเหตุ', path: ['note'] })
    }
  })
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>

const insurerName = z.string().trim().min(1, 'กรุณากรอกชื่อบริษัทประกัน').max(100, 'ชื่อบริษัทประกันยาวเกิน 100 ตัวอักษร')

/** { name } เพิ่มทีละราย หรือ { names } จากปุ่ม "เพิ่มบริษัทประกันที่ยังไม่มี" ในหน้า import */
export const insurerCreateSchema = z
  .object({ name: insurerName.optional(), names: z.array(insurerName).min(1).max(100).optional() })
  .refine((v) => v.name !== undefined || v.names !== undefined, 'กรุณากรอกชื่อบริษัทประกัน')

export const insurerUpdateSchema = z.object({ name: insurerName.optional(), isActive: z.boolean().optional() })

/** ฟิลด์ที่ไม่ใช้กับประเภทนั้นล้างเป็น null — ภาษีไม่มีบริษัทประกัน, ชั้น/หางคู่มีเฉพาะประกันรถยนต์ */
export function sanitizeCoverageFields<
  T extends { insurerId: string | null; coverageClass: string | null; pairedVehicleId: string | null },
>(type: CoverageTypeKey, fields: T): T {
  const isMotor = type === 'MOTOR_INSURANCE'
  return {
    ...fields,
    insurerId: type === 'TAX' ? null : fields.insurerId,
    coverageClass: isMotor ? fields.coverageClass : null,
    pairedVehicleId: isMotor ? fields.pairedVehicleId : null,
  }
}
