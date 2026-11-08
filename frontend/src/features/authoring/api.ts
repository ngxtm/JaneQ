import { http } from '../../http'
import { isStudySet } from '../study-sets/api'

export type OptionContent = { text: string; is_correct: boolean }
export type QuestionContent = { prompt: string; options: OptionContent[] }
export type SetContent = { title: string; description: string; questions: QuestionContent[] }
export type SetRevision = SetContent & { revision: number; saved_at: string | null }

function isOption(value: unknown): value is OptionContent {
  return typeof value === 'object' && value !== null
    && 'text' in value && typeof value.text === 'string'
    && 'is_correct' in value && typeof value.is_correct === 'boolean'
}

function isQuestion(value: unknown): value is QuestionContent {
  return typeof value === 'object' && value !== null
    && 'prompt' in value && typeof value.prompt === 'string'
    && 'options' in value && Array.isArray(value.options) && value.options.every(isOption)
}

function isSetRevision(value: unknown): value is SetRevision {
  if (typeof value !== 'object' || value === null) return false
  const set = value as Partial<SetRevision>
  return typeof set.title === 'string' && typeof set.description === 'string'
    && (set.saved_at === null || (typeof set.saved_at === 'string' && Number.isFinite(Date.parse(set.saved_at))))
    && typeof set.revision === 'number' && Number.isInteger(set.revision) && set.revision > 0
    && Array.isArray(set.questions) && set.questions.every(isQuestion)
}

function editorPath(id: string) {
  return `/study-sets/${encodeURIComponent(id)}/editor`
}

export async function getEditor(id: string, signal: AbortSignal) {
  const { data } = await http.get<unknown>(editorPath(id), { signal })
  if (!isSetRevision(data)) throw new Error('Unexpected editor response.')
  return data
}

export async function saveEditor(content: SetContent, destination: { id: string; revision: number } | { creationKey?: string }) {
  const { data } = 'id' in destination
    ? await http.put<unknown>(editorPath(destination.id), { ...content, revision: destination.revision })
    : await http.post<unknown>('/study-sets', content, { headers: { 'Idempotency-Key': destination.creationKey } })
  if (!isStudySet(data) || data.source_kind !== 'custom') throw new Error('Unexpected saved study set.')
  return data
}

export async function deleteEditorSet(id: string, revision: number) {
  await http.delete(`/study-sets/${encodeURIComponent(id)}`, { params: { revision } })
}
