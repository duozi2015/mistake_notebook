import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import MobileLayout from './components/Layout/MobileLayout'
import ParentLayout from './components/Layout/ParentLayout'
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
import StudentTaskPage from './features/tasks/StudentTaskPage'
import ParentHomePage from './features/tasks/ParentHomePage'
import TaskManagePage from './features/tasks/TaskManagePage'
import ParentReviewPage from './features/tasks/ParentReviewPage'
import TemplateManagePage from './features/tasks/TemplateManagePage'
import ParentNotebookPage from './features/tasks/ParentNotebookPage'
import ParentSettingsPage from './features/tasks/ParentSettingsPage'
import AchievementsPage from './features/tasks/AchievementsPage'

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

function RoleGate({ role, children }: { role: 'student' | 'parent'; children: React.ReactNode }) {
  const currentRole = useAuthStore((s) => s.user?.role)
  if (currentRole !== role) {
    return <Navigate to={role === 'parent' ? '/' : '/parent'} replace />
  }
  return <>{children}</>
}

function RoleHome() {
  const role = useAuthStore((s) => s.user?.role)
  return role === 'parent' ? <Navigate to="/parent" replace /> : <Navigate to="/" replace />
}

export default function App() {
  const init = useAuthStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* 学生端：错题本 + 任务打卡 */}
        <Route element={<ProtectedRoute><RoleGate role="student"><MobileLayout /></RoleGate></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/review/complete" element={<ReviewCompletePage />} />
          <Route path="/questions" element={<QuestionListPage />} />
          <Route path="/questions/new" element={<QuestionNewPage />} />
          <Route path="/questions/:id" element={<QuestionDetailPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/tasks" element={<StudentTaskPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 家长端：任务管理 + 检查 + 错题本只读 + 成就 */}
        <Route path="/parent" element={<ProtectedRoute><RoleGate role="parent"><ParentLayout /></RoleGate></ProtectedRoute>}>
          <Route index element={<ParentHomePage />} />
          <Route path="tasks" element={<TaskManagePage />} />
          <Route path="review" element={<ParentReviewPage />} />
          <Route path="templates" element={<TemplateManagePage />} />
          <Route path="notebook" element={<ParentNotebookPage />} />
          <Route path="settings" element={<ParentSettingsPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
        </Route>

        <Route path="*" element={<RoleHome />} />
      </Routes>
    </BrowserRouter>
  )
}
