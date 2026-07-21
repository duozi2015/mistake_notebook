import { useState, useEffect, useCallback, useRef } from 'react'
import { adminApi, type AdminSettings } from '../../services/admin'

type PageState = 'loading' | 'loaded' | 'error'

export default function AdminPanel() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [toggling, setToggling] = useState(false)
  const [copying, setCopying] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ──────────────── Fetch settings ──────────────── */
  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await adminApi.getSettings()
      setSettings(data)
      setPageState('loaded')
    } catch {
      setPageState('error')
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    // 每 60 秒轮询一次，检查邀请码过期状态
    pollingRef.current = setInterval(fetchSettings, 60000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [fetchSettings])

  /* ──────────────── Toggle registration mode ──────────────── */
  const handleToggleMode = async () => {
    if (!settings) return
    setToggling(true)
    const newMode = settings.registration_mode === 'open' ? 'invite_only' : 'open'
    try {
      const { data } = await adminApi.setRegistrationMode(newMode)
      setSettings(data)
    } catch {
      // Ignore error — will refresh on next poll
    } finally {
      setToggling(false)
    }
  }

  /* ──────────────── Copy invite code ──────────────── */
  const handleCopyCode = async () => {
    if (!settings?.invite_code?.code) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(settings.invite_code.code)
      setTimeout(() => setCopying(false), 2000)
    } catch {
      setCopying(false)
    }
  }

  /* ──────────────── Refresh invite code ──────────────── */
  const handleRefreshCode = async () => {
    try {
      const { data } = await adminApi.refreshInviteCode()
      setSettings((prev) => prev ? { ...prev, invite_code: data } : prev)
    } catch {
      // Ignore
    }
  }

  /* ──────────────── Remaining time display ──────────────── */
  const getRemainingText = (seconds: number): string => {
    if (seconds <= 0) return '已过期'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `还剩 ${days}天 ${hours}小时 ${mins}分钟`
    if (hours > 0) return `还剩 ${hours}小时 ${mins}分钟`
    return `还剩 ${mins}分钟`
  }

  /* ──────────────── Copy button label ──────────────── */
  const copyBtnLabel = copying ? '✅ 已复制' : '📋 复制邀请码'

  /* ──────────────── Loading skeleton ──────────────── */
  if (pageState === 'loading') {
    return (
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <div className="h-4 w-16 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="h-10 bg-gray-100 rounded-xl animate-pulse mb-3" />
        <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  /* ──────────────── Error state ──────────────── */
  if (pageState === 'error') {
    return (
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          管理员
        </h2>
        <div className="text-center py-4">
          <p className="text-sm text-red-500 mb-3">加载管理员设置失败</p>
          <button
            onClick={fetchSettings}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium min-h-[36px]"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  /* ──────────────── Loaded state ──────────────── */
  const isInviteOnly = settings?.registration_mode === 'invite_only'
  const inviteCode = settings?.invite_code

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
        管理员
      </h2>

      {/* ── Registration mode toggle ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">注册管理</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isInviteOnly ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
          }`}>
            {isInviteOnly ? '仅邀请码' : '普通注册'}
          </span>
        </div>
        <div className="text-xs text-gray-500 mb-3">
          当前模式：{isInviteOnly ? '用户需要邀请码才能注册' : '所有用户可自由注册'}
        </div>
        <button
          onClick={handleToggleMode}
          disabled={toggling}
          className="w-full py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 font-medium active:bg-gray-100 disabled:opacity-50 min-h-[40px] transition-colors"
        >
          {toggling ? '切换中...' : isInviteOnly ? '🔓 切换为普通注册' : '🔒 切换为仅邀请码注册'}
        </button>
      </div>

      {/* ── Invite code section (only in invite_only mode) ── */}
      {isInviteOnly && inviteCode && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">当前邀请码</span>
            <button
              onClick={handleRefreshCode}
              className="text-xs text-blue-600 font-medium active:text-blue-800 min-h-[28px] px-2"
            >
              🔄 刷新
            </button>
          </div>

          {/* Code display */}
          <div className="bg-gray-50 rounded-xl p-4 mb-3">
            <div className="text-center">
              <div className="text-3xl font-bold tracking-[0.3em] text-gray-800 select-all mb-2 font-mono">
                {inviteCode.code}
              </div>
              <div className="text-xs text-gray-500">
                {getRemainingText(inviteCode.remaining_seconds)}
              </div>
            </div>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopyCode}
            className={`w-full py-2.5 rounded-xl text-sm font-medium min-h-[40px] transition-all ${
              copying
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-600 text-white active:bg-blue-700'
            }`}
          >
            {copyBtnLabel}
          </button>
        </div>
      )}
    </div>
  )
}
