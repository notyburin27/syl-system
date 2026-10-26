import { redirect } from 'next/navigation'
import { DEFAULT_SETTINGS_PATH } from '@/lib/settingsNav'

export default function SettingsIndexPage() {
  redirect(DEFAULT_SETTINGS_PATH)
}
