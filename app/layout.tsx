import type { Metadata } from 'next'
import { Kanit } from 'next/font/google'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { App, ConfigProvider } from 'antd'
import thTH from 'antd/locale/th_TH'
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
        <AntdRegistry>
          <ConfigProvider
            locale={thTH}
            theme={{
              token: {
                colorPrimary: '#1890ff',
                fontFamily: kanit.style.fontFamily,
              },
            }}
          >
            <App>
              {children}
            </App>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  )
}
