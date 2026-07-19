import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import type { Question } from '../../types'
import ImageViewer from '../../components/Shared/ImageViewer'

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentSolutionImageIndex, setCurrentSolutionImageIndex] = useState(0)
  const [showSolution, setShowSolution] = useState(false)
  const [viewerState, setViewerState] = useState<{ images: { src: string }[]; index: number } | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    questionApi.get(Number(id)).then(({ data }) => setQuestion(data)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-20"><div className="animate-spin text-4xl">⏳</div></div>
  if (!question) return <div className="text-center py-20 text-gray-400">题目不存在</div>

  const hasQuestionImages = question.images && question.images.length > 0
  const hasSolutionImages = question.solution_images && question.solution_images.length > 0

  return (
    <div className="pb-8">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4">← 返回</button>

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

      {viewerState && (
        <ImageViewer images={viewerState.images} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />
      )}
    </div>
  )
}