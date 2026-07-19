import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Toast from '../Shared/Toast'

export default function MobileLayout() {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <main className="max-w-lg mx-auto px-4 pt-4">
        <Outlet />
      </main>
      <BottomNav />
      <Toast />
    </div>
  )
}