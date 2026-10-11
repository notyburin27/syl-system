const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

// อ่านจำนวนเต็มไม่เกินหลักแสน (0–999,999) ตามหลักภาษาไทย: สิบเอ็ด, ยี่สิบ, หนึ่งสิบ → สิบ
function readUnderMillion(n: number): string {
  const digits = String(n).split('').map(Number)
  let text = ''
  digits.forEach((d, i) => {
    const place = digits.length - 1 - i
    if (d === 0) return
    if (place === 0 && d === 1 && digits.length > 1) text += 'เอ็ด'
    else if (place === 1 && d === 1) text += 'สิบ'
    else if (place === 1 && d === 2) text += 'ยี่สิบ'
    else text += DIGITS[d] + PLACES[place]
  })
  return text
}

function readInteger(n: number): string {
  if (n < 1_000_000) return readUnderMillion(n)
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  return readInteger(millions) + 'ล้าน' + readUnderMillion(rest)
}

/** แปลงจำนวนเงินเป็นตัวอักษรไทย เช่น 1,130.50 → "หนึ่งพันหนึ่งร้อยสามสิบบาทห้าสิบสตางค์" */
export function bahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(satangTotal / 100)
  const satang = satangTotal % 100

  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน'

  const bahtPart = baht > 0 ? readInteger(baht) + 'บาท' : ''
  const satangPart = satang > 0 ? readUnderMillion(satang) + 'สตางค์' : 'ถ้วน'
  return (amount < 0 ? 'ลบ' : '') + bahtPart + satangPart
}
