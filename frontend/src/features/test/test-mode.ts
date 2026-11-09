export type TestMode = { kind: 'standard' } | { kind: 'timed'; duration: number; startId: string }
const inMemoryModes = new Map<string, TestMode>()

export function describeDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} min`
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`
}

export function readTestMode(setId: string): TestMode | null {
  const inMemoryMode = inMemoryModes.get(setId)
  if (inMemoryMode) return inMemoryMode
  try {
    const mode = JSON.parse(sessionStorage.getItem(`janeq:test-mode:${setId}`) ?? 'null') as Partial<TestMode> | null
    if (mode?.kind === 'standard') return { kind: 'standard' }
    if (mode?.kind === 'timed' && typeof mode.duration === 'number' && Number.isInteger(mode.duration)
      && mode.duration >= 1 && mode.duration <= 1440 && typeof mode.startId === 'string') {
      return { kind: 'timed', duration: mode.duration, startId: mode.startId }
    }
  } catch {
    // Direct links can open the mode picker when browser storage is unavailable.
  }
  return null
}

export function saveTestMode(setId: string, mode: TestMode) {
  try {
    sessionStorage.setItem(`janeq:test-mode:${setId}`, JSON.stringify(mode))
    inMemoryModes.delete(setId)
  } catch {
    inMemoryModes.set(setId, mode)
  }
}
