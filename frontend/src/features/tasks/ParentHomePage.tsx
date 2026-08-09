import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { familyApi } from '../../services/tasks'
import { tasksApi } from '../../services/tasks'
import type { FamilyChild, TaskOverview } from '../../types'
import { useAuthStore } from '../../stores/authStore'

type PageState = 'loading' | 'loaded' | 'error'

export default function ParentHomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [state, setState] = useState<PageState>('loading')
  const [children, setChildren] = useState<FamilyChild[]>([])
  const [overview, setOverview] = useState<TaskOverview[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setState('loading')
    try {
      const [childRes, ovRes] = await Promise.all([familyApi.children(), tasksApi.overview()])
      const active = childRes.data.filter((c) => c.status === 'active')
      setChildren(active)
      const ov = ovRes.data
      setOverview('data' in ov ? ov.data : [])
      if (!selectedId && active.length) setSelectedId(active[0].student_id)
      setState('loaded')
    } catch {
      setState('error')
    }
  }, [selectedId])

  useEffect(() => { fetchData() }, [fetchData])

  if (state === 'loading') {
    return (
      <div className="pb-6 space-y-3">
        <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="py-20 text-center">
        <div className="text-6xl mb-4">😵</div>
        <button onClick={fetchData} className="text-blue-600 font-medium">重新加载</button>
      </div>
    )
  }

  const sel = overview.find((o) => o.student_id === selectedId) ?? overview[0]
  const activeChild = children.find((c) => c.student_id === sel?.student_id)

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">👨‍👩‍👧 家庭任务</h1>
        <span className="text-sm text-gray-500">{user?.display_name || user?.username}</span>
      </div>

      {children.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-5xl mb-3">👶</div>
          <p className="text-gray-700 font-medium mb-1">还没有关联孩子</p>
          <p className="text-sm text-gray-500 mb-4">关联孩子后即可布置任务、查看打卡</p>
          <Link to="/parent/settings" className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium">
            去关联孩子
          </Link>
        </div>
      ) : (
        <>
          {/* 孩子切换 */}
          {children.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
              {children.map((c) => (
                <button
                  key={c.student_id}
                  onClick={() => setSelectedId(c.student_id)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium ${
                    selectedId === c.student_id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {c.display_name || c.username}
                </button>
              ))}
            </div>
          )}

          {/* 今日概览 */}
          {sel && (
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-800">
                  {activeChild?.display_name || sel.display_name} · 今日任务
                </h2>
                <span className="text-xs text-gray-500">完成 {sel.approved}/{sel.total}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all"
                  style={{ width: `${sel.total ? (sel.approved / sel.total) * 100 : 0}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: '待完成', v: sel.pending, c: 'text-gray-600' },
                  { label: '待检查', v: sel.submitted, c: 'text-orange-600' },
                  { label: '需修改', v: sel.rejected, c: 'text-red-600' },
                  { label: '已完成', v: sel.approved, c: 'text-green-600' },
                ].map((it) => (
                  <div key={it.label} className="py-2 bg-gray-50 rounded-xl">
                    <div className={`text-lg font-bold ${it.c}`}>{it.v}</div>
                    <div className="text-xs text-gray-400">{it.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => navigate('/parent/tasks')}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700"
                >
                  管理今日任务
                </button>
                <button
                  onClick={() => navigate('/parent/review')}
                  className="flex-1 py-2.5 bg-orange-50 text-orange-600 rounded-xl text-sm font-medium active:bg-orange-100"
                >
                  去检查 ({sel.submitted})
                </button>
              </div>
            </div>
          )}

          {/* 功能入口 */}
          <div className="grid grid-cols-2 gap-3">
            <Link to="/parent/tasks" className="bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50">
              <div className="text-2xl mb-1">📋</div>
              <div className="text-sm font-semibold text-gray-800">今日任务</div>
              <div className="text-xs text-gray-400 mt-0.5">布置 / 复制 / 调整</div>
            </Link>
            <Link to="/parent/templates" className="bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50">
              <div className="text-2xl mb-1">🔁</div>
              <div className="text-sm font-semibold text-gray-800">周期模板</div>
              <div className="text-xs text-gray-400 mt-0.5">每日 / 每周自动生成</div>
            </Link>
            <Link to="/parent/notebook" className="bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50">
              <div className="text-2xl mb-1">📚</div>
              <div className="text-sm font-semibold text-gray-800">孩子错题本</div>
              <div className="text-xs text-gray-400 mt-0.5">统计 / 复习情况 / 错题</div>
            </Link>
            <Link to="/parent/achievements" className="bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50">
              <div className="text-2xl mb-1">🏅</div>
              <div className="text-sm font-semibold text-gray-800">成就</div>
              <div className="text-xs text-gray-400 mt-0.5">家长激励徽章</div>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
