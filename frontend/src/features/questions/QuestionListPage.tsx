import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import { exportApi } from '../../services/export'
import { useToastStore } from '../../stores/toastStore'
import type { Question } from '../../types'
import ImageViewer from '../../components/Shared/ImageViewer'

export default function QuestionListPage() {
  const addToast = useToastStore((s) => s.addToast)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [subject, setSubject] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [viewerState, setViewerState] = useState<{ images: { src: string }[]; index: number } | null>(null)
  const pageSize = 20

  const load = useCallback(async (p: number, subj: string) => {
    setLoading(true)
    setPage(p)
    try {
      const { data } = await questionApi.list({ page: p, page_size: pageSize, subject: subj || undefined, status: 'active' })
      setQuestions(data.data)
      setTotal(data.pagination.total)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(1, subject) }, [subject, load])

  const handleDelete = async (q: Question, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const confirmed = window.confirm(`确定要删除题目「${(q.question_content || '无内容').slice(0, 20)}...」吗？`)
    if (!confirmed) return
    setDeleting(q.id)
    try {
      await questionApi.delete(q.id)
      addToast('题目已删除', 'success')
      // 如果当前页只剩1条且不是第1页，回到上一页
      const isLastOnPage = questions.length === 1 && page > 1
      load(isLastOnPage ? page - 1 : page, subject)
    } catch {
      addToast('删除失败，请重试', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const handleExport = async () => {
    const ids = questions.map((q) => q.id)
    if (ids.length === 0) {
      addToast('没有可导出的题目', 'error')
      return
    }
    setExporting(true)
    try {
      const response = await exportApi.pdf(ids, true)
      const blob = response.data as Blob
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `错题本导出_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      addToast(`导出成功（共${ids.length}题）`, 'success')
    } catch (err: any) {
      // 当 responseType 为 blob 时，错误响应也是 Blob，需要尝试解析
      let msg = '导出失败，请重试'
      try {
        const errorData = err?.response?.data
        if (errorData instanceof Blob && errorData.type?.includes('json')) {
          const text = await errorData.text()
          const parsed = JSON.parse(text)
          msg = parsed?.detail?.message || parsed?.message || msg
        } else if (errorData?.detail?.message) {
          msg = errorData.detail.message
        }
      } catch { /* ignore parse errors */ }
      addToast(msg, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-800">我的错题</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || questions.length === 0}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200 disabled:opacity-40 min-h-[36px]"
          >
            {exporting ? '导出中...' : '📥 导出'}
          </button>
          <Link to="/questions/new" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">+ 新增</Link>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['', '数学', '物理', '化学', '英语'].map((s) => (
          <button key={s} onClick={() => setSubject(s)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${subject === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >{s || '全部'}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p>还没有错题</p>
          <Link to="/questions/new" className="text-blue-600 mt-2 inline-block">录入第一道错题</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="relative bg-white rounded-xl shadow-sm">
              <Link to={`/questions/${q.id}`} className="block p-4">
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-sm text-blue-600 font-medium">{q.subject || '未分类'}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{'★'.repeat(q.difficulty)}{'☆'.repeat(5 - q.difficulty)}</span>
                    </div>
                    <p className="text-gray-800 text-sm line-clamp-2">{q.question_content || '无题目内容'}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {q.tags.map((t) => <span key={t} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{t}</span>)}
                      {q.error_type && <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-xs">{q.error_type}</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">{new Date(q.created_at).toLocaleDateString()}</div>
                  </div>
                  {q.images.length > 0 ? (
                    <div className="flex-shrink-0">
                      <img src={q.images[0].file_path} className="w-16 h-16 rounded-lg object-cover cursor-pointer" alt=""
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setViewerState({
                            images: q.images.map((img) => ({ src: img.file_path })),
                            index: 0,
                          })
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-xl text-gray-400">
                      📄
                    </div>
                  )}
                </div>
              </Link>
              {/* 删除按钮 */}
              <button
                onClick={(e) => handleDelete(q, e)}
                disabled={deleting === q.id}
                className="absolute top-2 right-2 w-7 h-7 bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded-full flex items-center justify-center text-xs transition-colors disabled:opacity-50"
                title="删除"
              >
                {deleting === q.id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => load(p, subject)}
              className={`w-8 h-8 rounded-full text-sm ${page === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >{p}</button>
          ))}
        </div>
      )}
      {viewerState && (
        <ImageViewer images={viewerState.images} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />
      )}
    </div>
  )
}