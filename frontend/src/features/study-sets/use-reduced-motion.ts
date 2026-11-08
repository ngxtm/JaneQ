import { useSyncExternalStore } from 'react'

const motionPreference = '(prefers-reduced-motion: reduce)'

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(motionPreference)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readMotionPreference() {
  return window.matchMedia(motionPreference).matches
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribeToMotionPreference, readMotionPreference)
}
