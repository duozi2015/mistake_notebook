import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../services/auth'
import { useToastStore } from '../../stores/toastStore'

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (form.username.length < 3) errs.username = '用户名至少3个字符'
    if (form.password.length < 8) errs.password = '密码至少8位字符'
    if (form.password !== form.confirmPassword) errs.confirmPassword = '两次密码不一致'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await authApi.register({
        username: form.username.trim(),
        password: form.password,
        display_name: form.displayName.trim() || undefined,
      })
      setSuccess(true)
      addToast('注册成功，请登录', 'success')
      setTimeout(() => navigate('/login'), 1500)
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || '注册失败'
      if (msg.includes('已存在')) setErrors({ username: msg })
      else addToast(msg, 'error')
    } finally { setLoading(false) }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-800">注册成功！</h1>
          <p className="text-gray-500 mt-2">正在跳转登录页...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📝</div>
          <h1 className="text-2xl font-bold text-gray-800">创建账号</h1>
          <p className="text-gray-500 mt-1">首次使用，请注册管理员账号</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <FormField label="用户名" error={errors.username} placeholder="3-20位字符" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <FormField label="显示名称" error={errors.displayName} placeholder="页面顶部显示的名称" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
          <FormField label="密码" type="password" error={errors.password} placeholder="至少8位字符" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <FormField label="确认密码" type="password" error={errors.confirmPassword} placeholder="再次输入密码" value={form.confirmPassword} onChange={(v) => setForm({ ...form, confirmPassword: v })} />
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-base disabled:opacity-50 active:bg-blue-700">
            {loading ? '注册中...' : '✅ 注册'}
          </button>
          <div className="text-center text-sm text-gray-500">
            已有账号？<Link to="/login" className="text-blue-600 font-medium">去登录 →</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, type = 'text', error, placeholder, value, onChange }: {
  label: string; type?: string; error?: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}