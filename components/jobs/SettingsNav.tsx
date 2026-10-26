'use client'

import { Grid, Menu, Select } from 'antd'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { visibleGroups } from '@/lib/settingsNav'

export default function SettingsNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const screens = Grid.useBreakpoint()
  const groups = visibleGroups(canManage)
  const selected = groups.flatMap((g) => g.pages).find((p) => pathname?.startsWith(p.href))?.href

  // จอเล็กไม่มีที่วางเมนูด้านข้าง — ยุบเป็น dropdown เหนือเนื้อหา
  // screens ว่างตอน render แรก (SSR) — ถือเป็นจอใหญ่ไว้ก่อน กันเมนูกระพริบบน desktop
  if (screens.md === false) {
    return (
      <Select
        id="settings-nav-select"
        value={selected}
        onChange={(href: string) => router.push(href)}
        style={{ width: '100%', marginBottom: 12 }}
        options={groups.map((g) => ({
          label: g.label,
          options: g.pages.map((p) => ({ value: p.href, label: p.label })),
        }))}
      />
    )
  }

  return (
    <nav
      aria-label="เมนูตั้งค่าข้อมูล"
      style={{ width: 180, flexShrink: 0, borderRight: '1px solid #f0f0f0', marginRight: 16, alignSelf: 'flex-start', position: 'sticky', top: 0 }}
    >
      <Menu
        mode="inline"
        selectedKeys={selected ? [selected] : []}
        style={{ borderInlineEnd: 'none' }}
        items={groups.map((g) => ({
          type: 'group' as const,
          key: g.label,
          label: g.label,
          children: g.pages.map((p) => ({ key: p.href, label: <Link href={p.href}>{p.label}</Link> })),
        }))}
      />
    </nav>
  )
}
