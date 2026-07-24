const PALETTE = ['#5b46ad', '#a8574e', '#2f7a5c', '#3a6ea5', '#8a5b9e']

/** Draws a simple colored placeholder image (used only for seed data). */
export function drawPlaceholder(label: string, seedIndex: number, size = 900): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const color = PALETTE[seedIndex % PALETTE.length]
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)

  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.arc(size * 0.75, size * 0.28, size * 0.32, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f5f0ff'
  ctx.font = `700 ${Math.round(size * 0.11)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const words = label.split(' ')
  const lineHeight = size * 0.13
  const startY = size / 2 - ((words.length - 1) * lineHeight) / 2
  words.forEach((word, i) => ctx.fillText(word, size / 2, startY + i * lineHeight))

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
