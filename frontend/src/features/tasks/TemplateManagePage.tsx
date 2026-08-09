import { useCallback, useEffect, useState } from 'react'
import { familyApi, tasksApi } from '../../services/tasks'
import { useToastStore } from '../../stores/toastStore'
import CategoryTag from './components/CategoryTag'
import Thumbnails from './components/Thumbnails'
import TemplateFormSheet, { type TemplateFormValues } from './components/TemplateFormSheet'
import { WEEKDAYS } from './constants'
import type { FamilyChild, TaskTemplate } from '../../types'

function repeatLabel(t: TaskTemplate): string {
  if (t.repeat_type === 'daily') return '每天'
  if (t.repeat_type === 'weekly') return `每周${t.repeat_weekdays.map((i) => WEEKDAYS[i]).join('、')}`
  return '仅一次'
}

export default function TemplateManagePage() {
  const addToast = useToastStore((s) => s.addToast)
  const [children, setChildren] = useState<FamilyChild[]>([])
  const [studentId, setStudentId] = useState<number | null>(null)
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [sheet, setSheet] = useState<{ mode: 'add' | 'edit'; template?: TaskTemplate } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    familyApi.children().then((res) => {
      const active = res.data.filter((c) => c.status === 'active')
      setChildren(active)
      if (active.length) setStudentId((prev) => prev ?? active[0].student_id)
    })
  }, [])

  const fetchTemplates = useCallback(async (sid: number) => {
    setLoading(true)
    try {
      const res = await tasksApi.templates(sid)
      setTemplates(res.data)
    } catch {
      addToast('加载模板失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (studentId != null) fetchTemplates(studentId)
  }, [studentId, fetchTemplates])

  const handleAdd = async (values: TemplateFormValues) => {
    if (studentId == null) return
    setSaving(true)
    try {
      await tasksApi.createTemplate({
        student_id: studentId,
        category: values.category,
        subject: values.subject,
        name: values.name,
        description: values.description,
        require_evidence: values.require_evidence,
        repeat_type: values.repeat_type,
        repeat_weekdays: values.repeat_weekdays,
        start_date: values.start_date || undefined,
        end_date: values.end_date || undefined,
        illustration_image_ids: values.images.map((i) => i.id),
      })
      addToast('模板已创建', 'success')
      setSheet(null)
      fetchTemplates(studentId)
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '创建失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (values: TemplateFormValues) => {
    const t = sheet?.template
    if (!t) return
    setSaving(true)
    try {
      await tasksApi.updateTemplate(t.id, {
        category: values.category,
        subject: values.subject,
        name: values.name,
        description: values.description,
        require_evidence: values.require_evidence,
        repeat_type: values.repeat_type,
        repeat_weekdays: values.repeat_weekdays,
        start_date: values.start_date || undefined,
        end_date: values.end_date || undefined,
        illustration_image_ids: values.images.map((i) => i.id),
        version: t.version,
      })
      addToast('模板已更新', 'success')
      setSheet(null)
      fetchTemplates(studentId as number)
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (t: TaskTemplate) => {
    if (!window.confirm(`归档模板「${t.name}」？（将不再生成新任务）`)) return
    try {
      await tasksApi.deleteTemplate(t.id)
      addToast('已归档', 'success')
      if (studentId != null) fetchTemplates(studentId)
    } catch (err: any) {
      addToast(err.response?.data?.detail?.message || '操作失败', 'error')
    }
  }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-bold text-gray-800 mb-3">🔁 周期模板</h1>
      <p className="text-xs text-gray-400 mb-4">设置后每日/每周自动为孩子生成任务</p>

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

      <button onClick={() => setSheet({ mode: 'add' })}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium mb-4 active:bg-blue-700">
        + 新建模板
      </button>

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🗂️</div>
          <p className="text-gray-400 text-sm">暂无模板</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <CategoryTag category={t.category} />
                    {t.subject && <span className="text-xs text-blue-600 font-medium">{t.subject}</span>}
                    <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{repeatLabel(t)}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800">{t.name}</div>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                  <Thumbnails images={t.images.filter((i) => i.kind === 'illustration')} size={14} />
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => setSheet({ mode: 'edit', template: t })}
                    className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-xs active:bg-gray-100">编辑</button>
                  <button onClick={() => handleArchive(t)}
                    className="px-3 py-1 bg-gray-50 text-red-500 rounded-lg text-xs active:bg-red-50">归档</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <TemplateFormSheet
          open
          title={sheet.mode === 'add' ? '新建模板' : '编辑模板'}
          submitting={saving}
          initial={sheet.mode === 'edit' && sheet.template ? {
            category: sheet.template.category,
            subject: sheet.template.subject,
            name: sheet.template.name,
            description: sheet.template.description,
            require_evidence: sheet.template.require_evidence,
            repeat_type: sheet.template.repeat_type,
            repeat_weekdays: sheet.template.repeat_weekdays,
            start_date: sheet.template.start_date || undefined,
            end_date: sheet.template.end_date || undefined,
            images: sheet.template.images.filter((i) => i.kind === 'illustration').map((i) => ({ id: i.id, file_path: i.file_path })),
          } : undefined}
          onClose={() => setSheet(null)}
          onSubmit={sheet.mode === 'add' ? handleAdd : handleEdit}
        />
      )}
    </div>
  )
}
