import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { createLocalStorage } from '../storage'

test('local storage: put → get → remove → get คืน null', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'renewal-att-'))
  try {
    const storage = createLocalStorage(dir)
    const key = 'vehicle-coverages/2026-10/a.png'
    await storage.put(key, new Uint8Array([1, 2, 3]), 'image/png')
    assert.deepEqual(await storage.get(key), new Uint8Array([1, 2, 3]))
    await storage.remove(key)
    assert.equal(await storage.get(key), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('local storage: key ที่หลุดออกนอกโฟลเดอร์ → throw', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'renewal-att-'))
  try {
    await assert.rejects(createLocalStorage(dir).put('../evil.png', new Uint8Array([1]), 'image/png'), /invalid key/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
