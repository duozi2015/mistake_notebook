import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { authApi } from '../../services/auth'
import { familyApi } from '../../services/tasks'
import AdminPanel from './AdminPanel'

function msgOf(err: unknown): string {
  return err && typeof err === 'object' && 'response' in err
    ? (err as { response: { data?: { detail?: { message?: string } } } }).response?.data?.detail?.message ?? ''
    : ''
}

type UserState = 'loading' | 'loaded' | 'error'
type PageState = 'idle' | 'passwordChanging' | 'passwordSuccess' | 'passwordError'

export default function SettingsPage() {
  const { user, setUser, logout } = useAuthStore()
  const addToast = useToastStore((s) => s.addToast)
  const [userState, setUserState] = useState<UserState>(user ? 'loaded' : 'loading')

  // 从后端获取用户信息
  useEffect(() => {
    if (!user) return
    authApi.me()
      .then(({ data }) => {
        setUser(data)
        setUserState('loaded')
      })
      .catch(() => setUserState(user ? 'loaded' : 'error'))
  }, [])

  // ── 家庭：待确认请求 + 已绑定家长 ──
  const [parentRequests, setParentRequests] = useState<{ id: number; username: string; display_name: string }[]>([])
  const [myParents, setMyParents] = useState<{ id: number; username: string; display_name: string; status: string }[]>([])

  const refreshFamily = () => {
    familyApi.requests().then((r) => setParentRequests(r.data)).catch(() => {})
    familyApi.me().then((r) => setMyParents(r.data)).catch(() => {})
  }
  useEffect(() => { refreshFamily() }, [])

  const handleConfirm = async (id: number) => {
    try {
      await familyApi.confirm(id)
      addToast('已同意绑定', 'success')
      refreshFamily()
    } catch (err: unknown) {
      addToast(msgOf(err) || '操作失败', 'error')
    }
  }
  const handleReject = async (id: number) => {
    try {
      await familyApi.unbind(id)
      addToast('已拒绝', 'info')
      refreshFamily()
    } catch (err: unknown) {
      addToast(msgOf(err) || '操作失败', 'error')
    }
  }

  // Password change form state
  const [pageState, setPageState] = useState<PageState>('idle')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ──────────────── Password validation ──────────────── */
  const validatePasswordForm = (): string | null => {
    if (!oldPassword.trim()) return '请输入当前密码'
    if (newPassword.length < 8) return '新密码至少需要8个字符'
    if (newPassword !== confirmPassword) return '两次输入的新密码不一致'
    return null
  }

  /* ──────────────── Password change handler ──────────────── */
  const handleChangePassword = async () => {
    const validationError = validatePasswordForm()
    if (validationError) {
      setPasswordError(validationError)
      return
    }
    setPasswordError('')
    setIsSubmitting(true)
    try {
      await authApi.changePassword(oldPassword, newPassword)
      setPageState('passwordSuccess')
      setShowPasswordForm(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPageState('idle'), 3000)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { detail?: { message?: string } } } }).response?.data?.detail?.message || '密码修改失败，请重试'
          : '密码修改失败，请重试'
      setPasswordError(msg)
      setPageState('passwordError')
    } finally {
      setIsSubmitting(false)
    }
  }

  /* ──────────────── Logout handler ──────────────── */
  const handleLogout = () => {
    const confirmed = window.confirm('确定要退出登录吗？')
    if (confirmed) {
      logout()
    }
  }

  /* ──────────────── Loading skeleton ──────────────── */
  if (userState === 'loading') {
    return (
      <div className="pb-6">
        {/* Header skeleton */}
        <div className="h-7 w-24 bg-gray-200 rounded animate-pulse mb-6" />

        {/* User info card skeleton */}
        <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-200 rounded-full animate-pulse" />
            <div className="flex-1">
              <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Account section skeleton */}
        <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse mb-3" />
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        </div>

        {/* About section skeleton */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  /* ──────────────── Error state ──────────────── */
  if (userState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="text-6xl mb-5">😵</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">加载失败</h2>
        <p className="text-gray-500 text-center mb-8">无法获取用户信息，请检查网络后重试</p>
        <button
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          重新加载
        </button>
      </div>
    )
  }

  /* ──────────────── Loaded state ──────────────── */
  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <h1 className="text-xl font-bold text-gray-800 mb-5">⚙️ 设置</h1>

      {/* ── Password change success toast ── */}
      {pageState === 'passwordSuccess' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-2">
          <span className="text-green-600 text-sm">✅ 密码已更新</span>
        </div>
      )}

      {/* ── Password change error toast ── */}
      {pageState === 'passwordError' && passwordError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-2">
          <span className="text-red-600 text-sm">❌ {passwordError}</span>
        </div>
      )}

      {/* ── User info card ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          用户信息
        </h2>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm">
            {user?.username?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-gray-800 truncate">
              {user?.username ?? '未知用户'}
            </div>
            <div className="text-sm text-gray-500 truncate">
              {user?.display_name ?? ''}
            </div>
          </div>
        </div>
      </div>

      {/* ── Account section ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          账号
        </h2>

        {/* Change password button / inline form */}
        <div className="mb-3">
          {!showPasswordForm ? (
            <button
              onClick={() => {
                setShowPasswordForm(true)
                setPasswordError('')
              }}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-700 active:bg-gray-100 min-h-[48px] transition-colors"
            >
              <span className="text-base">🔑</span>
              <span>修改密码</span>
            </button>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">修改密码</span>
                <button
                  onClick={() => {
                    setShowPasswordForm(false)
                    setPasswordError('')
                    setOldPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  className="text-xs text-gray-400 active:text-gray-600 min-h-[32px] px-2"
                >
                  取消
                </button>
              </div>

              {/* Old password */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">当前密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入当前密码"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[44px]"
                />
              </div>

              {/* New password */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">新密码（至少8位）</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[44px]"
                />
              </div>

              {/* Confirm password */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[44px]"
                />
              </div>

              {/* Validation error */}
              {passwordError && pageState !== 'passwordError' && (
                <p className="text-xs text-red-500">{passwordError}</p>
              )}

              {/* Submit button */}
              <button
                onClick={handleChangePassword}
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed min-h-[44px] transition-colors"
              >
                {isSubmitting ? '提交中...' : '确认修改'}
              </button>
            </div>
          )}
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl text-sm text-red-600 active:bg-red-50 min-h-[48px] transition-colors"
        >
          <span className="text-base">🚪</span>
          <span>退出登录</span>
        </button>
      </div>

      {/* ── 家庭 ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          家庭
        </h2>

        {parentRequests.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-2">待确认的绑定请求</div>
            {parentRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl mb-2">
                <div>
                  <div className="text-sm text-gray-800 font-medium">👨‍👩‍👧 {r.display_name || r.username}</div>
                  <div className="text-xs text-gray-400">请求与你关联</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleConfirm(r.id)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium active:bg-green-700">
                    同意
                  </button>
                  <button onClick={() => handleReject(r.id)} className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-medium active:bg-gray-300">
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {myParents.length === 0 ? (
          <p className="text-sm text-gray-400">暂无绑定家长</p>
        ) : (
          <div className="space-y-2">
            {myParents.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <div className="text-sm text-gray-800 font-medium">👨‍👩‍👧 {p.display_name || p.username}</div>
                  <div className="text-xs text-gray-400">{p.username}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                    {p.status === 'active' ? '已关联' : '待确认'}
                  </span>
                  {p.status === 'active' && (
                    <button onClick={() => handleReject(p.id)} className="text-xs text-red-500 px-2 py-1 rounded-lg bg-red-50 active:bg-red-100">
                      解绑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Admin section (仅管理员 doudou 可见) ── */}
      {user?.username === 'doudou' && <AdminPanel />}

      {/* ── About section ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          关于
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">版本</span>
            <span className="text-sm text-gray-800 font-medium">0.1.0</span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="text-sm text-gray-500 leading-relaxed">
            智能错题本
            <br />
            基于 SM-2 遗忘曲线的智能错题管理系统，帮助你高效复习、巩固知识。
          </div>
        </div>
      </div>
    </div>
  )
}
