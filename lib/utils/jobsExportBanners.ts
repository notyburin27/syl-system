import { prisma } from '@/lib/prisma'
import { LEAVE_TYPE_LABELS } from '@/types/leave'
import type { ExportBanner } from '@/lib/utils/jobsExcelGenerator'
import dayjs from 'dayjs'

type LeaveRow = { driverId: string; leaveDate: Date; leaveType: string; note: string | null }
type HolidayRow = { holidayDate: Date; name: string }

function dateKey(d: Date | string): string {
  return dayjs(d).format('YYYY-MM-DD')
}

// ประกอบ banner rows ของคนขับหนึ่งคน จากข้อมูลลา/วันหยุดที่ดึงมาแล้ว — กติกาเดียวกับตาราง:
// งานชนะ (วันมีงานไม่ขึ้น banner), วันลาขึ้นเสมอ, banner วันว่างซ่อนถ้าเป็นอนาคต
export function buildBannersFor(
  month: string,
  jobs: { jobDate: Date | string }[],
  leaves: LeaveRow[],
  holidays: HolidayRow[],
): ExportBanner[] {
  const [year, mon] = month.split('-').map(Number)

  const jobDateSet = new Set(jobs.map((j) => dateKey(j.jobDate)))
  const leaveMap = new Map(leaves.map((l) => [dateKey(l.leaveDate), l]))
  const holidayMap = new Map(holidays.map((h) => [dateKey(h.holidayDate), h]))

  const daysInMonth = dayjs(`${month}-01`).daysInMonth()
  const todayKey = dayjs().format('YYYY-MM-DD')

  const banners: ExportBanner[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (jobDateSet.has(key)) continue // งานชนะ

    const leave = leaveMap.get(key)
    if (leave) {
      const noteSuffix = leave.note ? ` — ${leave.note}` : ''
      banners.push({
        day: d,
        label: `${LEAVE_TYPE_LABELS[leave.leaveType as keyof typeof LEAVE_TYPE_LABELS]}${noteSuffix}`,
      })
      continue
    }

    if (key > todayKey) continue // banner วันว่างในอนาคต → ซ่อน

    const holiday = holidayMap.get(key)
    if (holiday) {
      banners.push({ day: d, label: holiday.name })
    } else if (new Date(Date.UTC(year, mon - 1, d)).getUTCDay() === 0) {
      banners.push({ day: d, label: 'วันอาทิตย์' })
    } else {
      banners.push({ day: d, label: 'ไม่มีงาน' })
    }
  }
  return banners
}

// ดึงวันลา (ของ driverIds ที่ระบุ หรือทุกคนเมื่อไม่ระบุ) + วันหยุดของเดือนนั้นในครั้งเดียว
// แล้วจัดกลุ่มวันลาตาม driverId — export ทั้งหมดจึงยิง query แค่ 2 ครั้งไม่ว่ามีคนขับกี่คน
export async function fetchBannerSources(month: string, driverIds?: string[]) {
  const [year, mon] = month.split('-').map(Number)
  const range = { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) }

  const [leaves, holidays] = await Promise.all([
    prisma.driverLeave.findMany({
      where: { ...(driverIds ? { driverId: { in: driverIds } } : {}), leaveDate: range },
    }),
    prisma.companyHoliday.findMany({ where: { holidayDate: range } }),
  ])

  const leavesByDriver = new Map<string, LeaveRow[]>()
  for (const l of leaves) {
    const list = leavesByDriver.get(l.driverId)
    if (list) list.push(l)
    else leavesByDriver.set(l.driverId, [l])
  }

  return { leavesByDriver, holidays }
}
