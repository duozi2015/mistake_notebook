import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface ReviewCompleteState {
  totalCount: number
  reviewedCount: number
  accuracy: number
  distribution: {
    again: number
    hard: number
    good: number
    easy: number
  }
}

const DISTRIBUTION_COLORS: Record<string, string> = {
  again: 'bg-red-400',
  hard: 'bg-orange-400',
  good: 'bg-lime-400',
  easy: 'bg-teal-400',
}

const DISTRIBUTION_LABELS: Record<string, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
}

export default function ReviewCompletePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as ReviewCompleteState | null

  useEffect(() => {
    if (!state) {
      navigate('/', { replace: true })
    }
  }, [state, navigate])

  if (!state) return null

  const { reviewedCount, accuracy, distribution } = state

  const distributionEntries = Object.entries(distribution) as [string, number][]
  const maxCount = Math.max(...distributionEntries.map(([, count]) => count), 1)

  return (
    <div className="fixed inset-0 z-10 bg-gray-50 flex flex-col items-center justify-center px-6">
      {/* Celebration icon */}
      <div className="text-6xl mb-4">🎉</div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-800 mb-1">复习完成！</h1>
      <p className="text-gray-500 mb-8">本次复习 {reviewedCount} 题</p>

      {/* Distribution card */}
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-sm mb-8">
        <h2 className="text-sm font-medium text-gray-500 mb-5">掌握度分布</h2>

        <div className="space-y-4">
          {distributionEntries.map(([key, count]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-12 shrink-0">
                {DISTRIBUTION_LABELS[key] || key}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${DISTRIBUTION_COLORS[key] || 'bg-blue-400'} rounded-full transition-all duration-700`}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-sm text-gray-500 w-6 text-right shrink-0">
                {count}
              </span>
            </div>
          ))}
        </div>

        {/* Accuracy row */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">正确率</span>
            <span className="text-lg font-bold text-green-600">{accuracy}%</span>
          </div>
        </div>
      </div>

      {/* Action button */}
      <button
        onClick={() => navigate('/')}
        className="w-full max-w-xs py-3 bg-blue-600 text-white rounded-xl font-medium text-base active:bg-blue-700 min-h-[48px]"
      >
        返回首页
      </button>
    </div>
  )
}