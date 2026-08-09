import { useEffect, useState } from 'react'
import ImagePicker, { type PickedImage } from './ImagePicker'
import { useToastStore } from '../../../stores/toastStore'
import { CATEGORY_LABELS, SUBJECTS } from '../constants'
import type { TaskCategory } from '../../../types'

export interface TaskFormValues {
  category: TaskCategory
  subject: string
  name: string
  description: string
  require_evidence: boolean
  estimated_minutes: number | null
  images: PickedImage[]
}

interface TaskFormSheetProps {
  open: boolean
  title: string
  initial?: Partial<TaskFormValues>
  submitting?: boolean
  onClose: () => void
  onSubmit: (values: TaskFormValues) => void
}

const CATEGORIES: TaskCategory[] = ['learning', 'sports', 'chores']

export default function TaskFormSheet({ open, title, initial, submitting, onClose, onSubmit }: TaskFormSheetProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? 'learning')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [requireEvidence, setRequireEvidence] = useState(initial?.require_evidence ?? true)
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(initial?.estimated_minutes ?? null)
  const [images, setImages] = useState<PickedImage[]>(initial?.images ?? [])

  // 打开时锁定背景滚动，避免滑动穿透到主页
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h3 className="text-base font-bold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        {/* 内容（紧凑一屏） */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-3 space-y-3">
          {/* 分类 + 学科 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">分类</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    category === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {category === 'learning' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">学科</label>
              <div className="grid grid-cols-3 gap-1.5">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      subject === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 名称 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">任务名称 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="如：背诵第3课课文"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 要求（单行） */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">任务要求（可选）</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="预期要求、完成标准等"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 预计耗时 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">预计耗时（分钟，可选）</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={estimatedMinutes ?? ''}
              onChange={(e) => setEstimatedMinutes(e.target.value ? Math.min(Math.max(Number(e.target.value), 1), 1440) : null)}
              placeholder="如：30"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 插图 */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">任务插图（可选）</label>
            <ImagePicker value={images} onChange={setImages} hint="说明要学习的任务或要做的作业" />
          </div>

          {/* 需上传完成图片开关 */}
          <label className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
            <span className="text-sm text-gray-700">需上传完成图片</span>
            <button
              type="button"
              onClick={() => setRequireEvidence((v) => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${requireEvidence ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${requireEvidence ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {/* 底部提交（抬离工具栏/安全区） */}
        <div className="p-5 pt-2 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (!name.trim()) { addToast('请输入任务名称', 'error'); return }
              onSubmit({ category, subject, name: name.trim(), description, require_evidence: requireEvidence, estimated_minutes: estimatedMinutes, images })
            }}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:bg-blue-300 min-h-[44px]"
          >
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
