import { http } from '../../http'

const setIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

export type StudySet = {
  id: string
  legacy_id: string | null
  title: string
  description: string
  source_kind: 'builtin' | 'custom'
  question_count: number
  configured_count: number
  status: 'draft' | 'ready'
}

function isStudySet(value: unknown): value is StudySet {
  if (typeof value !== 'object' || value === null) return false
  const set = value as Partial<StudySet>
  return typeof set.id === 'string' && setIdPattern.test(set.id)
    && (set.legacy_id === null || typeof set.legacy_id === 'string')
    && typeof set.title === 'string'
    && typeof set.description === 'string'
    && (set.source_kind === 'builtin' || set.source_kind === 'custom')
    && typeof set.question_count === 'number'
    && typeof set.configured_count === 'number'
    && (set.status === 'draft' || set.status === 'ready')
}

export async function getStudySets(signal: AbortSignal): Promise<StudySet[]> {
  const { data } = await http.get<unknown>('/study-sets', { signal })
  if (!Array.isArray(data) || !data.every(isStudySet)) {
    throw new Error('Unexpected study sets response.')
  }
  return data
}
