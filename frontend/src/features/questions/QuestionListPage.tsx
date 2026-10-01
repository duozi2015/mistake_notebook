import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import { exportApi } from '../../services/export'
import { paperApi } from '../../services/papers'
import { useToastStore } from '../../stores/toastStore'
import type { Question } from '../../types'
import ImageViewer from '../../components/Shared/ImageViewer'

export default function QuestionListPage() {
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [subject, setSubject] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [paperCount, setPaperCount] = useState(10)
  const [generating, setGenerating] = useState(false)
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

  /* ──────────────── 勾选 ──────────────── */
  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ──────────────── 生成试卷 ──────────────── */
  const handleGeneratePaper = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) {
      addToast('请先勾选错题', 'error')
      return
    }
    setGenerating(true)
    try {
      const { data } = await paperApi.generate(ids, paperCount)
      sessionStorage.setItem('paper_job_id', data.job_id)
      navigate('/papers')
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || '发起生成失败，请重试'
      addToast(msg, 'error')
    } finally {
      setGenerating(false)
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
            <div key={q.id} className={`relative bg-white rounded-xl shadow-sm ${selected.has(q.id) ? 'ring-2 ring-blue-500' : ''}`}>
              <Link to={`/questions/${q.id}`} className="block p-4">
                <div className="flex gap-3">
                  {/* 勾选圈 */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelect(q.id, e)}
                    className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center text-[11px] transition-colors ${
                      selected.has(q.id)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 text-transparent'
                    }`}
                    aria-label="选择"
                  >
                    ✓
                  </button>
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

      {/* 底部生成试卷栏（选中有题时才出现，浮在底部导航之上） */}
      {selected.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4">
          <div className="max-w-lg mx-auto bg-white rounded-xl shadow-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                已选 <b className="text-blue-600">{selected.size}</b> 题
              </span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 px-2 min-h-[28px]">
                清空
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={paperCount}
                onChange={(e) => setPaperCount(Number(e.target.value))}
                className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white min-h-[40px]"
              >
                {[8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>{n} 题</option>
                ))}
              </select>
              <button
                onClick={handleGeneratePaper}
                disabled={generating}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium active:bg-blue-700 disabled:opacity-50 min-h-[40px]"
              >
                {generating ? '发起中...' : '📝 生成试卷'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}