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
  overview: () => api.get<Overview>('/statistics/overview'),
  trends: () => api.get<{ daily: TrendItem[] }>('/statistics/trends'),
  report: () => api.get<ReportData>('/statistics/report'),
  mastery: () => api.get<{ data: MasteryItem[] }>('/statistics/knowledge/mastery'),
  heatmap: () => api.get<{ data: HeatmapItem[] }>('/statistics/knowledge/heatmap'),
}