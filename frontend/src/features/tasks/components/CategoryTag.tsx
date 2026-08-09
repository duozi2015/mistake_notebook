import { CATEGORY_LABELS, CATEGORY_COLORS } from '../constants'
import type { TaskCategory } from '../../../types'

export default function CategoryTag({ category }: { category: TaskCategory }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLORS[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}
