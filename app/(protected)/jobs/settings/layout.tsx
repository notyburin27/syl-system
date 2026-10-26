import { auth } from '@/lib/auth'
import SettingsNav from '@/components/jobs/SettingsNav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, alignItems: 'stretch', alignContent: 'flex-start' }}>
      <SettingsNav role={session?.user?.role} />
      {/* basis 320px: จอเล็กที่เมนูเป็น dropdown เต็มแถว เนื้อหาจะตกบรรทัดใหม่แทนที่จะถูกบีบเหลือ 0
          minWidth 0: ตารางกว้างเลื่อนแนวนอนในตัวเอง ไม่ดันเมนูข้างตกบรรทัด */}
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>{children}</div>
    </div>
  )
}
