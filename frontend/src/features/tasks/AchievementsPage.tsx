import { useEffect, useState } from 'react'
import { achievementsApi } from '../../services/tasks'
import { useAuthStore } from '../../stores/authStore'
import type { Achievement } from '../../types'

export default function AchievementsPage() {
  const user = useAuthStore((s) => s.user)
  const [items, setItems] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    achievementsApi.list()
      .then((r) => setItems(r.data.data))
      .finally(() => setLoading(false))
  }, [])

  const unlocked = items.filter((i) => i.unlocked).length

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-1">🏅 成就</h1>
      <p className="text-xs text-gray-400 mb-4">
        {user?.role === 'parent' ? '陪伴孩子的坚持，值得被记录' : '坚持维护错题本、完成每日任务，解锁徽章'}
      </p>

      {loading ? (
        <div className="grid grid-cols-3 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">已解锁</span>
              <span className="text-sm font-bold text-blue-600">{unlocked} / {items.length}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all" style={{ width: `${items.length ? (unlocked / items.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {items.map((a) => (
              <div key={a.code} className={`rounded-2xl p-3.5 shadow-sm ${a.unlocked ? 'bg-white' : 'bg-gray-50'}`}>
                <div className={`text-3xl mb-1.5 ${a.unlocked ? '' : 'opacity-30 grayscale'}`}>{a.emoji}</div>
                <div className={`text-sm font-semibold ${a.unlocked ? 'text-gray-800' : 'text-gray-400'}`}>{a.title}</div>
                <div className="text-xs text-gray-400 mt-0.5 mb-2">{a.desc}</div>
                {a.unlocked ? (
                  <div className="text-xs text-green-600 font-medium">✓ 已解锁</div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-400 rounded-full" style={{ width: `${Math.min((a.progress / a.target) * 100, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400">{a.progress}/{a.target}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
