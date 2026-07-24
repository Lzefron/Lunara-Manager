const DCT_N = 32

const cosTable: number[][] = Array.from({ length: DCT_N }, (_, k) =>
  Array.from({ length: DCT_N }, (_, n) => Math.cos((Math.PI / DCT_N) * (n + 0.5) * k)),
)

function dct1d(vector: number[]): number[] {
  const n = vector.length
  const out = new Array(n).fill(0)
  for (let k = 0; k < n; k++) {
    let sum = 0
    const row = cosTable[k]
    for (let i = 0; i < n; i++) sum += vector[i] * row[i]
    out[k] = sum * (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n))
  }
  return out
}

function dct2d(matrix: number[][]): number[][] {
  const n = matrix.length
  const rowsTransformed = matrix.map((row) => dct1d(row))
  const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let x = 0; x < n; x++) {
    const col = rowsTransformed.map((row) => row[x])
    const dctCol = dct1d(col)
    for (let y = 0; y < n; y++) result[y][x] = dctCol[y]
  }
  return result
}

export async function loadBitmap(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source)
}

export function computeFitSize(width: number, height: number, maxDim: number): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height }
  const scale = maxDim / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function drawToCanvas(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))), type, quality)
  })
}

/** Compress an image blob to WebP, scaled to fit within maxDim on the longest side. */
export async function compressImage(source: Blob, maxDim: number, quality = 0.8): Promise<Blob> {
  const bitmap = await loadBitmap(source)
  try {
    const { width, height } = computeFitSize(bitmap.width, bitmap.height, maxDim)
    const canvas = drawToCanvas(bitmap, width, height)
    return await canvasToBlob(canvas, 'image/webp', quality)
  } finally {
    bitmap.close()
  }
}

/**
 * Perceptual hash (pHash): downscale to 32x32 grayscale, 2D DCT, keep the
 * top-left 8x8 low-frequency block, threshold against the median -> 64 bits,
 * encoded as 16 hex chars.
 */
export async function computePHash(source: Blob): Promise<string> {
  const bitmap = await loadBitmap(source)
  let canvas: HTMLCanvasElement
  try {
    canvas = drawToCanvas(bitmap, DCT_N, DCT_N)
  } finally {
    bitmap.close()
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context unavailable')
  const { data } = ctx.getImageData(0, 0, DCT_N, DCT_N)

  const gray: number[][] = []
  for (let y = 0; y < DCT_N; y++) {
    const row: number[] = []
    for (let x = 0; x < DCT_N; x++) {
      const i = (y * DCT_N + x) * 4
      row.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    gray.push(row)
  }

  const dct = dct2d(gray)
  const vals: number[] = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) vals.push(dct[y][x])
  }
  const sorted = [...vals].sort((a, b) => a - b)
  const median = (sorted[31] + sorted[32]) / 2

  let bits = ''
  for (const v of vals) bits += v > median ? '1' : '0'
  return bitsToHex(bits)
}

function bitsToHex(bits: string): string {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

/** Hamming distance between two 64-bit pHash hex strings. */
export function hammingDistance(hexA: string, hexB: string): number {
  let x = BigInt('0x' + hexA) ^ BigInt('0x' + hexB)
  let count = 0
  while (x > 0n) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

export function similarityFromHamming(distance: number, bits = 64): number {
  return Math.round(((bits - distance) / bits) * 100)
}
