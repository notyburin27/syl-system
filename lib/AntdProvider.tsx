'use client'

import { App, ConfigProvider } from 'antd'
import thTH from 'antd/locale/th_TH'

export default function AntdProvider({
  fontFamily,
  children,
}: {
  fontFamily: string
  children: React.ReactNode
}) {
  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          colorPrimary: '#1890ff',
          fontFamily,
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  )
}
