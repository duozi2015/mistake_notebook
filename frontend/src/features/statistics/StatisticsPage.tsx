import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
} from 'recharts'
import {
  statisticsApi,
  type Overview,
  type TrendItem,
  type ReportData,
  type WeakTagItem,
  type MasteryItem,
  type HeatmapItem,
} from '../../services/statistics'
import { tasksApi } from '../../services/tasks'
import { toLocalDateStr } from '../../utils/format'
import { CATEGORY_LABELS } from '../tasks/constants'
import type { TaskInstance } from '../../types'

type PageState = 'loading' | 'loaded' | 'error' | 'empty'

const AXIS_TICK = { fontSize: 10, fill: '#9ca3af' } as const

/* 图表配色（与页面既有色板一致） */
const COLORS = {
  added: '#60a5fa', // blue-400
  reviewed: '#4ade80', // green-400
  weak: '#fb923c', // orange-400
  radar: '#a855f7', // purple-500
  pie: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'],
  bucket: ['#c4b5fd', '#60a5fa', '#fbbf24', '#34d399'],
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/* 统一 tooltip 样式 */
const tooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    fontSize: 12,
    padding: '6px 10px',
  },
} as const

export default function StatisticsPage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [trends, setTrends] = useState<TrendItem[]>([])
  const [report, setReport] = useState<ReportData | null>(null)
  const [mastery, setMastery] = useState<MasteryItem[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>([])
  const [taskHistory, setTaskHistory] = useState<TaskInstance[]>([])

  const fetchData = useCallback(async () => {
    setPageState('loading')
    try {
      const end = new Date()
      const start = new Date(); start.setDate(start.getDate() - 29)
      const [overviewRes, trendsRes, reportRes, masteryRes, heatmapRes, taskHisRes] = await Promise.allSettled([
        statisticsApi.overview(),
        statisticsApi.trends(),
        statisticsApi.report(),
        statisticsApi.mastery(),
        statisticsApi.heatmap(),
        tasksApi.history({ start: toLocalDateStr(start), end: toLocalDateStr(end) }),
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

      if (heatmapRes.status === 'fulfilled') {
        setHeatmapData(heatmapRes.value.data.data ?? [])
      }

      if (taskHisRes.status === 'fulfilled') {
        setTaskHistory(taskHisRes.value.data)
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
    if (trends.length === 0) return []

    // Show last 30 days of data
    const sorted = [...trends].sort((a, b) => a.date.localeCompare(b.date))
    return sorted.slice(-30)
  }, [trends])

  /* ──────────── 热力图数据：按天聚合 + 按时段聚合 ──────────── */
  const heatmapByDate = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of heatmapData) m[it.date] = (m[it.date] ?? 0) + it.count
    return m
  }, [heatmapData])

  const heatmapBuckets = useMemo(() => {
    const buckets = [
      { label: '凌晨 0-5点', count: 0 },
      { label: '上午 6-11点', count: 0 },
      { label: '下午 12-17点', count: 0 },
      { label: '晚上 18-23点', count: 0 },
    ]
    for (const it of heatmapData) {
      buckets[Math.floor(it.hour / 6)].count += it.count
    }
    return buckets
  }, [heatmapData])

  /* ──────────── 薄弱知识点：统一按错误率排序（后端 top_weak_tags 已按率排，前端兜底同口径） ──────────── */
  const weakTags: WeakTagItem[] = useMemo(() => {
    const fromReport = report?.top_weak_tags ?? []
    if (fromReport.length > 0) return fromReport
    // report 接口失败时用 mastery 数据按错误率兜底推导
    return [...mastery]
      .map((m) => ({
        tag: m.tag,
        error_count: m.error_count,
        total_count: m.total_count,
        error_rate: m.total_count > 0 ? Math.round((m.error_count / m.total_count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.error_rate - a.error_rate)
      .slice(0, 5)
  }, [report, mastery])

  /* ──────────── 雷达图数据（掌握度前 6 个知识点） ──────────── */
  const radarData = useMemo(
    () =>
      [...mastery]
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 6)
        .map((m) => ({
          tag: m.tag.length > 6 ? `${m.tag.slice(0, 6)}…` : m.tag,
          掌握度: Math.round(m.mastery * 100),
        })),
    [mastery],
  )

  /* ──────────── 任务统计聚合 ──────────── */
  const taskStats = useMemo(() => {
    const approved = taskHistory.filter((t) => t.status === 'approved')
    const byCat: Record<string, number> = { learning: 0, sports: 0, chores: 0 }
    for (const t of approved) byCat[t.category] = (byCat[t.category] ?? 0) + 1
    // 近 14 天每日完成趋势
    const days: Record<string, number> = {}
    for (const t of approved) days[t.task_date] = (days[t.task_date] ?? 0) + 1
    const trend: { date: string; count: number }[] = []
    const end = new Date()
    const start = new Date(); start.setDate(start.getDate() - 13)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toLocalDateStr(d)
      trend.push({ date: key, count: days[key] ?? 0 })
    }
    // 预计 vs 实际耗时
    const withTime = approved.filter((t) => t.estimated_minutes != null && t.actual_minutes != null)
    const avgEst = withTime.length ? Math.round(withTime.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0) / withTime.length) : 0
    const avgAct = withTime.length ? Math.round(withTime.reduce((s, t) => s + (t.actual_minutes ?? 0), 0) / withTime.length) : 0
    // 今日各状态计数（从 history 派生，避免额外请求）
    const today = toLocalDateStr(new Date())
    const todayStats = { total: 0, pending: 0, submitted: 0, rejected: 0, approved: 0 }
    for (const t of taskHistory) {
      if (t.task_date !== today) continue
      todayStats.total += 1
      if (t.status === 'pending' || t.status === 'submitted' || t.status === 'rejected' || t.status === 'approved') {
        todayStats[t.status] += 1
      }
    }
    return { approvedCount: approved.length, byCat, trend, avgEst, avgAct, timeTasks: withTime.length, today: todayStats }
  }, [taskHistory])

  /* ──────────── Empty state check ──────────── */
  const hasData = overview && (overview.total_questions > 0 || overview.total_reviews > 0 || taskHistory.length > 0)

  /* ──────────── Loading skeleton ──────────── */
  if (pageState === 'loading') {
    return (
      <div className="pb-6">
        {/* Header skeleton */}
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
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
        {/* Heatmap skeleton */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
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

      {/* ── 任务统计 ── */}
      <h2 className="text-sm font-bold text-gray-800 mb-3">📋 任务统计</h2>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-blue-600">{taskStats.approvedCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">近30天完成</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-green-600">{taskStats.today.approved}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">今日完成</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-gray-600">{taskStats.today.pending}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">待完成</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xl font-bold text-orange-600">{taskStats.today.submitted}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">待检查</div>
        </div>
      </div>

      {/* 分类分布 */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
        <h3 className="text-xs font-bold text-gray-500 mb-2">完成分类分布</h3>
        {(['learning', 'sports', 'chores'] as const).map((c) => {
          const cnt = taskStats.byCat[c] ?? 0
          const total = Math.max(taskStats.approvedCount, 1)
          return (
            <div key={c} className="flex items-center gap-2 mb-1.5 last:mb-0">
              <span className="text-xs text-gray-600 w-8">{CATEGORY_LABELS[c]}</span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(cnt / total) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-400 w-6 text-right">{cnt}</span>
            </div>
          )
        })}
      </div>

      {/* 近14天完成趋势（面积图） */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
        <h3 className="text-xs font-bold text-gray-500 mb-2">近14天完成任务趋势</h3>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={taskStats.trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="taskTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              minTickGap={30}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} width={22} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={(v) => `📅 ${v}`}
              formatter={(value) => [`${value} 个`, '完成任务']}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="完成任务"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#taskTrendFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 预计 vs 实际耗时 */}
      {taskStats.timeTasks > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h3 className="text-xs font-bold text-gray-500 mb-2">耗时对比（{taskStats.timeTasks} 个任务）</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>⏱ 平均预计</span>
                <span className="font-bold text-gray-800">{taskStats.avgEst} 分钟</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min((taskStats.avgEst / Math.max(taskStats.avgAct, 1)) * 100, 100)}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>✅ 平均实际</span>
                <span className="font-bold text-gray-800">{taskStats.avgAct} 分钟</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min((taskStats.avgAct / Math.max(taskStats.avgEst, 1)) * 100, 100)}%` }} />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            {taskStats.avgAct <= taskStats.avgEst ? '🎉 平均用时未超预计，继续保持！' : '💪 平均用时略超预计，可优化安排。'}
          </p>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">总题数</div>
          <div className="text-xl font-bold text-blue-600">{overview?.total_questions ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">待复习</div>
          <div className="text-xl font-bold text-orange-600">
            {(overview?.overdue_review_count ?? 0) + (overview?.today_review_count ?? 0)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">掌握度</div>
          <div className="text-xl font-bold text-purple-600">{overview?.mastery_rate ?? 0}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">完成率</div>
          <div className="text-xl font-bold text-green-600">{report?.review_completion_rate ?? 0}%</div>
        </div>
      </div>

      {/* ── 错题趋势（分组柱状图） ── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">错题趋势（近30天）</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={1}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                minTickGap={26}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} width={22} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip
                {...tooltipStyle}
                cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                labelFormatter={(v) => `📅 ${v}`}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="added" name="新增" fill={COLORS.added} radius={[2, 2, 0, 0]} maxBarSize={10} />
              <Bar dataKey="reviewed" name="复习" fill={COLORS.reviewed} radius={[2, 2, 0, 0]} maxBarSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 学习热力图（日历热力图 + 时段分布） ── */}
      {heatmapData.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">学习热力图（近30天）</h2>
          <CalendarHeatmap byDate={heatmapByDate} />
          <h3 className="text-xs font-bold text-gray-500 mt-4 mb-1">时段分布</h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={heatmapBuckets} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={92}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(59,130,246,0.06)' }} formatter={(value) => [`${value} 次`, '学习频次']} />
              <Bar dataKey="count" name="学习频次" radius={[0, 6, 6, 0]} maxBarSize={16}>
                {heatmapBuckets.map((_, i) => (
                  <Cell key={i} fill={COLORS.bucket[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 错误原因分布（环形图） ── */}
      {(report?.top_error_types?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">错误原因分布</h2>
          <div className="flex items-center gap-2">
            <ResponsiveContainer width="55%" height={180}>
              <PieChart>
                <Pie
                  data={report!.top_error_types}
                  dataKey="percentage"
                  nameKey="type"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {report!.top_error_types.map((_, i) => (
                    <Cell key={i} fill={COLORS.pie[i % COLORS.pie.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name, payload) => [
                    `${value}%（${(payload?.payload as { count: number }).count} 题）`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {report!.top_error_types.map((item, i) => (
                <div key={item.type} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.pie[i % COLORS.pie.length] }} />
                  <span className="text-xs text-gray-700 flex-1 truncate">{item.type}</span>
                  <span className="text-xs font-medium text-gray-500">{Math.round(item.percentage)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 薄弱知识点（按错误率横向条形图） ── */}
      {weakTags.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-1">薄弱知识点</h2>
          <p className="text-[11px] text-gray-400 mb-2">按错误率排序（低掌握题数 / 该知识点总题数）</p>
          <ResponsiveContainer width="100%" height={weakTags.length * 40 + 24}>
            <BarChart data={weakTags} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="tag"
                width={98}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...tooltipStyle}
                cursor={{ fill: 'rgba(251,146,60,0.08)' }}
                formatter={(value, _name, payload) => {
                  const p = payload?.payload as WeakTagItem
                  const total = p?.total_count ?? p?.error_count ?? '?'
                  return [`${value}%（${p?.error_count ?? '?'}/${total} 题）`, '错误率']
                }}
              />
              <Bar dataKey="error_rate" name="错误率" fill={COLORS.weak} radius={[0, 4, 4, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 知识掌握度雷达图 ── */}
      {radarData.length >= 3 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">知识掌握度</h2>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="tag" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#d1d5db' }} axisLine={false} />
              <Radar dataKey="掌握度" stroke={COLORS.radar} fill={COLORS.radar} fillOpacity={0.3} strokeWidth={2} />
              <Tooltip {...tooltipStyle} formatter={(value) => [`${value}%`, '掌握度']} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 学情建议 ── */}
      {(report?.suggestions?.length ?? 0) > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-2">💡 学情建议</h2>
          <ul className="text-sm text-gray-600 space-y-1.5 ml-4 list-disc">
            {report!.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** 日历热力图：近30天按天着色（GitHub 贡献图风格，纯 SVG 绘制） */
function CalendarHeatmap({ byDate }: { byDate: Record<string, number> }) {
  const CELL = 15
  const GAP = 3
  const LABEL_W = 20

  const cells = useMemo(() => {
    const today = new Date()
    const list: { date: string; count: number; weekday: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(today.getDate() - i)
      const key = toLocalDateStr(d)
      list.push({ date: key, count: byDate[key] ?? 0, weekday: d.getDay() })
    }
    return list
  }, [byDate])

  const maxCount = Math.max(...cells.map((c) => c.count), 1)
  const leadBlanks = cells[0]?.weekday ?? 0
  const columns = Math.ceil((leadBlanks + cells.length) / 7)
  const W = LABEL_W + columns * (CELL + GAP)
  const H = 7 * (CELL + GAP)
  // 稀疏行标签（周一/周四/周日），避免拥挤
  const WEEK_ROWS: [number, string][] = [[1, '一'], [4, '四'], [6, '日']]

  const getColor = (count: number) => {
    if (count === 0) return '#f3f4f6'
    const ratio = count / maxCount
    if (ratio > 0.75) return '#16a34a'
    if (ratio > 0.5) return '#4ade80'
    if (ratio > 0.25) return '#86efac'
    return '#dcfce7'
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 6}`} className="w-full" style={{ maxWidth: W * 2 }}>
        {/* 星期行标签 */}
        {WEEK_ROWS.map(([row, label]) => (
          <text
            key={row}
            x={LABEL_W - 4}
            y={row * (CELL + GAP) + CELL / 2 + 3}
            textAnchor="end"
            fontSize="9"
            fill="#9ca3af"
          >
            {label}
          </text>
        ))}
        {cells.map((c, i) => {
          const slot = leadBlanks + i
          const col = Math.floor(slot / 7)
          const row = slot % 7
          return (
            <g key={c.date}>
              <rect
                x={LABEL_W + col * (CELL + GAP)}
                y={row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={4}
                fill={getColor(c.count)}
              />
              <title>{`📅 ${c.date}：学习 ${c.count} 次`}</title>
            </g>
          )
        })}
      </svg>
      {/* 图例 */}
      <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-gray-400">
        <span>少</span>
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#f3f4f6' }} />
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#dcfce7' }} />
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#86efac' }} />
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#4ade80' }} />
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#16a34a' }} />
        <span>多</span>
      </div>
    </div>
  )
}
