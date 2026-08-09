import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../services/auth'
import { familyApi } from '../../services/tasks'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import type { FamilyChild } from '../../types'

export default function ParentSettingsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const addToast = useToastStore((s) => s.addToast)

  const [children, setChildren] = useState<FamilyChild[]>([])
  const [bindName, setBindName] = useState('')
  const [binding, setBinding] = useState(false)

  // 改密码
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const fetchChildren = useCallback(async () => {
    try {
      const res = await familyApi.children()
      setChildren(res.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchChildren() }, [fetchChildren])

  const handleBind = async () => {
    if (!bindName.trim()) return
    setBinding(true)
    try {
      const res = await familyApi.bind(bindName.trim())
      addToast(`已向「${res.data.student_display_name}」发起绑定，待孩子确认`, 'success')
      setBindName('')
      fetchChildren()
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '绑定失败', 'error')
    } finally {
      setBinding(false)
    }
  }

  const handleUnbind = async (c: FamilyChild) => {
    if (!window.confirm(`解绑「${c.display_name || c.username}」？`)) return
    try {
      await familyApi.unbind(c.id)
      addToast('已解绑', 'success')
      fetchChildren()
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '操作失败', 'error')
    }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { addToast('新密码至少8位', 'error'); return }
    if (newPassword !== confirmPassword) { addToast('两次密码不一致', 'error'); return }
    setPwSaving(true)
    try {
      await authApi.changePassword(oldPassword, newPassword)
      addToast('密码已更新', 'success')
      setOldPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '密码修改失败', 'error')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-5">⚙️ 设置</h1>

      {/* 账户信息 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {user?.username?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-800">{user?.display_name || user?.username}</div>
            <div className="text-xs text-blue-600">家长账号</div>
          </div>
        </div>
      </div>

      {/* 关联孩子 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">关联孩子</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={bindName}
            onChange={(e) => setBindName(e.target.value)}
            placeholder="输入孩子用户名发起绑定"
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
          />
          <button onClick={handleBind} disabled={binding}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:opacity-50">
            {binding ? '...' : '绑定'}
          </button>
        </div>
        {children.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">还没有关联孩子</p>
        ) : (
          <div className="space-y-2">
            {children.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👧</span>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{c.display_name || c.username}</div>
                    <div className="text-xs text-gray-400">{c.username}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                    {c.status === 'active' ? '已关联' : '待确认'}
                  </span>
                  <button onClick={() => handleUnbind(c)} className="text-xs text-red-500 px-2 py-1 rounded-lg bg-red-50 active:bg-red-100">
                    解绑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 改密码 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">修改密码</h2>
        <div className="space-y-2.5">
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="当前密码"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码（至少8位）"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认新密码"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
          <button onClick={handleChangePassword} disabled={pwSaving}
            className="w-full py-3 bg-gray-800 text-white rounded-xl text-sm font-medium active:bg-gray-900 disabled:opacity-50">
            {pwSaving ? '提交中...' : '确认修改'}
          </button>
        </div>
      </div>

      {/* 成就入口 */}
      <button onClick={() => navigate('/parent/achievements')}
        className="w-full bg-white rounded-2xl p-4 shadow-sm mb-4 flex items-center justify-between active:bg-gray-50">
        <span className="text-sm text-gray-700">🏅 我的成就</span>
        <span className="text-gray-300">›</span>
      </button>

      {/* 退出 */}
      <button
        onClick={() => { if (window.confirm('确定退出登录？')) logout() }}
        className="w-full py-3.5 bg-white text-red-600 rounded-2xl shadow-sm text-sm font-medium active:bg-red-50">
        🚪 退出登录
      </button>
    </div>
  )
}
