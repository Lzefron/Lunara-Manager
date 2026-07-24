export interface Toast {
  id: string
  text: string
  kind: 'error' | 'success'
}

type Listener = (toast: Toast) => void

let listeners: Listener[] = []

export function showToast(text: string, kind: Toast['kind'] = 'error'): void {
  const toast: Toast = { id: crypto.randomUUID(), text, kind }
  listeners.forEach((listener) => listener(toast))
}

export function subscribeToast(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
