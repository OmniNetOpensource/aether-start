import { beforeEach, describe, expect, it } from 'vitest'
import { useToastStore } from './toast'

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('adds a toast and returns a generated id', () => {
    const id = useToastStore.getState().addToast({
      message: 'hello',
      variant: 'info',
    })

    const { toasts } = useToastStore.getState()
    expect(id).toEqual(expect.any(String))
    expect(toasts).toHaveLength(1)
    expect(toasts[0].id).toBe(id)
    expect(toasts[0].message).toBe('hello')
    expect(toasts[0].variant).toBe('info')
  })

  it('removes a toast by id', () => {
    const id = useToastStore.getState().addToast({
      message: 'to remove',
      variant: 'warning',
    })

    useToastStore.getState().removeToast(id)

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('clears all toasts', () => {
    useToastStore.getState().addToast({ message: 'a', variant: 'success' })
    useToastStore.getState().addToast({ message: 'b', variant: 'error' })

    useToastStore.getState().clearAll()

    expect(useToastStore.getState().toasts).toEqual([])
  })
})
