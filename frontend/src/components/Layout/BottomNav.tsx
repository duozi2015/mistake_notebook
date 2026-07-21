import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/review', label: '复习', icon: '🔄' },
  { to: '/questions', label: '错题', icon: '📚' },
  { to: '/questions/new', label: '录入', icon: '📝' },
  { to: '/statistics', label: '统计', icon: '📊' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex justify-around items-center h-14">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center px-3 py-1 text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span className="mt-0.5">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}