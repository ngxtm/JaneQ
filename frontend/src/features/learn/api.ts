import axios from 'axios'
import { http } from '../../http'

export type StudyCard = { id: string; prompt: string; answers: string[] }
export type Option = { id: string; text: string }
export type Question = { id: string; prompt: string; options: Option[]; multiple: boolean }
export type Feedback = { correct: boolean; selected_ids: string[]; correct_ids: string[] }
export type RoundReview = StudyCard & { correct: boolean }

export type LearnView = {
  revision: number
  version: string | null
  revision_changed: boolean
  phase: 'question' | 'feedback' | 'summary' | 'complete'
  round: number
  round_size: number
  round_answered: number
  total_questions: number
  studied: number
  familiar: number
  mastered: number
  shuffle: boolean
  question: Question | null
  feedback: Feedback | null
  review: RoundReview[]
}

export type LearnAction =
  | { action: 'check'; selected_ids: string[] }
  | { action: 'advance' | 'reset' }
  | { action: 'settings'; shuffle: boolean }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStudyCard(value: unknown): value is StudyCard {
  return record(value) && typeof value.id === 'string' && typeof value.prompt === 'string' && strings(value.answers)
}

function isQuestion(value: unknown): value is Question {
  return record(value) && typeof value.id === 'string' && typeof value.prompt === 'string'
    && typeof value.multiple === 'boolean' && Array.isArray(value.options)
    && value.options.every((option: unknown) => record(option) && typeof option.id === 'string' && typeof option.text === 'string')
}

function isFeedback(value: unknown): value is Feedback {
  return record(value) && typeof value.correct === 'boolean' && strings(value.selected_ids) && strings(value.correct_ids)
}

function validateView(data: unknown): LearnView {
  if (!record(data)
    || typeof data.phase !== 'string' || !['question', 'feedback', 'summary', 'complete'].includes(data.phase)
    || !['revision', 'round', 'round_size', 'round_answered', 'total_questions', 'studied', 'familiar', 'mastered']
      .every((key) => typeof data[key] === 'number' && Number.isInteger(data[key]) && data[key] >= 0)
    || (data.version !== null && typeof data.version !== 'string')
    || typeof data.revision_changed !== 'boolean' || typeof data.shuffle !== 'boolean'
    || ((data.phase === 'question' || data.phase === 'feedback') ? !isQuestion(data.question) : data.question !== null)
    || (data.phase === 'feedback' ? !isFeedback(data.feedback) : data.feedback !== null)
    || !Array.isArray(data.review)
    || !data.review.every((item: unknown) => isStudyCard(item) && 'correct' in item && typeof item.correct === 'boolean')) {
    throw new Error('Unexpected Learn response.')
  }
  return data as LearnView
}

function studySetPath(id: string) {
  return `/study-sets/${encodeURIComponent(id)}`
}

export async function getStudyPreview(id: string, signal: AbortSignal): Promise<StudyCard[]> {
  const { data } = await http.get<unknown>(`${studySetPath(id)}/preview`, { signal })
  if (!Array.isArray(data) || !data.every(isStudyCard)) throw new Error('Unexpected study preview response.')
  return data
}

export async function getLearn(id: string, signal: AbortSignal): Promise<LearnView> {
  const { data } = await http.get<unknown>(`${studySetPath(id)}/learn`, { signal })
  return validateView(data)
}

export async function updateLearn(id: string, view: LearnView, action: LearnAction, signal: AbortSignal): Promise<LearnView> {
  const { data } = await http.post<unknown>(`${studySetPath(id)}/learn`, {
    ...action, revision: view.revision, version: view.version,
  }, { signal })
  return validateView(data)
}

export function learnError(error: unknown, fallback: string): string {
  const data: unknown = axios.isAxiosError(error) ? error.response?.data : null
  if (!record(data)) return fallback
  if (typeof data.detail === 'string') return data.detail
  const issue: unknown = Array.isArray(data.detail) ? data.detail[0] : null
  return record(issue) && typeof issue.msg === 'string' ? issue.msg : fallback
}

export function learnStepChanged(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409
}
