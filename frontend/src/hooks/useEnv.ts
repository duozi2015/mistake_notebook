import { useState, useEffect } from 'react'
import api from '../services/api'

interface EnvInfo {
  environment: string
  hostname: string
  commit: string
}

export function useEnv() {
  const [env, setEnv] = useState<EnvInfo | null>(null)

  useEffect(() => {
    api.get<EnvInfo>('/auth/health')
      .then((res) => setEnv(res.data))
      .catch(() => setEnv({ environment: 'development', hostname: 'unknown', commit: 'unknown' }))
  }, [])

  return env
}