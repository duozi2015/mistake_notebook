export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return ''
  }
}

/** 本地 YYYY-MM-DD（与任务日期字段一致） */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 分钟输入钳制（1~1440，沿用任务时间字段约束） */
export function clampMinutes(v: number): number {
  return Math.min(Math.max(v, 1), 1440)
}

export function getQualityLabel(quality: number): string {
  const labels = ['Again', 'Hard', 'Medium', 'Good', 'Very', 'Easy']
  return labels[quality] || 'Unknown'
}

export function getQualityColor(quality: number): string {
  const colors = [
    'text-red-500',
    'text-orange-500',
    'text-amber-500',
    'text-lime-500',
    'text-green-500',
    'text-teal-500',
  ]
  return colors[quality] || 'text-gray-500'
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
