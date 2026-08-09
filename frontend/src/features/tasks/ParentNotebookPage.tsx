import { useCallback, useEffect, useState } from 'react'
import { familyApi, tasksApi } from '../../services/tasks'
import { statisticsApi, type Overview } from '../../services/statistics'
import { questionApi } from '../../services/questions'
import type { FamilyChild, Question, TaskInstance } from '../../types'

type Tab = 'stats' | 'review' | 'list'

export default function ParentNotebookPage() {
  const [children, setChildren] = useState<FamilyChild[]>([])
  const [studentId, setStudentId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('stats')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [reportRate, setReportRate] = useState<number>(0)
  const [dueQuestions, setDueQuestions] = useState<Question[]>([])
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [autoReview, setAutoReview] = useState<TaskInstance | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    familyApi.children().then((res) => {
      const active = res.data.filter((c) => c.status === 'active')
      setChildren(active)
      if (active.length) setStudentId((prev) => prev ?? active[0].student_id)
    })
  }, [])

  const fetchAll = useCallback(async (sid: number) => {
    setLoading(true)
    try {
      const [ov, report, dueRes, allRes, dailyRes] = await Promise.all([
        statisticsApi.overview(sid),
        statisticsApi.report('weekly', sid),
        questionApi.list({ student_id: sid, due: true, page_size: 50 }),
        questionApi.list({ student_id: sid, page_size: 100 }),
        tasksApi.daily({ student_id: sid }),
      ])
      setOverview(ov.data)
      setReportRate((report.data.review_completion_rate as number) ?? 0)
      setDueQuestions(dueRes.data.data)
      setAllQuestions(allRes.data.data)
      setAutoReview(dailyRes.data.find((t) => t.source === 'auto_review') ?? null)
    } catch {
      /* 忽略加载失败 */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (studentId != null) fetchAll(studentId)
  }, [studentId, fetchAll])

  const statCards = [
    { label: '错题总数', value: overview?.total_questions ?? 0, c: 'text-blue-600' },
    { label: '掌握度', value: `${overview?.mastery_rate ?? 0}%`, c: 'text-purple-600' },
    { label: '今日待复习', value: overview?.today_review_count ?? 0, c: 'text-orange-600' },
    { label: '已逾期', value: overview?.overdue_review_count ?? 0, c: 'text-red-600' },
    { label: '本周新增', value: `+${overview?.weekly_added ?? 0}`, c: 'text-green-600' },
    { label: '累计复习', value: overview?.total_reviews ?? 0, c: 'text-gray-600' },
  ]

  const statusLabel: Record<string, string> = { pending: '待完成', submitted: '待检查', approved: '已通过' }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-3">📚 孩子错题本（只读）</h1>

      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          {children.map((c) => (
            <button key={c.student_id} onClick={() => setStudentId(c.student_id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium ${studentId === c.student_id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {c.display_name || c.username}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {([['stats', '统计'], ['review', '复习情况'], ['list', '错题列表']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === k ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
      ) : tab === 'stats' ? (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {statCards.map((c) => (
              <div key={c.label} className="bg-white rounded-2xl p-3 shadow-sm text-center">
                <div className={`text-xl font-bold ${c.c}`}>{c.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm mt-3">
            <h3 className="text-sm font-bold text-gray-800 mb-2">本周复习完成率</h3>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(reportRate, 100)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">{reportRate}%</p>
          </div>
        </div>
      ) : tab === 'review' ? (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-2">今日复习</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="py-2 bg-orange-50 rounded-xl text-center">
                <div className="text-xl font-bold text-orange-600">{overview?.today_review_count ?? 0}</div>
                <div className="text-xs text-gray-400">今日待复习</div>
              </div>
              <div className="py-2 bg-red-50 rounded-xl text-center">
                <div className="text-xl font-bold text-red-600">{overview?.overdue_review_count ?? 0}</div>
                <div className="text-xs text-gray-400">已逾期</div>
              </div>
            </div>
            {autoReview && (
              <div className="mt-2 flex items-center justify-between bg-purple-50 rounded-xl px-3 py-2">
                <span className="text-xs text-purple-700">记忆曲线复习任务：{autoReview.name}</span>
                <span className="text-xs px-2 py-0.5 bg-white rounded-full text-purple-600">{statusLabel[autoReview.status] ?? autoReview.status}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-2">今日待复习清单（按记忆曲线）</h3>
            {dueQuestions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">今日没有到期错题 🎉</p>
            ) : (
              <div className="space-y-2">
                {dueQuestions.map((q) => (
                  <div key={q.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-blue-600 w-8 flex-shrink-0">{q.subject}</span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{q.question_content}</span>
                    {q.tags.length > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{q.tags.slice(0, 2).join('、')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-2">错题列表</h3>
          {allQuestions.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">暂无错题</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {allQuestions.map((q) => (
                <div key={q.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-600 w-8 flex-shrink-0">{q.subject}</span>
                    <span className="text-sm text-gray-700 flex-1 min-w-0 break-words">{q.question_content}</span>
                  </div>
                  {q.tags.length > 0 && <div className="text-xs text-gray-400 mt-1">{q.tags.join('、')}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
