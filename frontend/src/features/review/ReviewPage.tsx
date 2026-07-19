import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { reviewApi } from '../../services/reviews'
import { useToastStore } from '../../stores/toastStore'
import type { Question } from '../../types'
import ImageViewer from '../../components/Shared/ImageViewer'

const QUALITY_OPTIONS = [
  { value: 0, label: 'Again', hint: '完全忘记', color: 'bg-red-500 active:bg-red-600', textColor: 'text-white' },
  { value: 1, label: 'Hard', hint: '很困难', color: 'bg-orange-500 active:bg-orange-600', textColor: 'text-white' },
  { value: 2, label: 'Medium', hint: '中等', color: 'bg-amber-500 active:bg-amber-600', textColor: 'text-white' },
  { value: 3, label: 'Good', hint: '良好', color: 'bg-lime-500 active:bg-lime-600', textColor: 'text-white' },
  { value: 4, label: 'Very', hint: '很好', color: 'bg-green-500 active:bg-green-600', textColor: 'text-white' },
  { value: 5, label: 'Easy', hint: '简单', color: 'bg-teal-500 active:bg-teal-600', textColor: 'text-white' },
] as const

type PageState = 'loading' | 'ready' | 'empty' | 'error'

export default function ReviewPage() {
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [pageState, setPageState] = useState<PageState>('loading')
  const [questions, setQuestions] = useState<Question[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ratings, setRatings] = useState<{ questionId: number; quality: number }[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [viewerState, setViewerState] = useState<{ images: { src: string }[]; index: number } | null>(null)

  const loadDaily = useCallback(async () => {
    setPageState('loading')
    try {
      const { data } = await reviewApi.getDaily()
      if (data.data.length === 0) {
        setPageState('empty')
      } else {
        setQuestions(data.data)
        setTotalCount(data.pagination.total)
        setCurrentIndex(0)
        setShowAnswer(false)
        setRatings([])
        setPageState('ready')
      }
    } catch {
      setPageState('error')
    }
  }, [])

  useEffect(() => {
    loadDaily()
  }, [loadDaily])

  const subjects = useMemo(
    () => Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))).sort(),
    [questions],
  )
  const filteredQuestions = useMemo(
    () => selectedSubject ? questions.filter((q) => q.subject === selectedSubject) : questions,
    [questions, selectedSubject],
  )
  const filteredTotalCount = selectedSubject ? filteredQuestions.length : totalCount

  const currentQuestion = useMemo(
    () => filteredQuestions[currentIndex] ?? null,
    [filteredQuestions, currentIndex],
  )

  const isLastQuestion = currentIndex >= filteredQuestions.length - 1
  const reviewedCount = ratings.length
  const progress = filteredTotalCount > 0 ? (reviewedCount / filteredTotalCount) * 100 : 0

  const correctCount = ratings.filter((r) => r.quality >= 3).length
  const accuracy = reviewedCount > 0 ? Math.round((correctCount / reviewedCount) * 100) : 0

  const handleRate = useCallback(
    async (quality: number) => {
      if (!currentQuestion || submitting) return

      setSubmitting(true)
      try {
        await reviewApi.submit(currentQuestion.id, quality)

        const newRatings = [...ratings, { questionId: currentQuestion.id, quality }]
        setRatings(newRatings)
        setShowAnswer(false)

        if (isLastQuestion) {
          const totalReviewed = newRatings.length
          const correctSoFar = newRatings.filter((r) => r.quality >= 3).length
          const finalAccuracy = Math.round((correctSoFar / totalReviewed) * 100)

          const distribution = {
            again: newRatings.filter((r) => r.quality === 0).length,
            hard: newRatings.filter((r) => r.quality === 1).length,
            good: newRatings.filter((r) => r.quality === 2 || r.quality === 3).length,
            easy: newRatings.filter((r) => r.quality === 4 || r.quality === 5).length,
          }

          navigate('/review/complete', {
            state: {
              totalCount: filteredTotalCount,
              reviewedCount: totalReviewed,
              accuracy: finalAccuracy,
              distribution,
            },
          })
        } else {
          setCurrentIndex((i) => i + 1)
        }
      } catch {
        addToast('提交评分失败，请重试', 'error')
      } finally {
        setSubmitting(false)
      }
    },
    [currentQuestion, submitting, ratings, isLastQuestion, totalCount, navigate, addToast],
  )

  /* ──────────── Loading skeleton ──────────── */
  if (pageState === 'loading') {
    return (
      <div className="fixed inset-0 z-10 bg-gray-50 flex flex-col">
        <div className="flex-1 flex flex-col px-5 pt-14 pb-6">
          {/* Header skeleton */}
          <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-6" />
          {/* Card skeleton */}
          <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse mb-6" />
            <div className="space-y-3 mb-8">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-11/12" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
            </div>
            <div className="h-20 bg-gray-100 rounded-xl animate-pulse mb-6" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
          {/* Progress bar skeleton */}
          <div className="mt-4 space-y-2">
            <div className="h-2 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  /* ──────────── Empty state ──────────── */
  if (pageState === 'empty') {
    return (
      <div className="fixed inset-0 z-10 bg-gray-50 flex flex-col items-center justify-center px-6">
        <div className="text-6xl mb-5">✅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">今日复习已完成</h2>
        <p className="text-gray-500 text-center mb-8">当前没有需要复习的题目，明天再来吧</p>
        <button
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          返回首页
        </button>
      </div>
    )
  }

  /* ──────────── Error state ──────────── */
  if (pageState === 'error') {
    return (
      <div className="fixed inset-0 z-10 bg-gray-50 flex flex-col items-center justify-center px-6">
        <div className="text-6xl mb-5">😵</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">加载失败</h2>
        <p className="text-gray-500 text-center mb-8">无法获取复习列表，请检查网络后重试</p>
        <button
          onClick={loadDaily}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          重新加载
        </button>
      </div>
    )
  }

  /* ──────────── Ready state - flashcard ──────────── */
  if (!currentQuestion) {
    return (
      <div className="fixed inset-0 z-10 bg-gray-50 flex items-center justify-center px-6">
        <p className="text-gray-400">暂无题目数据</p>
      </div>
    )
  }

  const difficultyStars = '★'.repeat(currentQuestion.difficulty) + '☆'.repeat(5 - currentQuestion.difficulty)

  return (
    <div className="fixed inset-0 z-10 bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col px-5 pt-14 pb-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-gray-800">
            今日复习
          </h1>
          <span className="text-sm text-gray-500">
            剩余 {filteredTotalCount - reviewedCount}/{filteredTotalCount} 题
          </span>
        </div>

        {/* Subject filter */}
        {subjects.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
            <button
              onClick={() => { setSelectedSubject(''); setCurrentIndex(0); setShowAnswer(false) }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !selectedSubject ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >全部</button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => { setSelectedSubject(s); setCurrentIndex(0); setShowAnswer(false) }}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedSubject === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Flashcard */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col">
            {/* Subject & difficulty */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-blue-600 font-medium">
                {currentQuestion.subject || '未分类'}
              </span>
              <span className="text-xs text-amber-400">{difficultyStars}</span>
            </div>

            {/* Tags */}
            {currentQuestion.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {currentQuestion.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs"
                  >
                    {t}
                  </span>
                ))}
                {currentQuestion.error_type && (
                  <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-xs">
                    {currentQuestion.error_type}
                  </span>
                )}
              </div>
            )}

            {/* Question content */}
            <div className="mb-5">
              <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">题目</h3>
              {/* Question images */}
              {currentQuestion.images.length > 0 && (
                <div className="mb-3">
                  {currentQuestion.images.map((img, idx) => (
                    <img key={img.id} src={img.file_path} className="w-full rounded-xl object-contain max-h-64 mb-2 cursor-pointer" alt="题目图片"
                      onClick={() => setViewerState({
                        images: currentQuestion.images.map((i) => ({ src: i.file_path })),
                        index: idx,
                      })}
                    />
                  ))}
                </div>
              )}
              <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                {currentQuestion.question_content || (currentQuestion.images.length === 0 ? '无题目内容' : '')}
              </p>
            </div>

            {/* Answer section */}
            <div className="mb-5">
              {!showAnswer ? (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm font-medium active:bg-gray-50 min-h-[48px]"
                >
                  👁 显示答案
                </button>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">解析</h3>
                  {/* Solution images */}
                  {currentQuestion.solution_images.length > 0 && (
                    <div className="mb-3">
                      {currentQuestion.solution_images.map((img, idx) => (
                        <img key={img.id} src={img.file_path} className="w-full rounded-xl object-contain max-h-64 mb-2 cursor-pointer" alt="解析图片"
                          onClick={() => setViewerState({
                            images: currentQuestion.solution_images.map((i) => ({ src: i.file_path })),
                            index: idx,
                          })}
                        />
                      ))}
                    </div>
                  )}
                  {currentQuestion.correct_solution && (
                    <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                      {currentQuestion.correct_solution}
                    </p>
                  )}
                  {!currentQuestion.correct_solution && currentQuestion.solution_images.length === 0 && (
                    <p className="text-gray-400 text-sm">暂无解析内容</p>
                  )}
                  {currentQuestion.user_analysis && (
                    <>
                      <div className="border-t border-gray-200 my-3" />
                      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">我的分析</h3>
                      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                        {currentQuestion.user_analysis}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Quality rating */}
            <div>
              <div className="text-center text-xs text-gray-400 mb-3">
                {showAnswer ? '掌握得怎么样？' : '先查看答案再评分'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {QUALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleRate(opt.value)}
                    disabled={submitting || !showAnswer}
                    className={`${opt.color} ${opt.textColor} rounded-xl py-2.5 text-center transition-opacity min-h-[48px] ${
                      submitting || !showAnswer ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="text-sm font-semibold leading-tight">{opt.label}</div>
                    <div className="text-[10px] opacity-80 leading-tight">{opt.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom progress */}
        <div className="mt-4">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>已复习 {reviewedCount} 题</span>
            <span>正确率 {accuracy}%</span>
          </div>
        </div>
      </div>
      {viewerState && (
        <ImageViewer images={viewerState.images} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />
      )}
    </div>
  )
}