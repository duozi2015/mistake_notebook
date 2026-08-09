import { useCallback, useEffect, useMemo, useState } from 'react'
import { tasksApi, achievementsApi } from '../../services/tasks'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import CategoryTag from './components/CategoryTag'
import Thumbnails from './components/Thumbnails'
import ImagePicker, { type PickedImage } from './components/ImagePicker'
import TaskFormSheet, { type TaskFormValues } from './components/TaskFormSheet'
import ChallengeCard from './components/ChallengeCard'
import { hasNearAchievement } from './achievements'
import { clampMinutes, toLocalDateStr } from '../../utils/format'
import type { Achievement, TaskInstance } from '../../types'

type Tab = 'today' | 'history' | 'badges'

export default function StudentTaskPage() {
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)
  const [tab, setTab] = useState<Tab>('today')
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [history, setHistory] = useState<TaskInstance[]>([])
  const [badges, setBadges] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [selfAddOpen, setSelfAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchToday = useCallback(async () => {
    setLoading(true)
    try {
      const res = await tasksApi.daily({})
      setTasks(res.data)
    } catch {
      addToast('加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchToday()
    const end = new Date()
    const start = new Date(); start.setDate(start.getDate() - 13)
    tasksApi.history({ start: toLocalDateStr(start), end: toLocalDateStr(end) })
      .then((r) => setHistory(r.data)).catch(() => {})
    achievementsApi.list().then((r) => setBadges(r.data.data)).catch(() => {})
  }, [fetchToday])

  const done = tasks.filter((t) => t.status === 'approved').length
  const historyByDate = useMemo(() => {
    const map = new Map<string, TaskInstance[]>()
    for (const t of history) {
      const list = map.get(t.task_date) ?? []
      list.push(t)
      map.set(t.task_date, list)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [history])

  const handleSelfAdd = async (values: TaskFormValues) => {
    if (!user) return
    setSaving(true)
    try {
      await tasksApi.create({
        student_id: user.id,
        date: toLocalDateStr(new Date()),
        category: values.category,
        subject: values.subject,
        name: values.name,
        description: values.description,
        require_evidence: values.require_evidence,
        estimated_minutes: values.estimated_minutes,
        illustration_image_ids: values.images.map((i) => i.id),
      })
      addToast('已添加自主任务 ⭐', 'success')
      setSelfAddOpen(false)
      fetchToday()
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '添加失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-3">📋 我的任务</h1>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {([['today', '今日待办'], ['history', '历史'], ['badges', '成就']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`relative flex-1 py-2 rounded-lg text-sm font-medium ${tab === k ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
            {label}
            {k === 'badges' && hasNearAchievement(badges) && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <>
          <ChallengeCard items={badges} onOpen={() => setTab('badges')} />
          {!loading && tasks.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-600">今日进度</span>
                <span className="text-sm font-bold text-blue-600">{done} / {tasks.length}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-500" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          <button onClick={() => setSelfAddOpen(true)}
            className="w-full py-2.5 bg-white text-blue-600 rounded-xl text-sm font-medium shadow-sm mb-3 active:bg-gray-50 border border-blue-100">
            ⭐ 自主添加任务
          </button>

          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-gray-400 text-sm">今天没有任务，好好休息~</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => <TaskCheckinCard key={t.id} task={t} onChanged={fetchToday} />)}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        history.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无历史记录</div>
        ) : (
          <div className="space-y-3">
            {historyByDate.map(([d, list]) => (
              <div key={d}>
                <div className="text-xs text-gray-400 mb-1.5">{d}</div>
                <div className="space-y-1.5">
                  {list.map((t) => (
                    <div key={t.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-start gap-2">
                      <CategoryTag category={t.category} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800">{t.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{statusLabel(t)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'badges' && (
        <div className="grid grid-cols-2 gap-2.5">
          {badges.map((a) => (
            <div key={a.code} className={`rounded-2xl p-3.5 shadow-sm ${a.unlocked ? 'bg-white' : 'bg-gray-50'}`}>
              <div className={`text-3xl mb-1.5 ${a.unlocked ? '' : 'opacity-30 grayscale'}`}>{a.emoji}</div>
              <div className={`text-sm font-semibold ${a.unlocked ? 'text-gray-800' : 'text-gray-400'}`}>{a.title}</div>
              {a.unlocked ? <div className="text-xs text-green-600 mt-1">✓ 已解锁</div> : (
                <div className="text-[10px] text-gray-400 mt-1">{a.progress}/{a.target}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <TaskFormSheet
        open={selfAddOpen}
        title="自主添加任务"
        submitting={saving}
        onClose={() => setSelfAddOpen(false)}
        onSubmit={handleSelfAdd}
      />
    </div>
  )
}

function statusLabel(t: TaskInstance): string {
  switch (t.status) {
    case 'pending': return '未完成'
    case 'submitted': return '待家长检查'
    case 'rejected': return `需修改 · ${t.review_comment || '按要求订正后重新提交'}`
    case 'approved': return `${'⭐'.repeat(t.rating || 0)} ${t.review_comment || ''}`.trim()
  }
}

function TaskCheckinCard({ task, onChanged }: { task: TaskInstance; onChanged: () => void }) {
  const addToast = useToastStore((s) => s.addToast)
  const [evidence, setEvidence] = useState<PickedImage[]>([])
  const [note, setNote] = useState('')
  const [actualMinutes, setActualMinutes] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      await tasksApi.submit(task.id, { note, actual_minutes: actualMinutes, evidence_image_ids: evidence.map((e) => e.id) })
      addToast('已提交，等待家长检查', 'success')
      setEvidence([]); setNote('')
      onChanged()
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '提交失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const withdraw = async () => {
    try {
      await tasksApi.withdraw(task.id)
      addToast('已撤回', 'info')
      onChanged()
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '撤回失败', 'error')
    }
  }

  const canSubmit = task.status === 'pending' || task.status === 'rejected'
  const evidenceImgs = task.images.filter((i) => i.kind === 'evidence')
  const correctionImgs = task.images.filter((i) => i.kind === 'correction')

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <CategoryTag category={task.category} />
        {task.subject && <span className="text-xs text-blue-600 font-medium">{task.subject}</span>}
        {task.template_id != null && <span className="text-xs px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded">周期</span>}
        {task.source === 'auto_review' && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">记忆曲线</span>}
        {task.created_by_id === task.student_id && <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">⭐ 自主</span>}
      </div>
      <div className="text-sm font-medium text-gray-800">{task.name}</div>
      {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
      {task.estimated_minutes != null && (
        <div className="text-xs text-gray-400 mt-1">⏱ 预计 {task.estimated_minutes} 分钟</div>
      )}
      <Thumbnails images={task.images.filter((i) => i.kind === 'illustration')} size={14} />

      {/* 已提交的证据 */}
      {evidenceImgs.length > 0 && <Thumbnails images={evidenceImgs} size={18} />}

      {/* 需修改提示 */}
      {task.status === 'rejected' && (
        <div className="mt-2 bg-red-50 rounded-xl p-3">
          <div className="text-xs font-medium text-red-600 mb-1">❌ 需修改：{task.review_comment || '请按要求订正'}</div>
          {correctionImgs.length > 0 && (
            <div>
              <div className="text-xs text-red-500 mb-1">家长标注的问题：</div>
              <Thumbnails images={correctionImgs} size={18} />
            </div>
          )}
        </div>
      )}

      {/* 已通过 */}
      {task.status === 'approved' && (
        <div className="mt-2 text-xs text-green-600 bg-green-50 rounded-xl p-3">
          ✅ 已完成{task.rating ? ` · ${'⭐'.repeat(task.rating)}` : ''}{task.review_comment ? ` · ${task.review_comment}` : ''}
        </div>
      )}

      {/* 待检查 */}
      {task.status === 'submitted' && (
        <div className="mt-2 flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2">
          <span className="text-xs text-orange-600">🕐 已提交，等待家长检查</span>
          <button onClick={withdraw} className="text-xs text-gray-500 px-2 py-1 bg-white rounded-lg">撤回</button>
        </div>
      )}

      {/* 提交表单 */}
      {canSubmit && (
        <div className="mt-3 border-t border-gray-50 pt-3">
          {task.require_evidence && (
            <div className="mb-2">
              <div className="text-xs text-gray-500 mb-1">上传完成图片{task.require_evidence ? '（必传）' : ''}</div>
              <ImagePicker value={evidence} onChange={setEvidence} max={6} />
            </div>
          )}
          <input
            type="number"
            min={1}
            max={1440}
            value={actualMinutes ?? ''}
            onChange={(e) => setActualMinutes(e.target.value ? clampMinutes(Number(e.target.value)) : null)}
            placeholder="实际耗时（分钟，可选）"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 mb-2"
          />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="完成备注（可选）"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 resize-none mb-2" />
          <button onClick={submit} disabled={submitting || (task.require_evidence && evidence.length === 0)}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:bg-blue-300">
            {submitting ? '提交中...' : task.status === 'rejected' ? '重新提交' : '打卡提交'}
          </button>
        </div>
      )}
    </div>
  )
}
