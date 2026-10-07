'use client'

import type { Dayjs } from 'dayjs'
import { DatePicker } from 'antd'
import dayjsGenerateConfig from 'rc-picker/lib/generate/dayjs'
import { parseBuddhistInput, toBuddhistFormat } from '@/lib/renewals/buddhistDate'

/**
 * DatePicker ที่แสดงและรับปีเป็น พ.ศ. (ช่องกรอก, หัวปฏิทิน, ช่องเลือกปี) — ค่าใน Form ยังเป็น Dayjs ปี ค.ศ.
 * ใช้เฉพาะเมนูต่ออายุรถ
 */
const ThaiDatePicker = DatePicker.generatePicker<Dayjs>({
  ...dayjsGenerateConfig,
  locale: {
    ...dayjsGenerateConfig.locale,
    format: (locale, date, format) => dayjsGenerateConfig.locale.format(locale, date, toBuddhistFormat(format)),
    parse: (locale, text, formats) => {
      for (const format of formats) {
        const date = parseBuddhistInput(text, format)
        if (date) return date
      }
      return null
    },
  },
})

export default ThaiDatePicker
