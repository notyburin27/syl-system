import { promises as fs } from 'fs'
import path from 'path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export interface AttachmentStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  remove(key: string): Promise<void>
}

/** เก็บไฟล์ในโฟลเดอร์บนเครื่อง — ใช้ตอน E2E (ATTACHMENT_STORAGE=local) ไม่ให้เทสต์เขียนลง bucket จริง */
export function createLocalStorage(rootDir: string): AttachmentStorage {
  const root = path.resolve(rootDir)
  const fileOf = (key: string) => {
    const file = path.resolve(root, key)
    if (!file.startsWith(root + path.sep)) throw new Error(`invalid key: ${key}`)
    return file
  }
  return {
    async put(key, body) {
      const file = fileOf(key)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, body)
    },
    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(fileOf(key)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    async remove(key) {
      await fs.rm(fileOf(key), { force: true })
    },
  }
}

// โหลด lib/spaces แบบ lazy — ไม่ต้องมี env ของ Spaces ตอนรัน unit test / local storage
async function spaces() {
  return import('@/lib/spaces')
}

/** DigitalOcean Spaces แบบ private — ไม่ใส่ ACL (ต่างจากรูป LINE ที่เป็น public-read) */
const s3Storage: AttachmentStorage = {
  async put(key, body, contentType) {
    const { spacesClient, SPACES_BUCKET } = await spaces()
    await spacesClient.send(new PutObjectCommand({ Bucket: SPACES_BUCKET, Key: key, Body: body, ContentType: contentType }))
  },
  async get(key) {
    const { spacesClient, SPACES_BUCKET } = await spaces()
    try {
      const res = await spacesClient.send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }))
      return res.Body ? await res.Body.transformToByteArray() : null
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null
      throw error
    }
  },
  async remove(key) {
    const { spacesClient, SPACES_BUCKET } = await spaces()
    await spacesClient.send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: key }))
  },
}

export function getAttachmentStorage(): AttachmentStorage {
  if (process.env.ATTACHMENT_STORAGE === 'local') {
    return createLocalStorage(path.join(process.cwd(), '.tmp', 'renewal-attachments'))
  }
  return s3Storage
}

/** ลบไฟล์แบบ best-effort — ไฟล์ค้างใน bucket ไม่ทำให้ระบบพัง จึงแค่ log */
export async function removeObjectsBestEffort(keys: string[]): Promise<void> {
  const storage = getAttachmentStorage()
  for (const key of keys) {
    try {
      await storage.remove(key)
    } catch (error) {
      console.error('[renewals] ลบไฟล์แนบไม่สำเร็จ', key, error)
    }
  }
}
