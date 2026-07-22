import api from './api'

export const exportApi = {
  pdf: (questionIds: number[], includeSolution: boolean = true) =>
    api.post('/export/pdf', { question_ids: questionIds, include_solution: includeSolution }, { responseType: 'blob' }),
  shareLink: (questionIds: number[], expireHours: number = 72) =>
    api.post<{ share_url: string; token: string; expires_at: string; question_ids: number[] }>(
      '/export/share-link', { question_ids: questionIds, expire_hours: expireHours },
    ),
}
