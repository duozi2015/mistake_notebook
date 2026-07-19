import api from './api'
import type { Question } from '../types'

export interface ReviewResult {
  question_id: number
  quality: number
  next_review_date: string
  current_ef: number
  current_interval: number
}

export const reviewApi = {
  getDaily: (page?: number) =>
    api.get<{ data: Question[]; pagination: { total: number } }>('/reviews/daily', {
      params: { page, page_size: 10 },
    }),
  submit: (questionId: number, quality: number) =>
    api.post<ReviewResult>('/reviews', { question_id: questionId, quality }),
  history: (questionId: number) =>
    api.get<any[]>(`/reviews/history/${questionId}`),
}