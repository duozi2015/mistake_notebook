import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { familyApi, tasksApi } from '../../services/tasks'
import { useToastStore } from '../../stores/toastStore'
import CategoryTag from './components/CategoryTag'
import Thumbnails from './components/Thumbnails'
import TaskFormSheet, { type TaskFormValues } from './components/TaskFormSheet'
import { STATUS_LABELS, statusRank } from './constants'
import { toLocalDateStr } from '../../utils/format'
import type { FamilyChild, TaskInstance, TaskStatus } from '../../types'

const STATUS_OPTIONS: [TaskStatus | 'all', string][] = [
  ['all', '全部'],
  ['pending', '待完成'],
  ['submitted', '待检查'],
  ['rejected', '需修改'],
  ['approved', '已完成'],
]

export default function TaskManagePage() {
  const addToast = useToastStore((s) => s.addToast)
  const [searchParams, setSearchParams] = useSearchParams()
  const [children, setChildren] = useState<FamilyChild[]>([])
  const [studentId, setStudentId] = useState<number | null>(null)
  const [dateStr, setDateStr] = useState(() => toLocalDateStr(new Date()))
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [loading, setLoading] = useState(false)
  const [sheet, setSheet] = useState<{ mode: 'add' | 'edit'; task?: TaskInstance } | null>(null)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>(() => {
    const s = searchParams.get('status')
    return s === 'pending' || s === 'submitted' || s === 'rejected' || s === 'approved' ? s : 'all'
  })

  const applyStatusFilter = (v: TaskStatus | 'all') => {
    setStatusFilter(v)
    const next = new URLSearchParams(searchParams)
    if (v === 'all') next.delete('status')
    else next.set('status', v)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    familyApi.children().then((res) => {
      const active = res.data.filter((c) => c.status === 'active')
      setChildren(active)
      if (active.length) setStudentId((prev) => prev ?? active[0].student_id)
    })
  }, [])

  const fetchTasks = useCallback(async (sid: number, d: string) => {
    setLoading(true)
    try {
      const res = await tasksApi.daily({ student_id: sid, date: d })
      setTasks(res.data)
    } catch {
      addToast('加载任务失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (studentId != null) fetchTasks(studentId, dateStr)
  }, [studentId, dateStr, fetchTasks])

  const grouped = useMemo(() => {
    // 未完成(待完成/待检查/需修改)在前，已完成在后；同状态内按分类
    const categoryOrder: Record<string, number> = { learning: 0, sports: 1, chores: 2 }
    return tasks
      .filter((t) => statusFilter === 'all' || t.status === statusFilter)
      .sort((a, b) => {
        const sr = statusRank(a.status) - statusRank(b.status)
        if (sr !== 0) return sr
        return categoryOrder[a.category] - categoryOrder[b.category]
      })
  }, [tasks, statusFilter])

  const handleAdd = async (values: TaskFormValues) => {
    if (studentId == null) {
      addToast('请先在「设置」中关联孩子', 'error')
      return
    }
    setSaving(true)
    try {
      await tasksApi.create({
        student_id: studentId,
        date: dateStr,
        category: values.category,
        subject: values.subject,
        name: values.name,
        description: values.description,
        require_evidence: values.require_evidence,
        estimated_minutes: values.estimated_minutes,
        illustration_image_ids: values.images.map((i) => i.id),
      })
      addToast('已添加', 'success')
      setSheet(null)
      fetchTasks(studentId, dateStr)
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '添加失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (values: TaskFormValues) => {
    const t = sheet?.task
    if (!t) return
    setSaving(true)
    try {
      await tasksApi.update(t.id, {
        category: values.category,
        subject: values.subject,
        name: values.name,
        description: values.description,
        require_evidence: values.require_evidence,
        estimated_minutes: values.estimated_minutes,
        illustration_image_ids: values.images.map((i) => i.id),
        version: t.version,
      })
      addToast('已保存', 'success')
      setSheet(null)
      if (studentId != null) fetchTasks(studentId, dateStr)
    } catch (err: any) {
      if (err.response?.status === 409) {
        addToast('任务已被他人修改，已刷新', 'error')
        if (studentId != null) fetchTasks(studentId, dateStr)
        setSheet(null)
      } else {
        addToast(err.response?.data?.detail?.message || '保存失败', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: TaskInstance) => {
    if (!window.confirm(`删除「${t.name}」？`)) return
    try {
      await tasksApi.remove(t.id)
      addToast('已删除', 'success')
      if (studentId != null) fetchTasks(studentId, dateStr)
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '删除失败', 'error')
    }
  }

  const handleCopy = async () => {
    if (studentId == null) return
    setCopying(true)
    try {
      const res = await tasksApi.copy({ student_id: studentId, date: dateStr })
      addToast(`已复制昨日 ${res.data.copied} 项${res.data.skipped ? `（跳过重复 ${res.data.skipped} 项）` : ''}`, 'success')
      fetchTasks(studentId, dateStr)
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '复制失败', 'error')
    } finally {
      setCopying(false)
    }
  }

  const shiftDate = (delta: number) => {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    setDateStr(toLocalDateStr(d))
  }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-3">📋 今日任务</h1>

      {/* 孩子切换 */}
      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          {children.map((c) => (
            <button
              key={c.student_id}
              onClick={() => setStudentId(c.student_id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium ${
                studentId === c.student_id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {c.display_name || c.username}
            </button>
          ))}
        </div>
      )}

      {/* 日期选择 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => shiftDate(-1)} className="w-9 h-9 bg-white rounded-xl shadow-sm text-gray-600 text-lg active:bg-gray-50">‹</button>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value || toLocalDateStr(new Date()))}
          className="flex-1 px-3 py-2 bg-white rounded-xl shadow-sm text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button onClick={() => shiftDate(1)} className="w-9 h-9 bg-white rounded-xl shadow-sm text-gray-600 text-lg active:bg-gray-50">›</button>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSheet({ mode: 'add' })}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700"
        >
          + 新增任务
        </button>
        <button
          onClick={handleCopy}
          disabled={copying || studentId == null}
          className="flex-1 py-2.5 bg-white text-blue-600 rounded-xl text-sm font-medium shadow-sm active:bg-gray-50 disabled:opacity-50"
        >
          {copying ? '复制中...' : '复制昨日'}
        </button>
      </div>

      {/* 状态过滤 */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {STATUS_OPTIONS.map(([v, label]) => (
          <button
            key={v}
            onClick={() => applyStatusFilter(v)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
              statusFilter === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {children.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">请先在「设置」中关联孩子</div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl animate-pulse" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📭</div>
          <p className="text-gray-400 text-sm">
            {statusFilter === 'all' ? '当天没有任务，点「新增任务」或「复制昨日」' : '没有该状态的任务'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <CategoryTag category={t.category} />
                    {t.subject && <span className="text-xs text-blue-600 font-medium">{t.subject}</span>}
                    {t.template_id != null && <span className="text-xs px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded">周期</span>}
                    {t.source === 'auto_review' && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">记忆曲线</span>}
                    <span className="text-xs text-gray-400">{STATUS_LABELS[t.status]}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800">{t.name}</div>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                  {(t.estimated_minutes || t.actual_minutes) && (
                    <div className="text-xs text-gray-400 mt-1">
                      {t.estimated_minutes ? `⏱ 预计 ${t.estimated_minutes} 分钟` : ''}
                      {t.actual_minutes ? ` · 实际 ${t.actual_minutes} 分钟` : ''}
                    </div>
                  )}
                  <Thumbnails images={t.images.filter((i) => i.kind === 'illustration')} size={14} />
                  {t.rating != null && <div className="text-xs text-orange-500 mt-1">{'⭐'.repeat(t.rating)}</div>}
                </div>
                {t.status !== 'approved' && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => setSheet({ mode: 'edit', task: t })}
                      className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-xs active:bg-gray-100"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="px-3 py-1 bg-gray-50 text-red-500 rounded-lg text-xs active:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <TaskFormSheet
          open
          title={sheet.mode === 'add' ? '新增任务' : '编辑任务'}
          submitting={saving}
          initial={sheet.mode === 'edit' && sheet.task ? {
            category: sheet.task.category,
            subject: sheet.task.subject,
            name: sheet.task.name,
            description: sheet.task.description,
            require_evidence: sheet.task.require_evidence,
            estimated_minutes: sheet.task.estimated_minutes,
            images: sheet.task.images.filter((i) => i.kind === 'illustration').map((i) => ({ id: i.id, file_path: i.file_path })),
          } : undefined}
          onClose={() => setSheet(null)}
          onSubmit={sheet.mode === 'add' ? handleAdd : handleEdit}
        />
      )}
    </div>
  )
}
