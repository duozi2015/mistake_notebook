import { useEffect, useState, useCallback, useRef } from 'react'

interface ImageViewerProps {
  images: { src: string }[]
  initialIndex: number
  onClose: () => void
}

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const ZOOM_STEP = 0.25
const CLICK_ZOOM = 2.5

export default function ImageViewer({ images, initialIndex, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 })
  const lastTapRef = useRef(0)

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length)
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [images.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length)
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [images.length])

  const handleDownload = useCallback(async () => {
    const src = images[currentIndex].src
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      a.download = `image-${currentIndex + 1}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(src, '_blank')
    }
  }, [images, currentIndex])

  const resetZoom = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const toggleZoom = useCallback(() => {
    setScale((s) => {
      if (s > 1) { setPosition({ x: 0, y: 0 }); return 1 }
      return CLICK_ZOOM
    })
  }, [])

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE))
  }, [])

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(s - ZOOM_STEP, MIN_SCALE)
      if (next <= 1) setPosition({ x: 0, y: 0 })
      return next
    })
  }, [])

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') { goNext(); return }
      if (e.key === 'ArrowLeft') { goPrev(); return }
      if (e.key === '=' || e.key === '+') { zoomIn(); return }
      if (e.key === '-') { zoomOut(); return }
      if (e.key === '0') { resetZoom(); return }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, goNext, goPrev, zoomIn, zoomOut, resetZoom])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }, [zoomIn, zoomOut])

  // Mouse drag to pan (only when zoomed in)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    e.stopPropagation()
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: position.x, posY: position.y }
  }, [scale, position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPosition({ x: dragRef.current.posX + dx, y: dragRef.current.posY + dy })
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Touch drag to pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scale <= 1) return
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    dragRef.current = { startX: touch.clientX, startY: touch.clientY, posX: position.x, posY: position.y }
  }, [scale, position])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    e.preventDefault()
    const touch = e.touches[0]
    const dx = touch.clientX - dragRef.current.startX
    const dy = touch.clientY - dragRef.current.startY
    setPosition({ x: dragRef.current.posX + dx, y: dragRef.current.posY + dy })
  }, [])

  // Touch pinch to zoom
  const lastPinchDistRef = useRef(0)
  const handleTouchStartPinch = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy)
    }
  }, [])

  const handleTouchMovePinch = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (lastPinchDistRef.current > 0) {
        const ratio = dist / lastPinchDistRef.current
        setScale((s) => {
          const next = Math.min(Math.max(s * ratio, MIN_SCALE), MAX_SCALE)
          return next
        })
      }
      lastPinchDistRef.current = dist
    }
  }, [])

  const handleTouchEndPinch = useCallback(() => {
    lastPinchDistRef.current = 0
  }, [])

  // Double-tap to toggle zoom on mobile
  const handleTouchEndTap = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches.length !== 1) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      toggleZoom()
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }, [toggleZoom])

  const cursorClass = scale > 1
    ? (isDragging ? 'cursor-grabbing' : 'cursor-grab')
    : 'cursor-zoom-in'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center select-none"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10 bg-gradient-to-b from-black/40 to-transparent">
        {images.length > 1 ? (
          <span className="text-white/80 text-sm font-medium">{currentIndex + 1} / {images.length}</span>
        ) : <div />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); resetZoom() }}
            className="w-8 h-8 bg-white/20 rounded-full text-white text-xs flex items-center justify-center hover:bg-white/30"
          >1:1</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); zoomOut() }}
            className="w-8 h-8 bg-white/20 rounded-full text-white text-lg flex items-center justify-center hover:bg-white/30"
          >−</button>
          <span className="text-white/80 text-xs w-8 text-center">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); zoomIn() }}
            className="w-8 h-8 bg-white/20 rounded-full text-white text-lg flex items-center justify-center hover:bg-white/30"
          >+</button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button type="button" onClick={(e) => { e.stopPropagation(); handleDownload() }}
            className="w-8 h-8 bg-white/20 rounded-full text-white text-sm flex items-center justify-center hover:bg-white/30"
            title="下载图片"
          >↓</button>
          <button type="button" onClick={onClose}
            className="w-8 h-8 bg-white/20 rounded-full text-white text-lg flex items-center justify-center hover:bg-white/30 ml-1"
          >×</button>
        </div>
      </div>

      {/* Previous button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full text-white text-xl flex items-center justify-center hover:bg-white/30 z-10"
        >
          ‹
        </button>
      )}

      {/* Image container with overflow hidden for panning */}
      <div
        className="flex items-center justify-center w-full h-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <img
          src={images[currentIndex].src}
          className={`max-w-[95vw] max-h-[95vh] object-contain transition-transform duration-100 ${cursorClass}`}
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
          }}
          alt="放大查看"
          draggable={false}
          onClick={(e) => { e.stopPropagation(); if (scale <= 1) toggleZoom() }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={(e) => { handleTouchStart(e); handleTouchStartPinch(e) }}
          onTouchMove={(e) => { handleTouchMove(e); handleTouchMovePinch(e) }}
          onTouchEnd={(e) => { handleTouchEndPinch(); handleTouchEndTap(e) }}
        />
      </div>

      {/* Next button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full text-white text-xl flex items-center justify-center hover:bg-white/30 z-10"
        >
          ›
        </button>
      )}

      {/* Bottom hint */}
      {scale <= 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs z-10">
          点击图片放大 · 滚轮缩放 · 拖拽平移
        </div>
      )}
    </div>
  )
}