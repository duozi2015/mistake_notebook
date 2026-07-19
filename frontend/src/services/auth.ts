import api from './api'
import type { User } from '../types'

export interface LoginData { username: string; password: string }
export interface RegisterData { username: string; password: string; display_name?: string }
export interface AuthResponse { access_token: string; refresh_token: string; token_type: string; expires_in: number; user: User }

export const authApi = {
  register: (data: RegisterData) => api.post<AuthResponse>('/auth/register', data),
  login: (data: LoginData) => api.post<AuthResponse>('/auth/login', data),
  refresh: (refreshToken: string) => api.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put('/auth/password', { old_password: oldPassword, new_password: newPassword }),
}