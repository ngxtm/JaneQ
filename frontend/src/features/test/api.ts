import { isAxiosError } from 'axios'
import { http } from '../../http'
import { isQuestion, type Question } from '../study-sets/question'

type TestMetadata = { set_id: string; title: string; revision: number }
export type TestPaper = TestMetadata & { questions: Question[] }
export type GradedQuestion = Question & { selected_ids: string[]; correct_ids: string[]; correct: boolean }
export type TestResult = TestMetadata & {
  score: number
  total: number
  submitted_by: string
  submitted_at: string
  questions: GradedQuestion[]
}
type TestAnswer = { question_id: string; selected_ids: string[] }
type TestConflict = { code: 'draft'; remaining_questions: number } | { code: 'revision_changed' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isMetadata(value: unknown, id: string): value is TestMetadata & Record<string, unknown> {
  return isRecord(value) && value.set_id === id && typeof value.title === 'string' && isCount(value.revision)
}

function isGradedQuestion(value: unknown): value is GradedQuestion {
  if (!isQuestion(value)) return false
  const optionIds = new Set(value.options.map((option) => option.id))
  const validIds = (ids: unknown) => Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length
    && ids.every((id: unknown) => typeof id === 'string' && optionIds.has(id))
  return 'correct' in value && typeof value.correct === 'boolean'
    && 'selected_ids' in value && validIds(value.selected_ids)
    && 'correct_ids' in value && validIds(value.correct_ids)
}

function testPath(id: string) {
  return `/study-sets/${encodeURIComponent(id)}/test`
}

export async function getTest(id: string, signal: AbortSignal): Promise<TestPaper> {
  const { data } = await http.get<unknown>(testPath(id), { signal })
  if (!isMetadata(data, id) || !Array.isArray(data.questions) || data.questions.length === 0
    || !data.questions.every(isQuestion)) {
    throw new Error('Unexpected Test response.')
  }
  return { ...data, questions: data.questions }
}

export async function submitTest(paper: TestPaper, answers: TestAnswer[], signal: AbortSignal): Promise<TestResult> {
  const { data } = await http.post<unknown>(testPath(paper.set_id), { revision: paper.revision, answers }, { signal })
  if (!isMetadata(data, paper.set_id) || data.revision !== paper.revision
    || typeof data.submitted_by !== 'string' || !data.submitted_by.trim()
    || typeof data.submitted_at !== 'string' || !/(?:Z|\+00:00)$/.test(data.submitted_at)
    || !Number.isFinite(Date.parse(data.submitted_at))
    || !Array.isArray(data.questions) || !data.questions.every(isGradedQuestion)
    || data.total !== paper.questions.length || data.total !== data.questions.length
    || !isCount(data.score) || data.score !== data.questions.filter((question) => question.correct).length) {
    throw new Error('Unexpected Test Results response.')
  }
  return data as TestResult
}

export function testConflict(error: unknown): TestConflict | undefined {
  if (!isAxiosError(error) || error.response?.status !== 409) return
  const data: unknown = error.response.data
  if (!isRecord(data) || !isRecord(data.detail)) return
  const { code, remaining_questions } = data.detail
  if (code === 'draft' && isCount(remaining_questions)) return { code, remaining_questions }
  if (code === 'revision_changed') return { code }
}
