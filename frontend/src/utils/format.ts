export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return ''
  }
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
