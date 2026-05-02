import * as XLSX from 'xlsx'
import type { Job } from '@/types/job'
import { JOB_TYPES } from '@/types/job'
import dayjs from 'dayjs'
import 'dayjs/locale/th'

dayjs.locale('th')

function computeDriverOverall(job: Job): number | null {
  const hasAny = job.advance || job.toll || job.pickupFee || job.returnFee || job.liftFee || job.storageFee || job.tire || job.other
  if (!hasAny) return null
  return (
    Number(job.advance || 0) +
    Number(job.toll || 0) +
    Number(job.pickupFee || 0) +
    Number(job.returnFee || 0) +
    Number(job.liftFee || 0) +
    Number(job.storageFee || 0) +
    Number(job.tire || 0) +
    Number(job.other || 0)
  )
}

function computeDifference(job: Job): number | null {
  if (!job.actualTransfer) return null
  const overall = computeDriverOverall(job)
  if (overall === null) return null
  return overall - Number(job.actualTransfer)
}

function computeTotal(job: Job): number | null {
  if (!job.actualTransfer) return null
  const diff = computeDifference(job) ?? 0
  return Number(job.actualTransfer) + diff
}

function getJobTypeLabel(value: string): string {
  return JOB_TYPES.find((t) => t.value === value)?.label ?? value
}

type JobWithRelations = Job & {
  customer?: { name: string } | null
  pickupLocation?: { name: string } | null
  factoryLocation?: { name: string } | null
  returnLocation?: { name: string } | null
}

export function generateJobsExcel(
  jobs: JobWithRelations[],
  driverName: string,
  month: string,
  vehicleNumber?: string,
): Buffer {
  const groupHeaders = [
    'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน', 'ข้อมูลงาน',
    'สถานที่', 'สถานที่', 'สถานที่',
    'การเงินหลัก', 'การเงินหลัก', 'การเงินหลัก',
    'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ', 'ค่าใช้จ่ายคนขับ',
    'สรุป', 'สรุป', 'สรุป',
    'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์', 'น้ำมัน/ไมล์',
    'สถานะ',
  ]

  const colHeaders = [
    '#', 'JOB/เลขที่', 'วันที่', 'ลักษณะงาน', 'ลูกค้า', 'SIZE',
    'สถานที่รับตู้', 'โรงงาน', 'สถานที่คืนตู้',
    'รายได้', 'ค่าเที่ยวคนขับ', 'ยอดโอนครั้งแรก',
    'เบิกล่วงหน้า', 'ค่าทางด่วน', 'ค่ารับตู้', 'ค่าคืนตู้', 'ค่ายกตู้', 'ค่าฝากตู้', 'ค่ายาง', 'อื่นๆ',
    'รวมคนรถปิดงาน', 'ส่วนต่าง', 'รวมยอดโอน',
    'ไมล์รถ', 'น้ำมัน OFF (ลิตร)', 'น้ำมันสด (ลิตร)', 'น้ำมันสด (฿)', 'น้ำมันเครดิต (ลิตร)', 'น้ำมันเครดิต (฿)',
    'เคลียร์',
  ]

  const dataRows = jobs.map((job, idx) => [
    idx + 1,
    job.jobNumber,
    job.jobDate ? dayjs(job.jobDate).format('DD/MM/YYYY') : '',
    getJobTypeLabel(job.jobType),
    job.customer?.name ?? '',
    job.size ?? '',
    job.pickupLocation?.name ?? '',
    job.factoryLocation?.name ?? '',
    job.returnLocation?.name ?? '',
    job.income != null ? Number(job.income) : '',
    job.driverWage != null ? Number(job.driverWage) : '',
    job.actualTransfer != null ? Number(job.actualTransfer) : '',
    job.advance != null ? Number(job.advance) : '',
    job.toll != null ? Number(job.toll) : '',
    job.pickupFee != null ? Number(job.pickupFee) : '',
    job.returnFee != null ? Number(job.returnFee) : '',
    job.liftFee != null ? Number(job.liftFee) : '',
    job.storageFee != null ? Number(job.storageFee) : '',
    job.tire != null ? Number(job.tire) : '',
    job.other != null ? Number(job.other) : '',
    computeDriverOverall(job) ?? '',
    computeDifference(job) ?? '',
    computeTotal(job) ?? '',
    job.mileage != null ? Number(job.mileage) : '',
    job.fuelOfficeLiters != null ? Number(job.fuelOfficeLiters) : '',
    job.fuelCashLiters != null ? Number(job.fuelCashLiters) : '',
    job.fuelCashAmount != null ? Number(job.fuelCashAmount) : '',
    job.fuelCreditLiters != null ? Number(job.fuelCreditLiters) : '',
    job.fuelCreditAmount != null ? Number(job.fuelCreditAmount) : '',
    job.clearStatus ? '✓' : '',
  ])

  const aoa = [
    [`รายการงานวิ่ง - ${vehicleNumber ? `${driverName} ${vehicleNumber}` : driverName} - เดือน ${dayjs(month).format('MMMM YYYY')}`],
    colHeaders,
    ...dataRows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Merge title row across all columns
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colHeaders.length - 1 } }]

  // Column widths
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 8 },
    { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 10 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 16 },
    { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'งาน')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
