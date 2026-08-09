import { useRef, useState } from 'react'
import { tasksApi } from '../../../services/tasks'
import { useToastStore } from '../../../stores/toastStore'
import { compressImage } from '../../../utils/image'
import ImageViewer from '../../../components/Shared/ImageViewer'

export interface PickedImage {
  id: number
  file_path: string
}

interface ImagePickerProps {
  value: PickedImage[]
  onChange: (v: PickedImage[]) => void
  max?: number
  hint?: string
}

export default function ImagePicker({ value, onChange, max = 6, hint }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<{ images: { src: string }[]; index: number } | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    if (value.length + files.length > max) {
      addToast(`最多上传 ${max} 张图片`, 'error')
      return
    }
    setUploading(true)
    try {
      const added: PickedImage[] = []
      for (const f of Array.from(files)) {
        const compressed = await compressImage(f)
        const file = new File([compressed], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
        const { data } = await tasksApi.uploadImage(file)
        added.push({ id: data.id, file_path: data.file_path })
      }
      onChange([...value, ...added])
    } catch {
      addToast('图片上传失败', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx))

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((img, i) => (
          <div key={img.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
            <img
              src={img.file_path}
              className="w-full h-full object-cover cursor-zoom-in"
              alt=""
              onClick={() => setViewer({ images: value.map((v) => ({ src: v.file_path })), index: i })}
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white text-xs rounded-bl-lg flex items-center justify-center"
            >
              ×
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 text-2xl flex items-center justify-center active:bg-gray-50"
          >
            {uploading ? '…' : '+'}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {viewer && <ImageViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  )
}
