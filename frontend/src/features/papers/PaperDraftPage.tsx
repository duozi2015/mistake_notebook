import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paperApi, type PaperResult } from '../../services/papers'
import { useToastStore } from '../../stores/toastStore'

type PageState = 'generating' | 'loaded' | 'error'

const POLL_MS = 2500

export default function PaperDraftPage() {
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [pageState, setPageState] = useState<PageState>('generating')
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<PaperResult | null>(null)
  const [draft, setDraft] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showSummary, setShowSummary] = useState(true)
  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState('')

  /* ──────────────── 读取 jobId ──────────────── */
  useEffect(() => {
    const id = sessionStorage.getItem('paper_job_id')
    if (!id) {
      setErrorMsg('没有正在进行的生成任务')
      setPageState('error')
      return
    }
    setJobId(id)
  }, [])

  /* ──────────────── 轮询任务状态 ──────────────── */
  useEffect(() => {
    if (!jobId || pageState !== 'generating') return
    let stopped = false

    const poll = async () => {
      try {
        const { data } = await paperApi.getJob(jobId)
        if (stopped) return
        if (data.status === 'done' && data.result) {
          setResult(data.result)
          setDraft(data.result.draft)
          setPageState('loaded')
        } else if (data.status === 'failed') {
          setErrorMsg(data.error?.message || '生成失败，请重试')
          setPageState('error')
        }
      } catch {
        /* 网络抖动：忽略，下一轮再试 */
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [jobId, pageState])

  /* ──────────────── 复制 ──────────────── */
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      addToast(`${label}已复制`, 'success')
      setTimeout(() => setCopied(''), 2000)
    } catch {
      addToast('复制失败，请长按手动选择', 'error')
    }
  }

  const copyDraftOnly = () => copyText(draft, '初稿')
  const copyDraftWithPrompt = () =>
    result && copyText(`${draft}\n\n---\n\n${result.polish_prompt}`, '初稿+润色指令')
  const copyAll = () =>
    result &&
    copyText(
      `【错题总结】\n${result.summary}\n\n【试卷初稿】\n${draft}\n\n---\n\n${result.polish_prompt}`,
      '全部内容',
    )

  /* ──────────────── 生成中 ──────────────── */
  if (pageState === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="text-5xl mb-6 animate-pulse">📝</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">本地模型正在生成试卷初稿</h2>
        <p className="text-sm text-gray-500 text-center mb-2">
          约需 40-70 秒，可以切到后台或锁屏，回来继续查看
        </p>
        <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-4">
          <div className="h-full w-1/2 bg-blue-500 rounded-full animate-pulse" />
        </div>
      </div>
    )
  }

  /* ──────────────── 失败 ──────────────── */
  if (pageState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="text-6xl mb-5">😵</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">生成失败</h2>
        <p className="text-gray-500 text-center mb-8">{errorMsg}</p>
        <button
          onClick={() => {
            sessionStorage.removeItem('paper_job_id')
            navigate('/questions')
          }}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 min-h-[48px]"
        >
          返回错题列表
        </button>
      </div>
    )
  }

  /* ──────────────── 成功 ──────────────── */
  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-800">📝 试卷初稿</h1>
        <button
          onClick={() => {
            sessionStorage.removeItem('paper_job_id')
            navigate('/questions')
          }}
          className="text-sm text-blue-600 min-h-[32px] px-2"
        >
          重新生成
        </button>
      </div>

      {/* 统计概览 */}
      {result && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">错题数</div>
              <div className="text-lg font-bold text-blue-600">{result.stats.total}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">学科</div>
              <div className="text-sm font-medium text-gray-700 truncate">
                {result.stats.subjects.join('、') || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">知识点</div>
              <div className="text-sm font-medium text-gray-700">
                {result.stats.knowledge_points.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 总结 */}
      {result && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="font-medium text-gray-700">📋 错题总结</span>
            <span
              className="text-gray-400 transition-transform"
              style={{ transform: showSummary ? 'rotate(180deg)' : '' }}
            >
              ▼
            </span>
          </button>
          {showSummary && (
            <pre className="border-t pt-3 mt-2 text-sm text-gray-700 whitespace-pre-wrap font-sans">
              {result.summary}
            </pre>
          )}
        </div>
      )}

      {/* 初稿（可编辑） */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-gray-700">📄 试卷初稿（可编辑）</span>
          <span className="text-xs text-gray-400">{draft.length} 字</span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:border-blue-400 min-h-[400px] font-mono"
          placeholder="试卷初稿"
        />
      </div>

      {/* 润色指令 */}
      {result && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="font-medium text-gray-700">💬 润色指令（给千问/DeepSeek）</span>
            <span
              className="text-gray-400 transition-transform"
              style={{ transform: showPrompt ? 'rotate(180deg)' : '' }}
            >
              ▼
            </span>
          </button>
          {showPrompt && (
            <pre className="border-t pt-3 mt-2 text-sm text-gray-700 whitespace-pre-wrap font-sans">
              {result.polish_prompt}
            </pre>
          )}
        </div>
      )}

      {/* 复制按钮 */}
      <div className="space-y-2">
        <button
          onClick={copyDraftWithPrompt}
          className={`w-full py-3 rounded-xl font-medium text-base min-h-[48px] transition-colors ${
            copied === '初稿+润色指令'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-600 text-white active:bg-blue-700'
          }`}
        >
          {copied === '初稿+润色指令' ? '✅ 已复制' : '📋 复制初稿 + 润色指令（推荐）'}
        </button>
        <div className="flex gap-2">
          <button
            onClick={copyDraftOnly}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200 min-h-[44px]"
          >
            {copied === '初稿' ? '✅ 已复制' : '仅复制初稿'}
          </button>
          <button
            onClick={copyAll}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200 min-h-[44px]"
          >
            {copied === '全部内容' ? '✅ 已复制' : '复制全部'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed">
        复制后粘贴到千问 / DeepSeek App，即可完成排版润色、质量复核与备选出题
      </p>
    </div>
  )
}
