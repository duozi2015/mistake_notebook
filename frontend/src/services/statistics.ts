import api from './api'

export interface Overview {
  total_questions: number
  active_questions: number
  archived_questions: number
  today_review_count: number
  overdue_review_count: number
  weekly_added: number
  mastery_rate: number
  total_reviews: number
}

export interface TrendItem {
  date: string
  added: number
  reviewed: number
}

export interface ErrorTypeItem {
  type: string
  count: number
  percentage: number
}

export interface WeakTagItem {
  tag: string
  error_count: number
  error_rate: number
}

export interface MasteryItem {
  tag: string
  mastery: number
  error_count: number
  total_count: number
}

export interface HeatmapItem {
  date: string
  hour: number
  count: number
}

export interface ReportData {
  error_type_distribution: ErrorTypeItem[]
  high_frequency_tags: WeakTagItem[]
  [key: string]: unknown
}

export const statisticsApi = {
  overview: (studentId?: number) => api.get<Overview>('/statistics/overview', { params: studentId ? { student_id: studentId } : undefined }),
  trends: (studentId?: number) => api.get<{ daily: TrendItem[] }>('/statistics/trends', { params: studentId ? { student_id: studentId } : undefined }),
  report: (period?: string, studentId?: number) => api.get<ReportData>('/statistics/report', { params: { period, ...(studentId ? { student_id: studentId } : {}) } }),
  mastery: (studentId?: number) => api.get<{ data: MasteryItem[] }>('/statistics/knowledge/mastery', { params: studentId ? { student_id: studentId } : undefined }),
  heatmap: (studentId?: number) => api.get<{ data: HeatmapItem[] }>('/statistics/knowledge/heatmap', { params: studentId ? { student_id: studentId } : undefined }),
}