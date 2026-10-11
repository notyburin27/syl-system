'use client'

import { useCallback, useEffect, useState } from 'react'
import { App } from 'antd'
import type { InsurerDto, VehicleListItemDto } from '@/types/renewals'
import { getJson } from './api'

/** รายชื่อบริษัทประกัน ตัวแทน และรถ สำหรับตัวเลือกในฟอร์มงวด */
export function useRenewalLookups() {
  const { message } = App.useApp()
  const [insurers, setInsurers] = useState<InsurerDto[]>([])
  const [vehicles, setVehicles] = useState<VehicleListItemDto[]>([])
  const [agents, setAgents] = useState<string[]>([])
  /** เพิ่มหลังบันทึกงวด — ตัวแทนชื่อใหม่จะขึ้นเป็นตัวเลือกครั้งต่อไป */
  const [agentsVersion, setAgentsVersion] = useState(0)

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

  useEffect(() => {
    let cancelled = false
    getJson<string[]>('/api/renewals/agents').then((res) => {
      // ตัวเลือกเสริม — โหลดไม่ได้ก็ยังพิมพ์เองได้ จึงไม่แจ้ง error
      if (!cancelled && res.ok) setAgents(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [agentsVersion])

  const reloadAgents = useCallback(() => setAgentsVersion((n) => n + 1), [])

  return { insurers, vehicles, agents, reloadAgents }
}
