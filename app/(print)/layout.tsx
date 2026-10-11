import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

// หน้าสำหรับพิมพ์ (เปิดในแท็บใหม่) — ไม่มี sidebar/header ของ (protected) แต่ยังต้องล็อกอิน
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  return <>{children}</>
}
