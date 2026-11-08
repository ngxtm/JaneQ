import { http } from '../../http'
import type { StudySet } from './api'

export type AnswerKeyOption = { id: string; text: string; is_correct: boolean }
export type AnswerKeyQuestion = { id: string; prompt: string; configured: boolean; options: AnswerKeyOption[] }
export type AnswerKey = Pick<StudySet, 'title' | 'status' | 'configured_count'> & {
  revision: number
  questions: AnswerKeyQuestion[]
}

export type AnswerSelections = Record<string, string[]>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOption(value: unknown): value is AnswerKeyOption {
  return record(value) && typeof value.id === 'string' && typeof value.text === 'string'
    && typeof value.is_correct === 'boolean'
}

function isQuestion(value: unknown): value is AnswerKeyQuestion {
  return record(value) && typeof value.id === 'string' && typeof value.prompt === 'string'
    && typeof value.configured === 'boolean' && Array.isArray(value.options) && value.options.every(isOption)
}

function validateKey(data: unknown): AnswerKey {
  if (!record(data) || typeof data.title !== 'string' || (data.status !== 'draft' && data.status !== 'ready')
    || typeof data.revision !== 'number' || !Number.isInteger(data.revision) || data.revision < 1
    || typeof data.configured_count !== 'number' || !Number.isInteger(data.configured_count)
    || data.configured_count < 0 || !Array.isArray(data.questions) || !data.questions.every(isQuestion)) {
    throw new Error('Unexpected answer key response.')
  }
  return {
    title: data.title, status: data.status, revision: data.revision,
    configured_count: data.configured_count, questions: data.questions,
  }
}

function editorPath(id: string) {
  return `/study-sets/${encodeURIComponent(id)}/editor`
}

export async function getAnswerKey(id: string, signal: AbortSignal): Promise<AnswerKey> {
  const { data } = await http.get<unknown>(editorPath(id), { signal })
  return validateKey(data)
}

export async function saveAnswerKey(id: string, revision: number, answers: AnswerSelections, signal: AbortSignal): Promise<AnswerKey> {
  const { data } = await http.put<unknown>(editorPath(id), { revision, answers }, { signal })
  return validateKey(data)
}
