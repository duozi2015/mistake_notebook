import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Toast from '../Shared/Toast'
import { useEnv } from '../../hooks/useEnv'

export default function MobileLayout() {
  const env = useEnv()
  const isDev = env?.environment === 'development'

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {isDev && (
        <div className="fixed top-0 left-0 right-0 z-50 text-center text-[10px] font-bold py-[2px] tracking-wider flex items-center justify-center gap-2 bg-yellow-300 text-yellow-900">
          <span>⚡ 开发环境</span>
          <span className="opacity-70">|</span>
          <span className="opacity-80">{env?.commit}</span>
        </div>
      )}
      <main className={`max-w-lg mx-auto px-4 pt-4 ${env ? 'mt-5' : ''}`}>
        <Outlet />
      </main>
      <BottomNav />
      <Toast />
    </div>
  )
}