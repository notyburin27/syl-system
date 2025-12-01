export default function NotFound() {
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
      <h1 style={{ fontSize: '72px', margin: 0 }}>404</h1>
      <h2>ไม่พบหน้าที่คุณต้องการ</h2>
      <p>ขออภัย หน้าที่คุณกำลังมองหาไม่มีอยู่ในระบบ</p>
      <a href="/" style={{ marginTop: '20px', color: '#1890ff' }}>
        กลับสู่หน้าแรก
      </a>
    </div>
  )
}
