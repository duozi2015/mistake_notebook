import { describe, it, expect } from 'vitest'
import { useToastStore } from '../stores/toastStore'

describe('toastStore', () => {
  it('should start with empty toasts', () => {
    const state = useToastStore.getState()
    expect(state.toasts).toEqual([])
  })

  it('should add a toast', () => {
    const { addToast } = useToastStore.getState()
    addToast('test message', 'success')
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('test message')
    expect(toasts[0].type).toBe('success')
  })

  it('should remove a toast', () => {
    // Add a toast
    const { addToast } = useToastStore.getState()
    addToast('to remove', 'info')
    const added = useToastStore.getState().toasts[0]

    // Remove it
    const { removeToast } = useToastStore.getState()
    removeToast(added.id)
    const toasts = useToastStore.getState().toasts
    expect(toasts.find((t) => t.id === added.id)).toBeUndefined()
  })

  it('should add multiple toasts', () => {
    const { addToast } = useToastStore.getState()
    addToast('first', 'success')
    addToast('second', 'error')
    addToast('third', 'info')
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThanOrEqual(3)
  })
})
