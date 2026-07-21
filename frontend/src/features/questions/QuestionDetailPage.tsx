import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import { useToastStore } from '../../stores/toastStore'
import type { Question } from '../../types'
import ImageViewer from '../../components/Shared/ImageViewer'

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentSolutionImageIndex, setCurrentSolutionImageIndex] = useState(0)
  const [showSolution, setShowSolution] = useState(false)
  const [viewerState, setViewerState] = useState<{ images: { src: string }[]; index: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    question_content: '',
    subject: '',
    error_type: '',
    difficulty: 3,
    source: '',
    correct_solution: '',
    user_analysis: '',
    tags: '',
  })

  const fetchQuestion = (questionId: number) => {
    setLoading(true)
    questionApi.get(questionId)
      .then(({ data }) => {
        setQuestion(data)
        setEditForm({
          question_content: data.question_content || '',
          subject: data.subject || '',
          error_type: data.error_type || '',
          difficulty: data.difficulty,
          source: data.source || '',
          correct_solution: data.correct_solution || '',
          user_analysis: data.user_analysis || '',
          tags: data.tags.join(', '),
        })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!id) return
    fetchQuestion(Number(id))
  }, [id])

  const handleSave = async () => {
    if (!question) return
    setSaving(true)
    try {
      const tags = editForm.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean)

      const { data } = await questionApi.update(question.id, {
        question_content: editForm.question_content,
        subject: editForm.subject,
        error_type: editForm.error_type,
        difficulty: editForm.difficulty,
        source: editForm.source,
        correct_solution: editForm.correct_solution,
        user_analysis: editForm.user_analysis,
        tags,
      })
      setQuestion(data)
      setEditing(false)
      addToast('题目已更新', 'success')
    } catch {
      addToast('保存失败，请重试', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-20"><div className="animate-spin text-4xl">⏳</div></div>
  if (!question) return <div className="text-center py-20 text-gray-400">题目不存在</div>

  const hasQuestionImages = question.images && question.images.length > 0
  const hasSolutionImages = question.solution_images && question.solution_images.length > 0

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="text-blue-600 text-sm">← 返回</button>
        <div className="flex gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium active:bg-gray-200 min-h-[36px]"
            >
              ✏️ 编辑
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => { setEditing(false); fetchQuestion(question.id) }}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium active:bg-gray-200 min-h-[36px]"
                disabled={saving}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:bg-blue-700 min-h-[36px]"
                disabled={saving}
              >
                {saving ? '保存中...' : '💾 保存'}
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        /* ── 编辑模式 ── */
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">科目</label>
            <input
              type="text" value={editForm.subject}
              onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              placeholder="例如：数学、物理"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">难度（1-5）</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setEditForm({ ...editForm, difficulty: d })}
                  className={`w-9 h-9 rounded-lg text-sm font-medium ${
                    editForm.difficulty === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >{d}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">错误类型</label>
            <input
              type="text" value={editForm.error_type}
              onChange={(e) => setEditForm({ ...editForm, error_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              placeholder="例如：计算错误、概念不清"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">标签（逗号分隔）</label>
            <input
              type="text" value={editForm.tags}
              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              placeholder="函数、二次函数"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">来源</label>
            <input
              type="text" value={editForm.source}
              onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              placeholder="例如：月考、期中考试"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">题目内容</label>
            <textarea
              value={editForm.question_content}
              onChange={(e) => setEditForm({ ...editForm, question_content: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 min-h-[100px]"
              placeholder="输入题目内容"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">正确答案</label>
            <textarea
              value={editForm.correct_solution}
              onChange={(e) => setEditForm({ ...editForm, correct_solution: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 min-h-[80px]"
              placeholder="输入正确答案"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">反思笔记</label>
            <textarea
              value={editForm.user_analysis}
              onChange={(e) => setEditForm({ ...editForm, user_analysis: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 min-h-[80px]"
              placeholder="输入反思笔记"
            />
          </div>
        </div>
      ) : (
        <>
        {/* 查看模式 */}

        {/* 元信息 */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-blue-600 font-medium">{question.subject || '未分类'}</span>
          <span className="text-xs text-gray-400">{'★'.repeat(question.difficulty)}{'☆'.repeat(5 - question.difficulty)}</span>
          {question.error_type && <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-xs ml-auto">{question.error_type}</span>}
        </div>
        {question.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {question.tags.map((t) => <span key={t} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{t}</span>)}
          </div>
        )}

        {/* 题目图片轮播 */}
        {hasQuestionImages ? (
          <div>
            <div className="relative rounded-xl overflow-hidden bg-gray-50 mb-2">
              <img
                src={question.images[currentImageIndex].file_path}
                className="w-full max-h-[400px] object-contain mx-auto cursor-pointer"
                alt="题目图片"
                onClick={() => setViewerState({
                  images: question.images.map((img) => ({ src: img.file_path })),
                  index: currentImageIndex,
                })}
              />
              {question.images.length > 1 && (
                <>
                  {currentImageIndex > 0 && (
                    <button
                      onClick={() => setCurrentImageIndex((i) => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 text-white rounded-full flex items-center justify-center text-lg"
                    >‹</button>
                  )}
                  {currentImageIndex < question.images.length - 1 && (
                    <button
                      onClick={() => setCurrentImageIndex((i) => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 text-white rounded-full flex items-center justify-center text-lg"
                    >›</button>
                  )}
                </>
              )}
            </div>
            {question.images.length > 1 && (
              <div className="flex justify-center gap-1.5 mb-1">
                {question.images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full ${idx === currentImageIndex ? 'bg-blue-600' : 'bg-gray-300'}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : question.question_content ? (
          <div className="text-gray-800 whitespace-pre-wrap text-base leading-relaxed">{question.question_content}</div>
        ) : null}
      </div>

      {/* 正确解析 */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <button onClick={() => setShowSolution(!showSolution)} className="flex items-center justify-between w-full text-left mb-2">
          <span className="font-medium text-gray-700">正确解析</span>
          <span className="text-gray-400 transition-transform" style={{ transform: showSolution ? 'rotate(180deg)' : '' }}>▼</span>
        </button>
        {showSolution && (
          <div className="border-t pt-3">
            {/* 解析图片 */}
            {hasSolutionImages && (
              <div className="mb-3">
                <div className="relative rounded-xl overflow-hidden bg-gray-50">
                  <img
                    src={question.solution_images[currentSolutionImageIndex].file_path}
                    className="w-full max-h-[400px] object-contain mx-auto cursor-pointer"
                    alt="解析图片"
                    onClick={() => setViewerState({
                      images: question.solution_images.map((img) => ({ src: img.file_path })),
                      index: currentSolutionImageIndex,
                    })}
                  />
                  {question.solution_images.length > 1 && (
                    <>
                      {currentSolutionImageIndex > 0 && (
                        <button
                          onClick={() => setCurrentSolutionImageIndex((i) => i - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 text-white rounded-full flex items-center justify-center text-lg"
                        >‹</button>
                      )}
                      {currentSolutionImageIndex < question.solution_images.length - 1 && (
                        <button
                          onClick={() => setCurrentSolutionImageIndex((i) => i + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 text-white rounded-full flex items-center justify-center text-lg"
                        >›</button>
                      )}
                    </>
                  )}
                </div>
                {question.solution_images.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-2">
                    {question.solution_images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSolutionImageIndex(idx)}
                        className={`w-2 h-2 rounded-full ${idx === currentSolutionImageIndex ? 'bg-blue-600' : 'bg-gray-300'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* 解析文字 */}
            {question.correct_solution && (
              <div className="text-gray-700 whitespace-pre-wrap text-base leading-relaxed">
                {question.correct_solution}
              </div>
            )}
            {!hasSolutionImages && !question.correct_solution && (
              <div className="text-gray-400 text-sm">暂无解析</div>
            )}
          </div>
        )}
      </div>

      {/* 反思笔记 */}
      {question.user_analysis && (
        <div className="bg-yellow-50 rounded-xl p-4 shadow-sm">
          <div className="font-medium text-gray-700 mb-2">📝 反思笔记</div>
          <div className="text-gray-700 whitespace-pre-wrap text-sm">{question.user_analysis}</div>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center mt-4">
        创建于 {new Date(question.created_at).toLocaleString()}
      </div>
        </>
      )}

      {viewerState && (
        <ImageViewer images={viewerState.images} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />
      )}
    </div>
  )
}