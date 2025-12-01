'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '72px', margin: 0 }}>เกิดข้อผิดพลาด</h1>
      <h2>ขออภัย เกิดข้อผิดพลาดในระบบ</h2>
      <p style={{ color: '#666', maxWidth: '500px' }}>
        {error.message || 'กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่'}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: '20px',
          padding: '10px 20px',
          backgroundColor: '#1890ff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        ลองใหม่อีกครั้ง
      </button>
    </div>
  )
}
