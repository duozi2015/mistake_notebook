import api from './api'

export interface InviteCodeInfo {
  code: string
  expires_at: string
  used: boolean
  remaining_seconds: number
}

export interface AdminSettings {
  registration_mode: 'open' | 'invite_only'
  invite_code: InviteCodeInfo | null
}

export const adminApi = {
  getSettings: () => api.get<AdminSettings>('/admin/settings'),
  setRegistrationMode: (mode: 'open' | 'invite_only') =>
    api.put<AdminSettings>('/admin/settings/registration-mode', { mode }),
  refreshInviteCode: () => api.post<InviteCodeInfo>('/admin/invite-code/refresh'),
}
