import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { statisticsApi, type ReportData, type ErrorTypeItem, type WeakTagItem } from '../../services/statistics'
import { reviewApi } from '../../services/reviews'
import { tasksApi, achievementsApi } from '../../services/tasks'
import ChallengeCard from '../tasks/components/ChallengeCard'
import CategoryTag from '../tasks/components/CategoryTag'
import { STATUS_LABELS, statusRank } from '../tasks/constants'
import type { Achievement, Question, TaskInstance } from '../../types'

type PageState = 'loading' | 'loaded' | 'error'

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [pageState, setPageState] = useState<PageState>('loading')
  const [report, setReport] = useState<ReportData | null>(null)
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([])
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [badges, setBadges] = useState<Achievement[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')

  const fetchData = useCallback(async () => {
    setPageState('loading')
    try {
      const [reportRes, reviewRes, taskRes, badgeRes] = await Promise.allSettled([
        statisticsApi.report(),
        reviewApi.getDaily(),
        tasksApi.daily({}),
        achievementsApi.list(),
      ])

      if (taskRes.status !== 'fulfilled') {
        setPageState('error')
        return
      }

      if (reportRes.status === 'fulfilled') setReport(reportRes.value.data)
      if (reviewRes.status === 'fulfilled' && reviewRes.value.data?.data) setReviewQuestions(reviewRes.value.data.data.slice(0, 5))
      setTasks(taskRes.value.data)
      if (badgeRes.status === 'fulfilled') setBadges(badgeRes.value.data.data)
      setPageState('loaded')
    } catch {
      setPageState('error')
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const done = tasks.filter((t) => t.status === 'approved').length
  const todayStr = useMemo(() => {
    const d = new Date()
    const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
    return `${d.getMonth() + 1}月${d.getDate()}日 周${wd}`
  }, [])

  // 待办/待检查/需修改 优先展示
  const taskList = useMemo(() => {
    return [...tasks].sort((a, b) => statusRank(a.status) - statusRank(b.status)).slice(0, 6)
  }, [tasks])

  const subjects = useMemo(
    () => Array.from(new Set(reviewQuestions.map((q) => q.subject).filter(Boolean))).sort(),
    [reviewQuestions],
  )
  const filteredReviewQuestions = useMemo(
    () => selectedSubject ? reviewQuestions.filter((q) => q.subject === selectedSubject) : reviewQuestions,
    [reviewQuestions, selectedSubject],
  )
  const highFrequencyTags: WeakTagItem[] = report?.high_frequency_tags ?? []
  const errorTypeDistribution: ErrorTypeItem[] = report?.error_type_distribution ?? []

  /* ──────────── Loading skeleton ──────────── */
  if (pageState === 'loading') {
    return (
      <div className="pb-6 space-y-3">
        <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  /* ──────────── Error state ──────────── */
  if (pageState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="text-6xl mb-5">😵</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">加载失败</h2>
        <button onClick={fetchData} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]">
          重新加载
        </button>
      </div>
    )
  }

  /* ──────────── Loaded state ──────────── */
  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">你好，{user?.display_name || user?.username} 👋</h1>
        <span className="text-sm text-gray-400">{todayStr}</span>
      </div>

      {/* ── 今日任务进度 ── */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 shadow-sm mb-3 text-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium opacity-90">📋 今日任务</span>
          <span className="text-lg font-bold">{done} / {tasks.length}</span>
        </div>
        <div className="h-2 bg-white/25 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }}
          />
        </div>
        <button
          onClick={() => navigate('/tasks')}
          className="w-full py-2.5 bg-white/95 text-blue-700 rounded-xl text-sm font-medium active:bg-white"
        >
          {tasks.length === 0 ? '去看看今天的任务' : done === tasks.length ? '全部完成，真棒！🎉' : '去打卡 →'}
        </button>
      </div>

      {/* ── 今日待办任务列表 ── */}
      {taskList.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-800">我的任务</h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-blue-600 font-medium min-h-[28px]">全部 ›</button>
          </div>
          <div className="divide-y divide-gray-50">
            {taskList.map((t) => (
              <button key={t.id} onClick={() => navigate('/tasks')} className="w-full flex items-center gap-2 py-2.5 text-left active:bg-gray-50 rounded-lg px-1">
                <CategoryTag category={t.category} />
                <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{t.name}</span>
                <span className={`text-xs flex-shrink-0 ${t.status === 'approved' ? 'text-green-600' : t.status === 'rejected' ? 'text-red-600' : t.status === 'submitted' ? 'text-orange-600' : 'text-gray-400'}`}>
                  {t.status === 'pending' ? '去打卡' : STATUS_LABELS[t.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 今日挑战 ── */}
      <ChallengeCard items={badges} onOpen={() => navigate('/tasks')} />

      {/* ── 今日待复习 ── */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-800">🔁 今日待复习</h2>
          {reviewQuestions.length > 0 && (
            <button onClick={() => navigate('/review')} className="text-xs text-blue-600 font-medium min-h-[28px]">去复习 &gt;</button>
          )}
        </div>

        {subjects.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
            <button onClick={() => setSelectedSubject('')} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${!selectedSubject ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>全部</button>
            {subjects.map((s) => (
              <button key={s} onClick={() => setSelectedSubject(s)} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${selectedSubject === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{s}</button>
            ))}
          </div>
        )}

        {reviewQuestions.length === 0 ? (
          <div className="py-5 text-center">
            <div className="text-3xl mb-1">✅</div>
            <p className="text-sm text-gray-400">今日暂无待复习题目</p>
          </div>
        ) : filteredReviewQuestions.length === 0 ? (
          <div className="py-5 text-center"><p className="text-sm text-gray-400">该学科暂无待复习题目</p></div>
        ) : (
          filteredReviewQuestions.slice(0, 5).map((q) => (
            <div key={q.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1 min-w-0 mr-2">
                <div className="flex items-center gap-1.5 mb-1">
                  {q.subject && <span className="text-xs text-blue-600 font-medium">{q.subject}</span>}
                  {q.tags.length > 0 && <span className="text-xs text-gray-400">· {q.tags.slice(0, 2).join('、')}</span>}
                </div>
                <p className="text-sm text-gray-700 truncate">{q.question_content}</p>
              </div>
              <button onClick={() => navigate('/review')} className="flex-shrink-0 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg active:bg-blue-100 min-h-[28px]">复习</button>
            </div>
          ))
        )}
      </div>

      {/* ── 高频错误 Top5 ── */}
      {highFrequencyTags.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">高频错误 Top5</h2>
          <div className="space-y-2.5">
            {highFrequencyTags.slice(0, 5).map((item, index) => (
              <div key={item.tag} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-5 text-right">{index + 1}.</span>
                <span className="text-sm text-gray-700 w-20 truncate">{item.tag}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full transition-all duration-500" style={{ width: `${Math.min(item.error_rate, 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{Math.round(item.error_rate)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 错误原因分布 ── */}
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
                  <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
