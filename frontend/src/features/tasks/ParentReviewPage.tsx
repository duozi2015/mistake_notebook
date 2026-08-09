import { useCallback, useEffect, useState } from 'react'
import { familyApi, tasksApi } from '../../services/tasks'
import { useToastStore } from '../../stores/toastStore'
import CategoryTag from './components/CategoryTag'
import Thumbnails from './components/Thumbnails'
import StarsPicker from './components/StarsPicker'
import ImagePicker, { type PickedImage } from './components/ImagePicker'
import type { TaskInstance } from '../../types'

type Mode = 'approve' | 'reject' | null

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function ParentReviewPage() {
  const addToast = useToastStore((s) => s.addToast)
  const [allTasks, setAllTasks] = useState<TaskInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>(null)
  const [current, setCurrent] = useState<TaskInstance | null>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [corrections, setCorrections] = useState<PickedImage[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 批改弹层打开时锁定背景滚动
  useEffect(() => {
    if (!mode) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mode])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const childRes = await familyApi.children()
      const active = childRes.data.filter((c) => c.status === 'active')
      const today = toLocalDateStr(new Date())
      const lists = await Promise.all(
        active.map((c) => tasksApi.daily({ student_id: c.student_id, date: today })),
      )
      const submitted = lists.flatMap((r, i) =>
        r.data.filter((t) => t.status === 'submitted').map((t) => ({ ...t, _child: active[i].display_name || active[i].username })),
      )
      setAllTasks(submitted)
    } catch {
      addToast('加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchData() }, [fetchData])

  const open = (t: TaskInstance, m: Exclude<Mode, null>) => {
    setCurrent(t)
    setMode(m)
    setRating(5)
    setComment('')
    setCorrections([])
  }

  const doReview = async () => {
    if (!current) return
    setSubmitting(true)
    try {
      const result: 'approved' | 'rejected' = mode === 'approve' ? 'approved' : 'rejected'
      const payload = {
        result,
        comment,
        version: current.version,
        ...(result === 'approved' ? { rating } : { correction_image_ids: corrections.map((c) => c.id) }),
      }
      await tasksApi.review(current.id, payload)
      addToast(mode === 'approve' ? '已通过' : '已退回需修改', 'success')
      setMode(null)
      setCurrent(null)
      fetchData()
    } catch (err: any) {
      if (err.response?.status === 409) {
        addToast('任务已被他人批改，已刷新', 'error')
        setMode(null)
        fetchData()
      } else {
        addToast(err.response?.data?.detail?.message || '操作失败', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-3">🔍 检查台</h1>
      <p className="text-xs text-gray-400 mb-4">孩子已提交的任务，可查看完成图片并批改（通过 / 需修改）</p>

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
      ) : allTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-gray-400 text-sm">暂无待检查任务</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allTasks.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CategoryTag category={t.category} />
                {t.subject && <span className="text-xs text-blue-600 font-medium">{t.subject}</span>}
                <span className="text-xs text-gray-400">{(t as unknown as { _child: string })._child}</span>
              </div>
              <div className="text-sm font-medium text-gray-800 mb-1">{t.name}</div>
              {t.checkin_note && <p className="text-xs text-gray-500 mb-1">📝 {t.checkin_note}</p>}
              {t.estimated_minutes != null && t.actual_minutes != null && (
                <p className="text-xs text-gray-400 mb-1">⏱ 预计 {t.estimated_minutes} 分钟 · 实际 {t.actual_minutes} 分钟</p>
              )}
              <Thumbnails images={t.images.filter((i) => i.kind === 'evidence')} size={20} />
              <div className="flex gap-2 mt-3">
                <button onClick={() => open(t, 'approve')} className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium active:bg-green-700">
                  通过 ✓
                </button>
                <button onClick={() => open(t, 'reject')} className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium active:bg-red-100">
                  需修改
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 批改弹层 */}
      {mode && current && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMode(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-5 pb-2 shrink-0">
              <h3 className="text-base font-bold text-gray-800">{mode === 'approve' ? '通过任务' : '退回需修改'}</h3>
              <button type="button" onClick={() => setMode(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-2">
            <p className="text-sm font-medium text-gray-700 mb-3">{current.name}</p>

            {mode === 'approve' ? (
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1.5 block">星级评分</label>
                <StarsPicker value={rating} onChange={setRating} />
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1.5 block">纠错图片（指出问题，可选）</label>
                <ImagePicker value={corrections} onChange={setCorrections} max={4} />
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1 block">评语（可选）</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder={mode === 'reject' ? '请说明哪里需要修改' : '给孩子一句鼓励'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>

            </div>
            <div className="p-5 pt-2 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={doReview}
                className="w-full py-3 rounded-xl text-sm font-medium text-white active:opacity-90 disabled:opacity-50 min-h-[44px]"
                style={{ backgroundColor: mode === 'approve' ? '#16a34a' : '#dc2626' }}
              >
                {submitting ? '提交中...' : mode === 'approve' ? '确认通过' : '确认退回'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
