import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { statisticsApi, type Overview, type ReportData, type ErrorTypeItem, type WeakTagItem } from '../../services/statistics'
import { reviewApi } from '../../services/reviews'
import type { Question } from '../../types'

type PageState = 'loading' | 'loaded' | 'error'

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [pageState, setPageState] = useState<PageState>('loading')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')

  const fetchData = useCallback(async () => {
    setPageState('loading')
    try {
      const [overviewRes, reportRes, reviewRes] = await Promise.allSettled([
        statisticsApi.overview(),
        statisticsApi.report(),
        reviewApi.getDaily(),
      ])

      if (overviewRes.status === 'fulfilled') {
        setOverview(overviewRes.value.data)
      } else {
        setPageState('error')
        return
      }

      if (reportRes.status === 'fulfilled') {
        setReport(reportRes.value.data)
      }

      if (reviewRes.status === 'fulfilled' && reviewRes.value.data?.data) {
        setReviewQuestions(reviewRes.value.data.data.slice(0, 5))
      }

      setPageState('loaded')
    } catch {
      setPageState('error')
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const subjects = useMemo(
    () => Array.from(new Set(reviewQuestions.map((q) => q.subject).filter(Boolean))).sort(),
    [reviewQuestions],
  )
  const filteredReviewQuestions = useMemo(
    () => selectedSubject ? reviewQuestions.filter((q) => q.subject === selectedSubject) : reviewQuestions,
    [reviewQuestions, selectedSubject],
  )

  /* ──────────── Loading skeleton ──────────── */
  if (pageState === 'loading') {
    return (
      <div className="pb-6">
        {/* Header skeleton */}
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="h-3 w-12 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-7 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Review list skeleton */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1">
                <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="h-8 w-14 bg-gray-200 rounded-lg animate-pulse ml-2" />
            </div>
          ))}
        </div>
        {/* Error types skeleton */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="flex-1 h-4 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ──────────── Error state ──────────── */
  if (pageState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="text-6xl mb-5">😵</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">加载失败</h2>
        <p className="text-gray-500 text-center mb-8">无法获取数据，请检查网络后重试</p>
        <button
          onClick={fetchData}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          重新加载
        </button>
      </div>
    )
  }

  /* ──────────── Loaded state ──────────── */
  const statCards = [
    { label: '总计', value: overview?.total_questions ?? 0, color: 'text-blue-600' },
    { label: '待复习', value: (overview?.overdue_review_count ?? 0) + (overview?.today_review_count ?? 0), color: 'text-orange-600' },
    { label: '本周新增', value: `+${overview?.weekly_added ?? 0}`, color: 'text-green-600' },
    { label: '掌握度', value: `${overview?.mastery_rate ?? 0}%`, color: 'text-purple-600' },
  ]

  const errorTypeDistribution: ErrorTypeItem[] = report?.error_type_distribution ?? []
  const highFrequencyTags: WeakTagItem[] = report?.high_frequency_tags ?? []

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">📝 智能错题本</h1>
        <span className="text-sm text-gray-500">{user?.display_name || user?.username || ''}</span>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Today's review list ── */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-800">今日待复习</h2>
          {reviewQuestions.length > 0 && (
            <button
              onClick={() => navigate('/review')}
              className="text-xs text-blue-600 font-medium min-h-[28px]"
            >
              去复习 &gt;
            </button>
          )}
        </div>

        {/* Subject filter */}
        {subjects.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
            <button
              onClick={() => setSelectedSubject('')}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !selectedSubject ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >全部</button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSubject(s)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedSubject === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >{s}</button>
            ))}
          </div>
        )}

        {reviewQuestions.length === 0 ? (
          <div className="py-6 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm text-gray-400">今日暂无待复习题目</p>
          </div>
        ) : filteredReviewQuestions.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400">该学科暂无待复习题目</p>
          </div>
        ) : (
          <div>
            {filteredReviewQuestions.slice(0, 5).map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    {q.subject && (
                      <span className="text-xs text-blue-600 font-medium">{q.subject}</span>
                    )}
                    {q.tags.length > 0 && (
                      <span className="text-xs text-gray-400">· {q.tags.slice(0, 2).join('、')}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 truncate">{q.question_content}</p>
                </div>
                <button
                  onClick={() => navigate('/review')}
                  className="flex-shrink-0 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg active:bg-blue-100 min-h-[28px]"
                >
                  复习
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── High-frequency error types ── */}
      {highFrequencyTags.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">高频错误 Top5</h2>
          <div className="space-y-2.5">
            {highFrequencyTags.slice(0, 5).map((item, index) => (
              <div key={item.tag} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-5 text-right">{index + 1}.</span>
                <span className="text-sm text-gray-700 w-20 truncate">{item.tag}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(item.error_rate, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{Math.round(item.error_rate)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error reason distribution ── */}
      {errorTypeDistribution.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 mb-3">错误原因分布</h2>
          <div className="space-y-3">
            {errorTypeDistribution.map((item) => (
              <div key={item.type}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{item.type}</span>
                  <span className="text-xs text-gray-500">{Math.round(item.percentage)}%</span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}