import type { TaskInstance } from '../../../types'

/** 任务时间展示：预计/实际耗时，并对比反映完成状况（超时/提前/按时） */
export default function TaskTimeInfo({ task }: { task: TaskInstance }) {
  const est = task.estimated_minutes
  const act = task.actual_minutes
  if (est == null && act == null) return null

  return (
    <div className="text-xs mt-1 flex items-center gap-1 flex-wrap">
      {est != null && <span className="text-gray-400">⏱ 预计 {est} 分钟</span>}
      {act != null && (
        <>
          {est != null && <span className="text-gray-300">→</span>}
          <span className={est != null && act > est ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
            实际 {act} 分钟
          </span>
          {est != null && act !== est && (
            <span className={act > est ? 'text-orange-500' : 'text-green-600'}>
              {act > est ? `（超出 ${act - est} 分钟）` : `（提前 ${est - act} 分钟）`}
            </span>
          )}
          {est != null && act === est && <span className="text-green-600">（按时）</span>}
        </>
      )}
    </div>
  )
}
