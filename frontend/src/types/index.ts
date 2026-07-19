export interface User {
  id: number
  username: string
  display_name: string
}

export interface Question {
  id: number
  question_content: string
  subject: string
  tags: string[]
  images: QuestionImage[]
  solution_images: QuestionImage[]
  error_type: string
  difficulty: number
  source: string
  correct_solution: string
  user_analysis: string
  status: 'active' | 'archived'
  next_review_date: string | null
  current_ef: number
  created_at: string
  updated_at: string
}

export interface QuestionImage {
  id: number
  file_path: string
  mime_type: string
  file_size: number
  image_type: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}