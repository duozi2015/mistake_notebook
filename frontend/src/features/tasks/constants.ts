import type { TaskCategory, TaskStatus } from '../../types'

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  learning: '学习',
  sports: '运动',
  chores: '家务',
}

export const CATEGORY_COLORS: Record<TaskCategory, string> = {
  learning: 'text-blue-600 bg-blue-50',
  sports: 'text-green-600 bg-green-50',
  chores: 'text-orange-600 bg-orange-50',
}

export const SUBJECTS = ['语文', '数学', '英语']

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待完成',
  submitted: '待检查',
  rejected: '需修改',
  approved: '已完成',
}

export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
