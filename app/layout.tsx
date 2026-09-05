import type { Metadata } from 'next'
import { Kanit } from 'next/font/google'
import StyledComponentsRegistry from '@/lib/AntdRegistry'
import AntdProvider from '@/lib/AntdProvider'
import './globals.css'

const kanit = Kanit({
  weight: ['300', '400', '500', '600'],
  subsets: ['thai', 'latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ระบบจัดการเอกสารขนส่ง - ทรงยุทธ โลจิสติคส์',
  description: 'ระบบจัดการเอกสารขนส่งสินค้า',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body className={kanit.className}>
        <StyledComponentsRegistry>
          <AntdProvider fontFamily={kanit.style.fontFamily}>
            {children}
          </AntdProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  )
}
