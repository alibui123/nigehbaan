/**
 * Persistent route-load overlay signals. `loading.tsx` starts a load; when it
 * unmounts the content is ready, but the layout overlay keeps animating to 100.
 */

type Listener = () => void

type RouteLoadState = {
  visible: boolean
  contentReady: boolean
  id: number
}

const listeners = new Set<Listener>()

let state: RouteLoadState = {
  visible: false,
  contentReady: false,
  id: 0,
}

function emit() {
  for (const fn of listeners) fn()
}

export function getRouteLoadState() {
  return state
}

export function subscribeRouteLoad(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function beginRouteLoad() {
  state = {
    visible: true,
    contentReady: false,
    id: state.id + 1,
  }
  emit()
}

export function markRouteLoadReady() {
  if (!state.visible || state.contentReady) return
  state = { ...state, contentReady: true }
  emit()
}

export function dismissRouteLoad(id: number) {
  if (state.id !== id) return
  state = {
    visible: false,
    contentReady: false,
    id: state.id,
  }
  emit()
}
