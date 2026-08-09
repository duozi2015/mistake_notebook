import { useState } from 'react'
import ImagePicker, { type PickedImage } from './ImagePicker'
import { CATEGORY_LABELS, SUBJECTS, WEEKDAYS } from '../constants'
import type { TaskCategory } from '../../../types'

export interface TemplateFormValues {
  category: TaskCategory
  subject: string
  name: string
  description: string
  require_evidence: boolean
  repeat_type: 'none' | 'daily' | 'weekly'
  repeat_weekdays: number[]
  start_date: string
  end_date: string
  images: PickedImage[]
}

interface TemplateFormSheetProps {
  open: boolean
  title: string
  initial?: Partial<TemplateFormValues>
  submitting?: boolean
  onClose: () => void
  onSubmit: (values: TemplateFormValues) => void
}

const CATEGORIES: TaskCategory[] = ['learning', 'sports', 'chores']

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TemplateFormSheet({ open, title, initial, submitting, onClose, onSubmit }: TemplateFormSheetProps) {
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? 'learning')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [requireEvidence, setRequireEvidence] = useState(initial?.require_evidence ?? true)
  const [repeatType, setRepeatType] = useState<'none' | 'daily' | 'weekly'>(initial?.repeat_type ?? 'none')
  const [weekdays, setWeekdays] = useState<number[]>(initial?.repeat_weekdays ?? [])
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayStr())
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [images, setImages] = useState<PickedImage[]>(initial?.images ?? [])

  if (!open) return null

  const valid = name.trim().length > 0 && (category !== 'learning' || subject) && (repeatType !== 'weekly' || weekdays.length > 0)

  const toggleWeekday = (i: number) =>
    setWeekdays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl p-5 max-h-[88vh] overflow-y-auto safe-area-bottom">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">分类</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`py-2.5 rounded-xl text-sm font-medium border-2 ${category === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {category === 'learning' && (
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1.5 block">学科</label>
            <div className="flex gap-2">
              {SUBJECTS.map((s) => (
                <button key={s} type="button" onClick={() => setSubject(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${subject === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">任务名称 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="如：语文背诵"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">任务要求（可选）</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1.5 block">重复周期</label>
          <div className="grid grid-cols-3 gap-2">
            {([['none', '不重复'], ['daily', '每天'], ['weekly', '每周']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setRepeatType(v)}
                className={`py-2.5 rounded-xl text-sm font-medium border-2 ${repeatType === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>
          {repeatType === 'weekly' && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" onClick={() => toggleWeekday(i)}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-medium ${weekdays.includes(i) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {w}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">生效起始日</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">生效截止日（可选）</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1.5 block">任务插图（可选）</label>
          <ImagePicker value={images} onChange={setImages} />
        </div>

        <label className="mt-4 flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
          <span className="text-sm text-gray-700">需上传完成图片</span>
          <button type="button" onClick={() => setRequireEvidence((v) => !v)}
            className={`w-11 h-6 rounded-full transition-colors relative ${requireEvidence ? 'bg-blue-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${requireEvidence ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>

        <button type="button" disabled={!valid || submitting} onClick={() => onSubmit({
          category, subject, name: name.trim(), description, require_evidence: requireEvidence,
          repeat_type: repeatType, repeat_weekdays: weekdays, start_date: startDate, end_date: endDate, images,
        })}
          className="mt-5 w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:bg-blue-300 min-h-[44px]">
          {submitting ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
