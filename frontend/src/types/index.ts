export interface User {
  id: number
  username: string
  display_name: string
  role: 'student' | 'parent'
}

export type TaskCategory = 'learning' | 'sports' | 'chores'
export type TaskStatus = 'pending' | 'submitted' | 'rejected' | 'approved'

export interface TaskImage {
  id: number
  kind: string
  file_path: string
  mime_type: string
  file_size: number
  original_name: string
}

export interface TaskInstance {
  id: number
  template_id: number | null
  created_by_id: number | null
  student_id: number
  task_date: string
  category: TaskCategory
  subject: string
  name: string
  description: string
  require_evidence: boolean
  source: 'manual' | 'auto_review'
  status: TaskStatus
  checkin_note: string
  submitted_at: string | null
  reviewed_by_id: number | null
  rating: number | null
  review_comment: string
  reviewed_at: string | null
  version: number
  images: TaskImage[]
  created_at: string
  updated_at: string
}

export interface TaskTemplate {
  id: number
  created_by_id: number
  student_id: number
  category: TaskCategory
  subject: string
  name: string
  description: string
  require_evidence: boolean
  repeat_type: 'none' | 'daily' | 'weekly'
  repeat_weekdays: number[]
  start_date: string | null
  end_date: string | null
  status: string
  version: number
  images: TaskImage[]
  created_at: string
  updated_at: string
}

export interface FamilyChild {
  id: number
  student_id: number
  username: string
  display_name: string
  status: string
  created_at: string
}

export interface FamilyRequest {
  id: number
  parent_id: number
  username: string
  display_name: string
}

export interface TaskOverview {
  student_id: number
  username: string
  display_name: string
  total: number
  pending: number
  submitted: number
  rejected: number
  approved: number
}

export interface StudentOverview {
  total: number
  pending: number
  submitted: number
  rejected: number
  approved: number
}

export interface Achievement {
  code: string
  title: string
  desc: string
  emoji: string
  unlocked: boolean
  progress: number
  target: number
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