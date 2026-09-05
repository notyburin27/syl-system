import * as XLSX from 'xlsx'
import type { Job } from '@/types/job'
import { JOB_TYPES } from '@/types/job'
import dayjs from 'dayjs'
import 'dayjs/locale/th'

dayjs.locale('th')

type JobWithRelations = Job & {
  customer?: { name: string } | null
  pickupLocation?: { name: string } | null
  factoryLocation?: { name: string } | null
  returnLocation?: { name: string } | null
  transfers?: { isCompleted: boolean; amount: number | string }[] | null
  carryOverToJob?: { jobNumber: string } | null
}

// แถว banner (วันลา/วันหยุด/อาทิตย์/ไม่มีงาน) ที่ caller ประกอบมาแล้ว
export type ExportBanner = {
  day: number // วันที่ของเดือน (1-31)
  label: string // ข้อความ เช่น "🌴 ลาป่วย" / "🔴 วันหยุด"
}

// Amounts of completed transfers, in the order they were stored (caller orders by createdAt asc)
function completedTransferAmounts(job: JobWithRelations): number[] {
  return (job.transfers ?? []).filter((t) => t.isCompleted).map((t) => Number(t.amount))
}

function computeDriverOverall(job: Job): number | null {
  const hasAny = job.advance || job.toll || job.pickupFee || job.returnFee || job.liftFee || job.storageFee || job.tire || job.other || job.fuelCashAmount
  if (!hasAny) return null
  return (
    Number(job.advance || 0) +
    Number(job.toll || 0) +
    Number(job.pickupFee || 0) +
    Number(job.returnFee || 0) +
    Number(job.liftFee || 0) +
    Number(job.storageFee || 0) +
    Number(job.tire || 0) +
    Number(job.other || 0) +
    Number(job.fuelCashAmount || 0)
  )
}

// Matches the table UI: overall − actualTransferPrev − completed transfers (missing prev counts as 0)
function computeDifference(job: JobWithRelations): number | null {
  const overall = computeDriverOverall(job)
  // Cancelled jobs void the driver's closing fees: difference = −(prev + completed transfers).
  if (overall === null && !job.isCancelled) return null
  const prev = Number(job.actualTransferPrev || 0)
  const completed = (job.transfers ?? []).filter((t) => t.isCompleted).reduce((s, t) => s + Number(t.amount), 0)
  return (job.isCancelled ? 0 : (overall ?? 0)) - prev - completed
}

function computeTotal(job: JobWithRelations): number | null {
  if (!job.transfers?.length) return null
  const completed = job.transfers.filter((t) => t.isCompleted).reduce((s, t) => s + Number(t.amount), 0)
  if (!completed) return null
  return completed
}

function getJobTypeLabel(value: string): string {
  return JOB_TYPES.find((t) => t.value === value)?.label ?? value
}

// Advance jobs ("เบิกล่วงหน้า") have no driver settlement, so all summary columns
// (รวมคนรถปิดงาน, ส่วนต่าง, transfers, รวมยอดโอน) are left blank — matches the UI.
function isAdvanceType(job: Job): boolean {
  return job.jobType === 'advance'
}

export function generateJobsExcel(
  jobs: JobWithRelations[],
  driverName: string,
  month: string,
  vehicleNumber?: string,
  isAdmin = false,
  banners: ExportBanner[] = [],
): Buffer {
  const financeMainCount = isAdmin ? 2 : 0

  // Max number of completed transfers across all jobs this month → one column per transfer
  const maxTransfers = jobs.reduce((max, job) => (isAdvanceType(job) ? max : Math.max(max, completedTransferAmounts(job).length)), 0)
  const transferHeaders = Array.from({ length: maxTransfers }, (_, i) => `โอนครั้งที่ ${i + 1}`)

  const groupHeaders = [
    'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน',
    'สถานที่', 'สถานที่', 'สถานที่',
    ...Array(financeMainCount).fill('การเงินหลัก'),
    'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ',
    'สรุป', 'สรุป', 'สรุป',
    'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์',
    'สถานะ',
  ]

  const colHeaders = [
    'วันที่', 'JOB/เลขที่', 'ลักษณะงาน', 'ลูกค้า', 'SIZE',
    'สถานที่รับตู้', 'โรงงาน', 'สถานที่คืนตู้',
    ...(isAdmin ? ['ค่าขนส่ง', 'ค่าเที่ยวคนขับ'] : []),
    'ยกยอด', 'เบิกล่วงหน้า', 'ค่าทางด่วน', 'ค่ารับตู้', 'ค่าคืนตู้', 'ค่ายกตู้', 'ค่าฝากตู้', 'ค่ายาง', 'อื่นๆ',
    'รวมคนรถปิดงาน', ...transferHeaders, 'รวมยอดโอน', 'ส่วนต่าง', 'ยกยอดไป', 'หมายเหตุ',
    'ไมล์รถ', 'น้ำมัน OFF (ลิตร)', 'น้ำมันสด (ลิตร)', 'น้ำมันสด (฿)', 'น้ำมันเครดิต (ลิตร)', 'น้ำมันเครดิต (฿)',
    'เคลียร์', 'ยกเลิก',
  ]

  const totalCols = colHeaders.length
  const jobRows = jobs.map((job) => {
    const advance = isAdvanceType(job)
    const amounts = advance ? [] : completedTransferAmounts(job)
    // One cell per transfer column; blank when this job has fewer transfers than maxTransfers
    const transferCells = Array.from({ length: maxTransfers }, (_, i) => (i < amounts.length ? amounts[i] : ''))
    const day = job.jobDate ? dayjs(job.jobDate).date() : 0
    const cells: (string | number)[] = [
    job.jobDate ? dayjs(job.jobDate).format('DD/MM/YYYY') : '',
    job.jobNumber,
    getJobTypeLabel(job.jobType),
    job.customer?.name ?? '',
    job.size ?? '',
    job.pickupLocation?.name ?? '',
    job.factoryLocation?.name ?? '',
    job.returnLocation?.name ?? '',
    ...(isAdmin ? [
      job.income != null ? Number(job.income) : '',
      job.driverWage != null ? Number(job.driverWage) : '',
    ] : []),
    job.actualTransferPrev != null ? Number(job.actualTransferPrev) : '',
    job.advance != null ? Number(job.advance) : '',
    job.toll != null ? Number(job.toll) : '',
    job.pickupFee != null ? Number(job.pickupFee) : '',
    job.returnFee != null ? Number(job.returnFee) : '',
    job.liftFee != null ? Number(job.liftFee) : '',
    job.storageFee != null ? Number(job.storageFee) : '',
    job.tire != null ? Number(job.tire) : '',
    job.other != null ? Number(job.other) : '',
    advance ? '' : (computeDriverOverall(job) ?? ''),
    ...transferCells,
    advance ? '' : (computeTotal(job) ?? ''),
    advance ? '' : (computeDifference(job) ?? ''),
    advance ? '' : (job.carryOverToJob?.jobNumber ?? ''),
    job.remarks ?? '',
    job.mileage != null ? Number(job.mileage) : '',
    job.fuelOfficeLiters != null ? Number(job.fuelOfficeLiters) : '',
    job.fuelCashLiters != null ? Number(job.fuelCashLiters) : '',
    job.fuelCashAmount != null ? Number(job.fuelCashAmount) : '',
    job.fuelCreditLiters != null ? Number(job.fuelCreditLiters) : '',
    job.fuelCreditAmount != null ? Number(job.fuelCreditAmount) : '',
    job.clearStatus ? '✓' : '',
    job.isCancelled ? '✓' : '',
    ]
    return { day, cells }
  })

  // คอลัมน์ index: วันที่=0, JOB=1, ลักษณะงาน=2, ลูกค้า=3, SIZE=4
  const BANNER_LABEL_COL = 1 // JOB/เลขที่
  const BANNER_LABEL_SPAN = 4 // JOB+ลักษณะงาน+ลูกค้า+SIZE
  // banner rows: วันที่ = เลขวัน, label ที่ JOB (merge 4 คอลัมน์), ที่เหลือว่าง
  const bannerRows = banners.map((b) => {
    const cells: (string | number)[] = Array(totalCols).fill('')
    cells[0] = String(b.day) // คอลัมน์วันที่
    cells[BANNER_LABEL_COL] = b.label // JOB+ลักษณะงาน+ลูกค้า+SIZE (merge)
    return { day: b.day, cells, isBanner: true }
  })

  // รวม jobs + banners เรียงตามวันที่
  const jobRowsTagged = jobRows.map((r) => ({ ...r, isBanner: false }))
  const merged = [...jobRowsTagged, ...bannerRows].sort((a, b) => a.day - b.day)
  const dataRows = merged.map((row) => row.cells)

  const aoa = [
    [`รายการงานวิ่ง - ${vehicleNumber ? `${driverName} ${vehicleNumber}` : driverName} - เดือน ${dayjs(month).format('MMMM YYYY')}`],
    colHeaders,
    ...dataRows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Merge title row across all columns + merge JOB+ลักษณะงาน+ลูกค้า+SIZE สำหรับแถว banner
  // dataRows เริ่มที่แถว index 2 (row 0 = title, row 1 = colHeaders)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colHeaders.length - 1 } },
    ...merged
      .map((row, idx) =>
        row.isBanner
          ? { s: { r: idx + 2, c: BANNER_LABEL_COL }, e: { r: idx + 2, c: BANNER_LABEL_COL + BANNER_LABEL_SPAN - 1 } }
          : null
      )
      .filter((m): m is { s: { r: number; c: number }; e: { r: number; c: number } } => m !== null),
  ]

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 8 },
    { wch: 16 }, { wch: 16 }, { wch: 16 },
    ...(isAdmin ? [{ wch: 10 }, { wch: 12 }] : []),
    { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, ...Array(maxTransfers).fill({ wch: 12 }), { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 30 },
    { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 16 },
    { wch: 8 }, { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'งาน')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
