import { useEffect, type ReactNode } from 'react'

/** 打开时锁定背景滚动，避免滑动穿透到下层页面 */
export function useLockBodyScroll(open: boolean) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
}

interface BottomSheetProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** 底部浮窗：头部固定 + 中间内容可滚动 + 底部操作栏固定（抬离工具栏/安全区） */
export default function BottomSheet({ open, title, onClose, children, footer }: BottomSheetProps) {
  useLockBodyScroll(open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between p-5 pb-2 shrink-0">
          <h3 className="text-base font-bold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
          {children}
        </div>
        {footer && (
          <div className="p-5 pt-2 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
