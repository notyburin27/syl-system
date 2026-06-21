# Watchdog LINE Push Notification — Design

วันที่: 2026-06-21

## เป้าหมาย

watchdog script (`scripts/check-line-images.ts`) ปัจจุบันบันทึก alert ลง `line_webhook_logs`
อย่างเดียวเมื่อรูป LINE หยุดเข้านานเกิน threshold เพิ่มการส่ง LINE push notification
เพื่อให้ทีมรู้ตัวทันทีโดยไม่ต้องเปิดดู log เอง

## ขอบเขต (ตกลงกับผู้ใช้แล้ว)

- **ช่องทาง**: LINE Messaging API push message (`fetch` ตรงไป `api.line.me`
  pattern เดียวกับ `app/api/line/webhook/route.ts` — ไม่ใช้ LINE SDK)
- **ปลายทาง**: env ตัวเดียว `LINE_ALERT_TARGET_ID` (group หรือ user ID)
- **เงื่อนไขส่ง**: เฉพาะตอนสร้าง alert ใหม่ (ใน branch ที่ผ่าน dedupe แล้ว)
  ไม่ส่งซ้ำทุกรอบที่รัน
- **ข้อความ**: ใช้ `detail` เดียวกับที่บันทึกลง DB (ไม่มี prefix เพิ่ม)

## สถาปัตยกรรม

### Component ใหม่: `lib/linePush.ts`

ฟังก์ชันเดียว แยกออกมาเพื่อให้ reuse และทดสอบได้อิสระจาก watchdog:

```ts
// ส่งข้อความ push เข้า LINE ผ่าน Messaging API
// best-effort: ส่งไม่สำเร็จจะ log ไม่ throw (ไม่ให้ caller พังตาม)
export async function pushLineMessage(text: string): Promise<boolean>
```

พฤติกรรม:
- อ่าน `process.env.LINE_CHANNEL_ACCESS_TOKEN` และ `process.env.LINE_ALERT_TARGET_ID`
- ถ้าขาด token หรือ target → `console.warn` แล้ว return `false` (ไม่ throw)
- `POST https://api.line.me/v2/bot/message/push`
  body: `{ to: targetId, messages: [{ type: 'text', text }] }`
  header: `Authorization: Bearer <token>`
- สำเร็จ (res.ok) → return `true`; ไม่สำเร็จ → `console.error` พร้อม status/body แล้ว return `false`
- ครอบ try/catch ทั้งหมด — network error ก็ return `false` ไม่ throw

### จุดเชื่อมใน watchdog

ใน [scripts/check-line-images.ts](../../../scripts/check-line-images.ts) branch ที่สร้าง alert ใหม่
(หลังเขียน `lineWebhookLog` สำเร็จ บรรทัด ~59) เพิ่ม:

```ts
await pushLineMessage(detail)
```

ไม่แตะ branch `existingAlert` (dedupe) และไม่แตะส่วนลบ log เก่า

## Error handling

`pushLineMessage` เป็น best-effort เหมือน `writeWebhookLog` เดิม — try/catch ภายในทั้งหมด
push ไม่สำเร็จก็แค่ log ไม่ทำให้ watchdog (ที่ต้องลบ log เก่าต่อ) พัง

## Env ที่ต้องเพิ่ม

`LINE_ALERT_TARGET_ID` ใน `.env.stag` และ `.env.prod`
(ค่าจริงผู้ใช้เติมเอง — เป็น group/user ID ปลายทาง)

## Testing

- `npx tsc --noEmit` ต้องผ่าน
- รัน `npx tsx scripts/check-line-images.ts` โดยตั้ง env ชั่วคราว
  ตรวจว่า push เข้า LINE จริง (หรือ mock fetch ถ้าไม่อยากยิงจริง)
