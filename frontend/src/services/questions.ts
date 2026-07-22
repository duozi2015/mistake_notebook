import api from './api'
import type { Question, PaginatedResponse } from '../types'

export interface QuestionListParams {
  page?: number; page_size?: number; subject?: string; tag?: string
  error_type?: string; status?: string; sort_by?: string; sort_order?: string
}

export interface CreateQuestionData {
  question_content?: string; subject?: string; tags?: string[]
  error_type?: string; difficulty?: number; source?: string
  correct_solution?: string; user_analysis?: string; image_ids?: number[]
  solution_image_ids?: number[]
}

export const questionApi = {
  list: (params?: QuestionListParams) => api.get<PaginatedResponse<Question>>('/questions', { params }),
  get: (id: number) => api.get<Question>(`/questions/${id}`),
  create: (data: CreateQuestionData) => api.post<Question>('/questions', data),
  update: (id: number, data: Partial<CreateQuestionData>) => api.put<Question>(`/questions/${id}`, data),
  delete: (id: number) => api.delete(`/questions/${id}`),
  uploadImage: (file: File, imageType: string = 'question', onProgress?: (pct: number) => void) => {
    const fd = new FormData(); fd.append('file', file); fd.append('image_type', imageType)
    return api.post<{ id: number; file_path: string; mime_type: string; file_size: number; image_type: string }>(
      '/images/upload', fd, { onUploadProgress: (e) => { if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) } },
    )
  },
  deleteImage: (id: number) => api.delete(`/images/${id}`),
}