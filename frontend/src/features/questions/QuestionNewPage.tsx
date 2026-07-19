import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import { useToastStore } from '../../stores/toastStore'

const ERROR_TYPES = ['概念不清', '审题错误', '计算失误', '知识遗忘', '其他']
const SUBJECTS = ['数学', '物理', '化学', '英语', '语文', '其他']

type SolutionMode = 'text' | 'image'

export default function QuestionNewPage() {
  const [form, setForm] = useState({
    question_content: '', subject: '', tags: '', error_type: '', difficulty: 3, source: '',
    correct_solution: '', user_analysis: '',
  })
  const [questionImages, setQuestionImages] = useState<{ id: number; file_path: string }[]>([])
  const [solutionImages, setSolutionImages] = useState<{ id: number; file_path: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingSolution, setUploadingSolution] = useState(false)
  const [saving, setSaving] = useState(false)
  const [solutionMode, setSolutionMode] = useState<SolutionMode>('text')
  const questionInputRef = useRef<HTMLInputElement>(null)
  const solutionInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const handleQuestionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const { data } = await questionApi.uploadImage(files[i], 'question')
        setQuestionImages((prev) => [...prev, data])
      }
    } catch { addToast('图片上传失败', 'error') }
    finally {
      setUploading(false)
      if (questionInputRef.current) questionInputRef.current.value = ''
    }
  }

  const handleSolutionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingSolution(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const { data } = await questionApi.uploadImage(files[i], 'solution')
        setSolutionImages((prev) => [...prev, data])
      }
    } catch { addToast('图片上传失败', 'error') }
    finally {
      setUploadingSolution(false)
      if (solutionInputRef.current) solutionInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (questionImages.length === 0 && !form.question_content.trim()) {
      addToast('请上传题目图片或输入题目内容', 'error')
      return
    }
    if (solutionMode === 'text' && !form.correct_solution.trim() && solutionImages.length === 0) {
      addToast('请输入或上传正确解析', 'error')
      return
    }
    setSaving(true)
    try {
      await questionApi.create({
        ...form,
        tags: form.tags.split(/[,，\s]+/).filter(Boolean),
        image_ids: questionImages.map((i) => i.id),
        solution_image_ids: solutionImages.map((i) => i.id),
      })
      addToast('保存成功', 'success')
      navigate('/questions')
    } catch { addToast('保存失败', 'error') }
    finally { setSaving(false) }
  }

  const removeQuestionImage = (index: number) => {
    setQuestionImages((prev) => prev.filter((_, i) => i !== index))
  }

  const removeSolutionImage = (index: number) => {
    setSolutionImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="pb-8">
      <h1 className="text-lg font-bold text-gray-800 mb-4">新增错题</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 学科与错误类型 */}
        <div className="grid grid-cols-2 gap-3">
          <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base bg-white">
            <option value="">选择学科</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={form.error_type} onChange={(e) => setForm({ ...form, error_type: e.target.value })} className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base bg-white">
            <option value="">错误类型</option>
            {ERROR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="知识点标签（逗号分隔）" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base" />

        {/* 难度 */}
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setForm({ ...form, difficulty: n })}
              className={`flex-1 py-2 rounded-lg text-center text-lg ${form.difficulty >= n ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400'}`}
            >★</button>
          ))}
        </div>

        <input type="text" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="题目来源" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base" />

        {/* 📸 题目图片 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="text-sm font-medium text-gray-700 mb-2 block">📸 拍照或上传题目图片</label>
          {questionImages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
              {questionImages.map((img, idx) => (
                <div key={img.id} className="relative flex-shrink-0">
                  <img src={img.file_path} className="w-24 h-24 rounded-lg object-cover" alt="" />
                  <button type="button" onClick={() => removeQuestionImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <label className="w-full min-h-[100px] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-blue-400 transition-colors">
            {uploading ? (
              <span className="text-lg">⏳ 上传中...</span>
            ) : (
              <>
                <span className="text-3xl mb-1">📸</span>
                <span className="text-sm">点击拍照或选择图片</span>
                <span className="text-xs text-gray-300 mt-1">支持多张图片</span>
              </>
            )}
            <input ref={questionInputRef} type="file" accept="image/*" onChange={handleQuestionImageUpload} multiple className="hidden" />
          </label>
        </div>

        {/* 正确解析区域 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium text-gray-700">正确解析</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button type="button" onClick={() => setSolutionMode('text')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${solutionMode === 'text' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >文字解析</button>
              <button type="button" onClick={() => setSolutionMode('image')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${solutionMode === 'image' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >图片解析</button>
            </div>
          </div>

          {solutionMode === 'text' ? (
            <textarea value={form.correct_solution} onChange={(e) => setForm({ ...form, correct_solution: e.target.value })} placeholder="输入正确解析..." rows={4} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base resize-none" />
          ) : (
            <div>
              {solutionImages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                  {solutionImages.map((img, idx) => (
                    <div key={img.id} className="relative flex-shrink-0">
                      <img src={img.file_path} className="w-24 h-24 rounded-lg object-cover" alt="" />
                      <button type="button" onClick={() => removeSolutionImage(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="w-full min-h-[80px] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-blue-400 transition-colors">
                {uploadingSolution ? (
                  <span className="text-lg">⏳ 上传中...</span>
                ) : (
                  <>
                    <span className="text-2xl mb-1">🖼️</span>
                    <span className="text-sm">上传解析图片</span>
                  </>
                )}
                <input ref={solutionInputRef} type="file" accept="image/*" onChange={handleSolutionImageUpload} multiple className="hidden" />
              </label>
            </div>
          )}
        </div>

        {/* 反思笔记 */}
        <textarea value={form.user_analysis} onChange={(e) => setForm({ ...form, user_analysis: e.target.value })} placeholder="个人反思笔记（可选）" rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base resize-none" />

        <button type="submit" disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-base disabled:opacity-50">
          {saving ? '保存中...' : '保存错题'}
        </button>
      </form>
    </div>
  )
}