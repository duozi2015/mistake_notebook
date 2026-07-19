import { useToastStore } from '../../stores/toastStore'

export default function Toast() {
  const { toasts, removeToast } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`px-4 py-2 rounded-lg shadow-lg text-white text-sm cursor-pointer whitespace-nowrap ${
            t.type === 'success' ? 'bg-green-500' : t.type === 'error' ? 'bg-red-500' : 'bg-gray-800'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}