import api from './api'
import type { Achievement, FamilyChild, FamilyRequest, StudentOverview, TaskInstance, TaskOverview, TaskTemplate } from '../types'

export interface TemplatePayload {
  student_id: number
  category: 'learning' | 'sports' | 'chores'
  subject?: string
  name: string
  description?: string
  require_evidence?: boolean
  repeat_type?: 'none' | 'daily' | 'weekly'
  repeat_weekdays?: number[]
  start_date?: string | null
  end_date?: string | null
  illustration_image_ids?: number[]
  version?: number
}

export interface InstancePayload {
  student_id: number
  date: string
  category: 'learning' | 'sports' | 'chores'
  subject?: string
  name: string
  description?: string
  require_evidence?: boolean
  illustration_image_ids?: number[]
  version?: number
}

export interface OverviewResponse {
  data: TaskOverview[]
}export const familyApi = {
  bind: (username: string) => api.post('/family/bind', { username }),
  children: () => api.get<FamilyChild[]>('/family/children'),
  requests: () => api.get<FamilyRequest[]>('/family/requests'),
  me: () => api.get<{ id: number; parent_id: number; username: string; display_name: string; status: string }[]>('/family/me'),
  confirm: (id: number) => api.post(`/family/bind/${id}/confirm`),
  unbind: (id: number) => api.delete(`/family/bind/${id}`),
}

export const tasksApi = {
  uploadImage: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ id: number; file_path: string }>('/tasks/images/upload', form)
  },
  templates: (studentId: number) =>
    api.get<TaskTemplate[]>('/tasks/templates', { params: { student_id: studentId } }),
  createTemplate: (data: TemplatePayload) => api.post<TaskTemplate>('/tasks/templates', data),
  updateTemplate: (id: number, data: Partial<TemplatePayload>) =>
    api.put<TaskTemplate>(`/tasks/templates/${id}`, data),
  deleteTemplate: (id: number) => api.delete(`/tasks/templates/${id}`),
  daily: (params: { date?: string; student_id?: number }) =>
    api.get<TaskInstance[]>('/tasks/daily', { params }),
  create: (data: InstancePayload) => api.post<TaskInstance>('/tasks/daily', data),
  update: (id: number, data: Partial<InstancePayload>) => api.put<TaskInstance>(`/tasks/${id}`, data),
  remove: (id: number) => api.delete(`/tasks/${id}`),
  copy: (data: { student_id: number; date?: string }) =>
    api.post<{ copied: number; skipped: number }>('/tasks/daily/copy', data),
  submit: (id: number, data: { note?: string; evidence_image_ids?: number[] }) =>
    api.post<TaskInstance>(`/tasks/${id}/submit`, data),
  withdraw: (id: number) => api.post<TaskInstance>(`/tasks/${id}/withdraw`),
  review: (
    id: number,
    data: {
      result: 'approved' | 'rejected'
      rating?: number
      comment?: string
      correction_image_ids?: number[]
      version?: number
    },
  ) => api.post<TaskInstance>(`/tasks/${id}/review`, data),
  history: (params: { student_id?: number; start: string; end: string }) =>
    api.get<TaskInstance[]>('/tasks/history', { params }),
  overview: () => api.get<OverviewResponse | StudentOverview>('/tasks/overview'),
}

export const achievementsApi = {
  list: () => api.get<{ data: Achievement[] }>('/achievements'),
}
