import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  statisticsApi,
  type Overview,
  type TrendItem,
  type ReportData,
  type ErrorTypeItem,
  type MasteryItem,
} from '../../services/statistics'

type PageState = 'loading' | 'loaded' | 'error' | 'empty'

export default function StatisticsPage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [trends, setTrends] = useState<TrendItem[]>([])
  const [report, setReport] = useState<ReportData | null>(null)
  const [mastery, setMastery] = useState<MasteryItem[]>([])

  const fetchData = useCallback(async () => {
    setPageState('loading')
    try {
      const [overviewRes, trendsRes, reportRes, masteryRes] = await Promise.allSettled([
        statisticsApi.overview(),
        statisticsApi.trends(),
        statisticsApi.report(),
        statisticsApi.mastery(),
      ])

      if (overviewRes.status !== 'fulfilled') {
        setPageState('error')
        return
      }
      setOverview(overviewRes.value.data)

      if (trendsRes.status === 'fulfilled') {
        setTrends(trendsRes.value.data.daily ?? [])
      }

      if (reportRes.status === 'fulfilled') {
        setReport(reportRes.value.data)
      }

      if (masteryRes.status === 'fulfilled') {
        setMastery(masteryRes.value.data.data ?? [])
      }

      setPageState('loaded')
    } catch {
      setPageState('error')
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ──────────── Current month label ──────────── */
  const currentMonthLabel = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}年${now.getMonth() + 1}月`
  }, [])

  /* ──────────── Trend chart data ──────────── */
  const chartData = useMemo(() => {
    if (trends.length === 0) return { data: [], maxValue: 0 }

    // Show last 30 days of data
    const sorted = [...trends].sort((a, b) => a.date.localeCompare(b.date))
    const sliced = sorted.slice(-30)

    const maxValue = Math.max(
      ...sliced.map((d) => Math.max(d.added, d.reviewed)),
      1,
    )

    return { data: sliced, maxValue }
  }, [trends])

  /* ──────────── Weakest tag for suggestions ──────────── */
  const weakestTag = useMemo(() => {
    if (mastery.length === 0) return null
    return [...mastery].sort((a, b) => b.error_count - a.error_count)[0]
  }, [mastery])

  const errorTypeDistribution: ErrorTypeItem[] = report?.error_type_distribution ?? []

  /* ──────────── Format date for display ──────────── */
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  /* ──────────── Empty state check ──────────── */
  const hasData = overview && (overview.total_questions > 0 || overview.total_reviews > 0)

  /* ──────────── Loading skeleton ──────────── */
  if (pageState === 'loading') {
    return (
      <div className="pb-6">
        {/* Header skeleton */}
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="h-3 w-12 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-7 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Trend chart skeleton */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        {/* Error distribution skeleton */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded-full animate-pulse mb-3 last:mb-0" />
          ))}
        </div>
        {/* Weak tags skeleton */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
              <div className="h-4 w-5 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="flex-1 h-4 bg-gray-100 rounded-full animate-pulse" />
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
        <p className="text-gray-500 text-center mb-8">无法获取统计数据，请检查网络后重试</p>
        <button
          onClick={fetchData}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          重新加载
        </button>
      </div>
    )
  }

  /* ──────────── Empty state ──────────── */
  if (pageState === 'loaded' && !hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="text-6xl mb-5">📊</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">暂无数据</h2>
        <p className="text-gray-500 text-center mb-8">录入错题后，这里将展示你的学习统计</p>
        <button
          onClick={() => window.location.href = '/questions/new'}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          录入第一道错题
        </button>
      </div>
    )
  }

  /* ──────────── Loaded state ──────────── */
  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">📊 数据统计</h1>
        <span className="text-sm text-gray-500">{currentMonthLabel}</span>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">总题数</div>
          <div className="text-xl font-bold text-blue-600">{overview?.total_questions ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">待复习</div>
          <div className="text-xl font-bold text-orange-600">
            {(overview?.overdue_review_count ?? 0) + (overview?.today_review_count ?? 0)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">掌握度</div>
          <div className="text-xl font-bold text-purple-600">{overview?.mastery_rate ?? 0}%</div>
        </div>
      </div>

      {/* ── Trend chart ── */}
      {chartData.data.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">错题趋势（近30天）</h2>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-400" />
              <span className="text-xs text-gray-500">新增</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-green-400" />
              <span className="text-xs text-gray-500">复习</span>
            </div>
          </div>

          {/* Chart area */}
          <div className="relative">
            <div className="flex items-end gap-[2px] h-44" style={{ minHeight: '176px' }}>
              {chartData.data.map((item, idx) => {
                const addedHeight = (item.added / chartData.maxValue) * 120
                const reviewedHeight = (item.reviewed / chartData.maxValue) * 120
                const showLabel =
                  idx === 0 ||
                  idx === chartData.data.length - 1 ||
                  item.date.endsWith('-01') ||
                  (idx > 0 && chartData.data.length > 10 && idx % Math.ceil(chartData.data.length / 5) === 0)

                return (
                  <div key={item.date} className="flex-1 flex flex-col items-center justify-end h-full">
                    {/* Bars */}
                    <div className="flex items-end gap-[1px] w-full max-w-[12px]">
                      <div
                        className="w-1/2 bg-blue-400 rounded-t-sm transition-all duration-500"
                        style={{ height: `${Math.max(addedHeight, 1)}px` }}
                      />
                      <div
                        className="w-1/2 bg-green-400 rounded-t-sm transition-all duration-500"
                        style={{ height: `${Math.max(reviewedHeight, 1)}px` }}
                      />
                    </div>
                    {/* Date label */}
                    {showLabel && (
                      <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">
                        {formatDate(item.date)}
                      </span>
                    )}
                    {!showLabel && <div className="h-4" />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Error reason distribution ── */}
      {errorTypeDistribution.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
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

      {/* ── Weak knowledge points ── */}
      {mastery.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">薄弱知识点</h2>
          <div className="space-y-3">
            {[...mastery]
              .sort((a, b) => b.error_count - a.error_count)
              .slice(0, 5)
              .map((item, index) => (
                <div key={item.tag} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-right">{index + 1}.</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{item.tag}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                    <div
                      className="h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(item.error_count / Math.max(item.total_count, 1) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">
                    {item.total_count > 0
                      ? `${Math.round((item.error_count / item.total_count) * 100)}%`
                      : '0%'}
                  </span>
                  <span className="text-xs text-orange-500">📈</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Learning suggestions ── */}
      {weakestTag && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <h2 className="text-sm font-bold text-gray-800 mb-2">⚠️ 学情建议</h2>
          <p className="text-sm text-gray-700 mb-2">
            <strong className="text-orange-600">{weakestTag.tag}</strong> 板块错误率高达{' '}
            {weakestTag.total_count > 0
              ? `${Math.round((weakestTag.error_count / weakestTag.total_count) * 100)}%`
              : '较高'}
            ，建议重点复习。
          </p>
          <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
            <li>回顾 {weakestTag.tag} 的基础概念和公式</li>
            <li>多做相关练习题，巩固理解</li>
            <li>整理错题，分析错误原因</li>
          </ul>
        </div>
      )}
    </div>
  )
}