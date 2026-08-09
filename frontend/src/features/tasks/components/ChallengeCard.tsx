import type { Achievement } from '../../../types'

export function hasNearAchievement(items: Achievement[]): boolean {
  return items.some((a) => !a.unlocked && a.progress > 0 && a.progress_pct >= 80)
}

export function nearestAchievement(items: Achievement[]): Achievement | null {
  const locked = items.filter((a) => !a.unlocked && a.progress > 0)
  if (!locked.length) return null
  return [...locked].sort((a, b) => b.progress_pct - a.progress_pct)[0]
}

interface ChallengeCardProps {
  items: Achievement[]
  onOpen?: () => void
}

export default function ChallengeCard({ items, onOpen }: ChallengeCardProps) {
  const near = nearestAchievement(items)
  const nearCount = items.filter((a) => !a.unlocked && a.progress > 0 && a.progress_pct >= 80).length
  const unlockedCount = items.filter((a) => a.unlocked).length

  return (
    <div
      onClick={onOpen}
      className="bg-white rounded-2xl p-4 shadow-sm mb-3 cursor-pointer active:bg-gray-50"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-800">🔥 今日挑战</span>
        {nearCount > 0 && (
          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium animate-pulse">
            即将达成 {nearCount} 个
          </span>
        )}
      </div>

      {near ? (
        <div className="flex items-center gap-3">
          <div className="text-3xl animate-pulse">{near.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">
              {near.title}
              <span className="text-orange-600 font-bold"> · 还差 {near.remaining} {near.unit}</span>
            </div>
            <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all duration-700"
                style={{ width: `${near.progress_pct}%` }}
              />
            </div>
          </div>
        </div>
      ) : unlockedCount > 0 ? (
        <div className="flex items-center gap-3">
          <div className="text-3xl">🏆</div>
          <div className="text-sm text-gray-600">
            已解锁 <span className="font-bold text-blue-600">{unlockedCount}</span> 枚徽章，继续坚持！
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="text-3xl">🌟</div>
          <div className="text-sm text-gray-600">完成你的第一个任务，解锁第一枚徽章！</div>
        </div>
      )}
    </div>
  )
}
