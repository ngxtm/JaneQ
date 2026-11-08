import { getStudyPreview, type StudyCard } from '../learn/api'

const freshnessMs = 30_000

export function createPreviewLoader() {
  let current: {
    id: string
    controller: AbortController
    request: Promise<StudyCard[]>
    freshUntil: number
  } | undefined

  function clear() {
    current?.controller.abort()
    current = undefined
  }

  function load(id: string) {
    if (current?.id === id && Date.now() < current.freshUntil) return current.request
    clear()
    const controller = new AbortController()
    const request = getStudyPreview(id, controller.signal).then((cards) => {
      if (current?.request === request) current.freshUntil = Date.now() + freshnessMs
      return cards
    }).catch((error: unknown) => {
      if (current?.request === request) current = undefined
      throw error
    })
    // Keep one preview per signed-in library, including its in-flight request.
    current = { id, controller, request, freshUntil: Infinity }
    return request
  }

  return { load, clear }
}
