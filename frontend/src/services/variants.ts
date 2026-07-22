import api from './api'
import type { Question } from '../types'

export const variantsApi = {
  getVariants: (questionId: number) =>
    api.get<{ data: Question[]; total: number }>(`/variants/${questionId}`),
}
