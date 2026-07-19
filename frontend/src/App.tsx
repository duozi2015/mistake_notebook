import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import MobileLayout from './components/Layout/MobileLayout'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import QuestionListPage from './features/questions/QuestionListPage'
import QuestionNewPage from './features/questions/QuestionNewPage'
import QuestionDetailPage from './features/questions/QuestionDetailPage'
import DashboardPage from './features/dashboard/DashboardPage'
import ReviewPage from './features/review/ReviewPage'
import ReviewCompletePage from './features/review/ReviewCompletePage'
import StatisticsPage from './features/statistics/StatisticsPage'

import SettingsPage from './features/settings/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const init = useAuthStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route element={<ProtectedRoute><MobileLayout /></ProtectedRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/review/complete" element={<ReviewCompletePage />} />
          <Route path="/questions" element={<QuestionListPage />} />
          <Route path="/questions/new" element={<QuestionNewPage />} />
          <Route path="/questions/:id" element={<QuestionDetailPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}