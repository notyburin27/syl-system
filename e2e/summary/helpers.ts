import { expect, type Page } from '@playwright/test'

/**
 * เปิด modal เพิ่มคนขับที่ /jobs/settings/drivers
 * ปุ่มมองเห็นก่อน hydrate เสร็จ (dev server compile ช้า) การคลิกก่อนหน้านั้นไม่เปิด modal
 * จึง retry คลิกจนกว่า dialog จะขึ้น
 */
export async function openAddDriverModal(page: Page) {
  await page.goto('/jobs/settings/drivers')
  await expect(async () => {
    await page.getByTestId('add-driver-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}
