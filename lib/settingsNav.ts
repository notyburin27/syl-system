/** เมนูรองของหน้า "ตั้งค่าข้อมูล" — ใช้ทั้ง server (redirect หน้าแรก) และ client (SettingsNav) */

interface SettingsPage {
  href: string
  label: string
  /** เห็นได้เฉพาะ ADMIN/MANAGER — SENIOR_STAFF เห็นแค่ข้อมูลหลักกับค่าคืนตู้รับตู้ */
  managerOnly?: boolean
}

export const SETTINGS_GROUPS: { label: string; pages: SettingsPage[] }[] = [
  {
    label: 'ข้อมูลหลัก',
    pages: [
      { href: '/jobs/settings/customers', label: 'ลูกค้า' },
      { href: '/jobs/settings/drivers', label: 'คนขับรถ' },
      { href: '/jobs/settings/locations', label: 'สถานที่' },
    ],
  },
  {
    label: 'อัตรา',
    pages: [
      { href: '/jobs/settings/rates/transfer', label: 'ค่าคืนตู้รับตู้' },
      { href: '/jobs/settings/rates/income', label: 'ค่าขนส่ง', managerOnly: true },
      { href: '/jobs/settings/rates/driver-wage', label: 'ค่าเที่ยวคนขับ', managerOnly: true },
    ],
  },
  {
    label: 'น้ำมัน',
    pages: [
      { href: '/jobs/settings/fuel-price', label: 'ราคาน้ำมัน', managerOnly: true },
      { href: '/jobs/settings/fuel-standard', label: 'น้ำมันมาตรฐาน', managerOnly: true },
    ],
  },
  {
    label: 'อื่นๆ',
    pages: [{ href: '/jobs/settings/holidays', label: 'วันหยุดบริษัท', managerOnly: true }],
  },
]

/** หน้าแรกเมื่อกดเมนู "ตั้งค่าข้อมูล" */
export const DEFAULT_SETTINGS_PATH = SETTINGS_GROUPS[0].pages[0].href

export function visibleGroups(canManage: boolean) {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    pages: g.pages.filter((p) => canManage || !p.managerOnly),
  })).filter((g) => g.pages.length > 0)
}

