'use client'

import { useEffect, useState } from 'react'
import { App } from 'antd'
import type { InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { getJson } from './api'

/** รายชื่อบริษัทประกันและรถ สำหรับ Select ในฟอร์มงวด */
export function useRenewalLookups() {
  const { message } = App.useApp()
  const [insurers, setInsurers] = useState<InsurerDto[]>([])
  const [vehicles, setVehicles] = useState<VehicleListItemDto[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getJson<InsurerDto[]>('/api/renewals/insurers'),
      getJson<VehicleListItemDto[]>('/api/renewals/vehicles'),
    ]).then(([i, v]) => {
      if (cancelled) return
      if (i.ok) setInsurers(i.data)
      else message.error(i.error)
      if (v.ok) setVehicles(v.data)
      else message.error(v.error)
    })
    return () => {
      cancelled = true
    }
  }, [message])

  return { insurers, vehicles }
}
