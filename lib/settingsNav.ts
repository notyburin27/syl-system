/**
 * หน้า "ตั้งค่าข้อมูล" และ role ที่เข้าได้ — แหล่งเดียวของทั้งเมนู (SettingsNav), ด่านของหน้า และ API
 * ใช้ได้ทั้ง server และ client (ไม่มี import ฝั่ง server)
 */

/** ข้อมูลหลัก + ค่าคืนตู้รับตู้ */
export const MASTER_DATA_ROLES: readonly string[] = ['ADMIN', 'MANAGER', 'SENIOR_STAFF']
/** อัตรา / น้ำมัน / วันหยุด */
export const RATE_ROLES: readonly string[] = ['ADMIN', 'MANAGER']

/** เฉพาะ ADMIN — หน้าค่าที่ยังขาด (ใช้กับ /api/rates/missing) */
export const ADMIN_ROLES: readonly string[] = ['ADMIN']

interface SettingsPage {
  href: string
  label: string
  roles: readonly string[]
}

export const SETTINGS_GROUPS: { label: string; pages: SettingsPage[] }[] = [
  {
    label: 'ข้อมูลหลัก',
    pages: [
      { href: '/jobs/settings/customers', label: 'ลูกค้า', roles: MASTER_DATA_ROLES },
      { href: '/jobs/settings/drivers', label: 'คนขับรถ', roles: MASTER_DATA_ROLES },
      { href: '/jobs/settings/locations', label: 'สถานที่', roles: MASTER_DATA_ROLES },
    ],
  },
  {
    label: 'อัตรา',
    pages: [
      { href: '/jobs/settings/rates/transfer', label: 'ค่าคืนตู้รับตู้', roles: MASTER_DATA_ROLES },
      { href: '/jobs/settings/rates/income', label: 'ค่าขนส่ง', roles: RATE_ROLES },
      { href: '/jobs/settings/rates/driver-wage', label: 'ค่าเที่ยวคนขับ', roles: RATE_ROLES },
      { href: '/jobs/settings/rates/missing', label: 'ค่าที่ยังขาด', roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'น้ำมัน',
    pages: [
      { href: '/jobs/settings/fuel-price', label: 'ราคาน้ำมัน', roles: RATE_ROLES },
      { href: '/jobs/settings/fuel-standard', label: 'น้ำมันมาตรฐาน', roles: RATE_ROLES },
    ],
  },
  {
    label: 'อื่นๆ',
    pages: [{ href: '/jobs/settings/holidays', label: 'วันหยุดบริษัท', roles: RATE_ROLES }],
  },
]

/** หน้าแรกเมื่อกดเมนู "ตั้งค่าข้อมูล" */
export const DEFAULT_SETTINGS_PATH = SETTINGS_GROUPS[0].pages[0].href

export function visibleGroups(role: string | undefined) {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    pages: g.pages.filter((p) => !!role && p.roles.includes(role)),
  })).filter((g) => g.pages.length > 0)
}

/** role ที่เข้าหน้านั้นได้ — ไม่พบหน้า = ไม่มีใครเข้าได้ */
export function settingsPageRoles(href: string): readonly string[] {
  return SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.href === href)?.roles ?? []
}
