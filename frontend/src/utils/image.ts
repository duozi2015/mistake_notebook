export function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, _reject) => {
    // Skip non-image files
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        // Calculate new dimensions, maintaining aspect ratio
        let { width, height } = img
        if (width > maxWidth || height > maxWidth) {
          const ratio = Math.min(maxWidth / width, maxWidth / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        // If the image is already small enough, no compression needed
        if (width === img.width && height === img.height && file.size < 512 * 1024) {
          resolve(file)
          return
        }

        // Compress via canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(file); return }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else resolve(file)
          },
          'image/jpeg',
          quality,
        )
      }
      img.onerror = () => resolve(file)
      img.src = reader.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}