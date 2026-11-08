import { useEffect, useRef, useState } from 'react'
import { isUnauthorized } from '../../http'
import { getLearn, learnError, learnStepChanged, updateLearn, type LearnAction, type LearnView } from './api'

export function useLearn(setId: string, onSessionExpired: () => void) {
  const [view, setView] = useState<LearnView>()
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    getLearn(setId, controller.signal).then((next) => {
      if (controller.signal.aborted) return
      setView(next)
      if (next.revision_changed) setNotice('This set changed. A new Learn session is ready.')
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(failure)) onSessionExpired()
      else setError(learnError(failure, 'Could not load Learn.'))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [attempt, onSessionExpired, setId])

  function reload() {
    setView(undefined)
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  async function send(action: LearnAction): Promise<boolean> {
    const controller = request.current
    if (!view || !controller || controller.signal.aborted || inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const next = await updateLearn(setId, view, action, controller.signal)
      if (controller.signal.aborted) return false
      setView(next)
      setNotice('')
      return true
    } catch (failure) {
      if (controller.signal.aborted) return false
      if (isUnauthorized(failure)) onSessionExpired()
      else if (learnStepChanged(failure)) {
        setNotice('Your Learn progress was refreshed.')
        reload()
      } else setError(learnError(failure, 'Could not save your progress. Try again.'))
      return false
    } finally {
      inFlight.current = false
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return { view, loading, busy, error, notice, reload, send }
}
