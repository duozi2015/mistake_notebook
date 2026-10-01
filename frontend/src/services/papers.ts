import api from './api'

export interface PaperStats {
  total: number
  subjects: string[]
  difficulty: Record<string, number>
  error_types: Record<string, number>
  knowledge_points: string[]
}

export interface PaperResult {
  summary: string
  draft: string
  polish_prompt: string
  stats: PaperStats
  model: string
}

export interface PaperJob {
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: PaperResult
  error?: { code: string; message: string }
}

export const paperApi = {
  generate: (questionIds: number[], count: number) =>
    api.post<{ job_id: string; status: string }>('/papers/generate', {
      question_ids: questionIds,
      count,
    }),
  getJob: (jobId: string) => api.get<PaperJob>(`/papers/jobs/${jobId}`),
}
