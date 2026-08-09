import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/parent', label: '首页', icon: '🏠', end: true },
  { to: '/parent/tasks', label: '今日任务', icon: '📋' },
  { to: '/parent/review', label: '检查', icon: '🔍' },
  { to: '/parent/templates', label: '周期任务', icon: '🔁' },
  { to: '/parent/settings', label: '设置', icon: '⚙️' },
]

export default function ParentNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex justify-around items-center h-14">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
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
