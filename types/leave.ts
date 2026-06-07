export interface DriverLeave {
  id: string
  driverId: string
  leaveDate: string // ISO date
  leaveType: 'sick' | 'personal' | 'other'
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CompanyHoliday {
  id: string
  holidayDate: string // ISO date
  name: string
  createdAt: string
  updatedAt: string
}

export const LEAVE_TYPE_LABELS: Record<DriverLeave['leaveType'], string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  other: 'อื่นๆ',
}

export const LEAVE_TYPE_OPTIONS = [
  { value: 'sick', label: 'ลาป่วย' },
  { value: 'personal', label: 'ลากิจ' },
  { value: 'other', label: 'อื่นๆ' },
] as const
