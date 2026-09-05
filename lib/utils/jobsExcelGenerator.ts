import ExcelJS from 'exceljs'
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

const FONT_NAME = 'Angsana New'
const FONT_SIZE = 20
const TITLE_FONT_SIZE = 28
const NUM_FMT = '#,##0'
const DATE_FMT = '[$-1070000]d/m/yy;@' // วันที่แบบไทย (d/m/yy)

// สัดส่วนแบ่งรายได้ที่แสดงเป็นสูตรใต้ตาราง (คนขับ/บริษัท)
const SHARE_RATIOS = [0.55, 0.45]

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

// exceljs เก็บ Date เป็น UTC — ถ้าใช้ new Date(local) วันที่จะเลื่อนตาม timezone ของเครื่อง
// (ไทย UTC+7 → ย้อนไป 1 วัน) จึงประกอบเป็น UTC midnight ให้ตรงวันเสมอ
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function getJobTypeLabel(value: string): string {
  return JOB_TYPES.find((t) => t.value === value)?.label ?? value
}

// Advance jobs ("เบิกล่วงหน้า") have no driver settlement, so all summary columns
// (รวมคนรถปิดงาน, ส่วนต่าง, transfers, รวมยอดโอน) are left blank — matches the UI.
function isAdvanceType(job: Job): boolean {
  return job.jobType === 'advance'
}

type ColumnSpec = {
  header: string
  width: number
  /** ใส่ number format #,##0 และรวมยอดในแถวสรุป */
  numeric?: boolean
  /** รวมยอดท้ายตาราง (=SUM ของช่วงข้อมูล) */
  sum?: boolean
}

function buildColumns(isAdmin: boolean, maxTransfers: number): ColumnSpec[] {
  return [
    { header: 'วันที่', width: 11.5 },
    { header: 'JOB/เลขที่', width: 15.7 },
    { header: 'ลักษณะงาน', width: 12.8 },
    { header: 'ลูกค้า', width: 13.2 },
    { header: 'SIZE', width: 8 },
    { header: 'สถานที่รับตู้', width: 15.8 },
    { header: 'โรงงาน', width: 27.3 },
    { header: 'สถานที่คืนตู้', width: 16.2 },
    ...(isAdmin
      ? [
          { header: 'ค่าขนส่ง', width: 11.7, numeric: true, sum: true },
          { header: 'ค่าเที่ยวคนขับ', width: 12, numeric: true, sum: true },
        ]
      : []),
    { header: 'ยกยอด', width: 11.5, numeric: true, sum: true },
    { header: 'เบิกล่วงหน้า', width: 11.5, numeric: true, sum: true },
    { header: 'ค่าทางด่วน', width: 11.5, numeric: true, sum: true },
    { header: 'ค่ารับตู้', width: 9.5, numeric: true, sum: true },
    { header: 'ค่าคืนตู้', width: 9.5, numeric: true, sum: true },
    { header: 'ค่ายกตู้', width: 9.5, numeric: true, sum: true },
    { header: 'ค่าฝากตู้', width: 9.5, numeric: true, sum: true },
    { header: 'ค่ายาง', width: 9.5, numeric: true, sum: true },
    { header: 'อื่นๆ', width: 9.5, numeric: true, sum: true },
    { header: 'รวมคนรถปิดงาน', width: 17, numeric: true, sum: true },
    { header: 'หมายเหตุ', width: 20 },
    { header: 'ไมล์รถ', width: 10.2 },
    { header: 'น้ำมัน OFF (ลิตร)', width: 12.2, numeric: true, sum: true },
    { header: 'น้ำมันสด (ลิตร)', width: 12.2 },
    ...Array.from({ length: maxTransfers }, (_, i) => ({
      header: `โอนครั้งที่ ${i + 1}`,
      width: 11.7,
      numeric: true,
    })),
    { header: 'รวมยอดโอน', width: 12, numeric: true, sum: true },
    { header: 'ส่วนต่าง', width: 10, numeric: true },
    { header: 'ยกยอดไป', width: 14 },
    { header: 'น้ำมันสด (฿)', width: 13 },
    { header: 'น้ำมันเครดิต (ลิตร)', width: 18 },
    { header: 'น้ำมันเครดิต (฿)', width: 16 },
    { header: 'เคลียร์', width: 8 },
    { header: 'ยกเลิก', width: 8 },
  ]
}

export async function generateJobsExcel(
  jobs: JobWithRelations[],
  driverName: string,
  month: string,
  vehicleNumber?: string,
  isAdmin = false,
  banners: ExportBanner[] = [],
): Promise<Buffer> {
  // Max number of completed transfers across all jobs this month → one column per transfer
  const maxTransfers = jobs.reduce((max, job) => (isAdvanceType(job) ? max : Math.max(max, completedTransferAmounts(job).length)), 0)
  const columns = buildColumns(isAdmin, maxTransfers)
  const totalCols = columns.length

  type CellValue = string | number | Date | null
  const jobRows = jobs.map((job) => {
    const advance = isAdvanceType(job)
    const amounts = advance ? [] : completedTransferAmounts(job)
    // One cell per transfer column; blank when this job has fewer transfers than maxTransfers
    const transferCells = Array.from({ length: maxTransfers }, (_, i) => (i < amounts.length ? amounts[i] : null))
    const day = job.jobDate ? dayjs(job.jobDate).date() : 0
    const cells: CellValue[] = [
      job.jobDate ? utcDate(dayjs(job.jobDate).year(), dayjs(job.jobDate).month() + 1, dayjs(job.jobDate).date()) : null,
      job.jobNumber,
      getJobTypeLabel(job.jobType),
      job.customer?.name ?? null,
      job.size ?? null,
      job.pickupLocation?.name ?? null,
      job.factoryLocation?.name ?? null,
      job.returnLocation?.name ?? null,
      ...(isAdmin ? [job.income != null ? Number(job.income) : null, job.driverWage != null ? Number(job.driverWage) : null] : []),
      job.actualTransferPrev != null ? Number(job.actualTransferPrev) : null,
      job.advance != null ? Number(job.advance) : null,
      job.toll != null ? Number(job.toll) : null,
      job.pickupFee != null ? Number(job.pickupFee) : null,
      job.returnFee != null ? Number(job.returnFee) : null,
      job.liftFee != null ? Number(job.liftFee) : null,
      job.storageFee != null ? Number(job.storageFee) : null,
      job.tire != null ? Number(job.tire) : null,
      job.other != null ? Number(job.other) : null,
      advance ? null : computeDriverOverall(job),
      job.remarks ?? null,
      job.mileage != null ? Number(job.mileage) : null,
      job.fuelOfficeLiters != null ? Number(job.fuelOfficeLiters) : null,
      job.fuelCashLiters != null ? Number(job.fuelCashLiters) : null,
      ...transferCells,
      advance ? null : computeTotal(job),
      advance ? null : computeDifference(job),
      advance ? null : (job.carryOverToJob?.jobNumber ?? null),
      job.fuelCashAmount != null ? Number(job.fuelCashAmount) : null,
      job.fuelCreditLiters != null ? Number(job.fuelCreditLiters) : null,
      job.fuelCreditAmount != null ? Number(job.fuelCreditAmount) : null,
      job.clearStatus ? '✓' : null,
      job.isCancelled ? '✓' : null,
    ]
    return { day, cells, isBanner: false }
  })

  // คอลัมน์ index: วันที่=0, JOB=1, ลักษณะงาน=2, ลูกค้า=3, SIZE=4
  const BANNER_LABEL_COL = 1 // JOB/เลขที่
  const BANNER_LABEL_SPAN = 4 // JOB+ลักษณะงาน+ลูกค้า+SIZE
  // banner rows: วันที่ = เลขวัน, label ที่ JOB (merge 4 คอลัมน์), ที่เหลือว่าง
  const [bannerYear, bannerMonth] = month.split('-').map(Number)
  const bannerRows = banners.map((b) => {
    const cells: CellValue[] = Array(totalCols).fill(null)
    cells[0] = utcDate(bannerYear, bannerMonth, b.day)
    cells[BANNER_LABEL_COL] = b.label
    return { day: b.day, cells, isBanner: true }
  })

  // รวม jobs + banners เรียงตามวันที่
  const merged = [...jobRows, ...bannerRows].sort((a, b) => a.day - b.day)

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('งาน')

  ws.columns = columns.map((c) => ({ width: c.width }))

  const TITLE_ROW = 1
  const HEADER_ROW = 2
  const FIRST_DATA_ROW = 3
  const lastDataRow = FIRST_DATA_ROW + merged.length - 1

  // --- Title ---
  const titleRow = ws.getRow(TITLE_ROW)
  titleRow.getCell(1).value = `รายการงานวิ่ง - ${vehicleNumber ? `${driverName} ${vehicleNumber}` : driverName} - เดือน ${dayjs(month).format('MMMM YYYY')}`
  titleRow.getCell(1).font = { name: FONT_NAME, size: TITLE_FONT_SIZE, bold: true }
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  titleRow.height = 62
  ws.mergeCells(TITLE_ROW, 1, TITLE_ROW, totalCols)

  // --- Header ---
  const headerRow = ws.getRow(HEADER_ROW)
  headerRow.height = 30
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col.header
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    }
  })

  // --- Data ---
  merged.forEach((row, idx) => {
    const excelRow = ws.getRow(FIRST_DATA_ROW + idx)
    excelRow.height = 29
    row.cells.forEach((value, i) => {
      const cell = excelRow.getCell(i + 1)
      if (value !== null) cell.value = value
      cell.font = { name: FONT_NAME, size: FONT_SIZE }
      cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      if (i === 0) {
        cell.numFmt = DATE_FMT
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (columns[i].numeric) {
        cell.numFmt = NUM_FMT
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        cell.alignment = { vertical: 'middle' }
      }
    })
    if (row.isBanner) {
      const r = FIRST_DATA_ROW + idx
      ws.mergeCells(r, BANNER_LABEL_COL + 1, r, BANNER_LABEL_COL + BANNER_LABEL_SPAN)
    }
  })

  // --- แถวสรุปท้ายตาราง ---
  // แถวละหนึ่งสัดส่วนแบ่งรายได้ (F = %, G = สูตรหักส่วนที่เหลือจากยอดรวมรายได้)
  // และแถวสุดท้ายรวมทุกคอลัมน์ตัวเลขด้วย =SUM(ช่วงข้อมูล)
  const incomeColIdx = columns.findIndex((c) => c.header === 'ค่าขนส่ง')
  const summaryStartRow = lastDataRow + 1
  const summaryLastRow = summaryStartRow + SHARE_RATIOS.length - 1
  const incomeCol = incomeColIdx >= 0 ? ws.getColumn(incomeColIdx + 1).letter : null

  SHARE_RATIOS.forEach((ratio, i) => {
    const rowIdx = summaryStartRow + i
    const row = ws.getRow(rowIdx)
    row.height = 29

    const ratioCell = row.getCell(6) // คอลัมน์ F
    ratioCell.value = ratio
    ratioCell.numFmt = '0%'
    ratioCell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true }
    ratioCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ratioCell.border = { left: { style: 'thin' }, right: { style: 'thin' } }

    const amountCell = row.getCell(7) // คอลัมน์ G
    if (incomeCol) {
      // ยอดของสัดส่วนนี้ = รายได้รวม − ส่วนของอีกฝ่าย
      const otherPct = Math.round((1 - ratio) * 100)
      amountCell.value = { formula: `${incomeCol}${summaryLastRow}-(${incomeCol}${summaryLastRow}*${otherPct}/100)` }
    }
    amountCell.numFmt = NUM_FMT
    amountCell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true }
    amountCell.alignment = { vertical: 'middle' }
    amountCell.border = { left: { style: 'thin' }, right: { style: 'thin' } }

    ws.mergeCells(rowIdx, 1, rowIdx, 5)
  })

  // แถวรวมยอด (แถวสุดท้ายของกลุ่มสรุป)
  const totalRow = ws.getRow(summaryLastRow)
  columns.forEach((col, i) => {
    if (!col.sum) return
    const cell = totalRow.getCell(i + 1)
    const letter = ws.getColumn(i + 1).letter
    cell.value = { formula: `SUM(${letter}${FIRST_DATA_ROW}:${letter}${lastDataRow})` }
    cell.numFmt = NUM_FMT
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    }
  })

  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
