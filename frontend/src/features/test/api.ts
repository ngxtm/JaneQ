import { isAxiosError } from 'axios'
import { http } from '../../http'
import { isQuestion, type Question } from '../study-sets/question'

type TestMetadata = { set_id: string; title: string; revision: number }
export type TestPaper = TestMetadata & { questions: Question[] }
export type GradedQuestion = Question & {
  selected_ids: string[]
  correct_ids: string[]
  correct: boolean
  timed_out?: boolean
}
export type TestAttemptSummary = {
  attempt_id: string
  mode: 'standard' | 'timed'
  set_id: string
  title: string
  revision: number
  score: number
  total: number
  submitted_by: string
  submitted_at: string
  time_per_question?: number | null
}
export type TestResult = TestMetadata & {
  attempt_id: string
  mode: 'standard' | 'timed'
  time_per_question?: number | null
  score: number
  total: number
  submitted_by: string
  submitted_at: string
  questions: GradedQuestion[]
}
export type TestAnswer = { question_id: string; selected_ids: string[] }
type TestConflict =
  | { code: 'draft'; remaining_questions: number }
  | { code: 'revision_changed' | 'submission_id_reused' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isMetadata(value: unknown, id: string): value is TestMetadata & Record<string, unknown> {
  return isRecord(value) && value.set_id === id && typeof value.title === 'string' && isCount(value.revision)
}

export function isGradedQuestion(value: unknown): value is GradedQuestion {
  if (!isQuestion(value)) return false
  const optionIds = new Set(value.options.map((option) => option.id))
  const validIds = (ids: unknown) => Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length
    && ids.every((id: unknown) => typeof id === 'string' && optionIds.has(id))
  const validSelectedIds = (ids: unknown) => Array.isArray(ids) && new Set(ids).size === ids.length
    && ids.every((id: unknown) => typeof id === 'string' && optionIds.has(id))
  const validTimedOut = !('timed_out' in value) || value.timed_out === undefined || typeof value.timed_out === 'boolean'
  return 'correct' in value && typeof value.correct === 'boolean'
    && 'selected_ids' in value && validSelectedIds(value.selected_ids)
    && 'correct_ids' in value && validIds(value.correct_ids)
    && validTimedOut
}

export function isTestResult(data: unknown): data is TestResult {
  if (!isRecord(data)) return false
  if (typeof data.attempt_id !== 'string' || !data.attempt_id.trim()) return false
  if (data.mode !== 'standard' && data.mode !== 'timed') return false
  if (typeof data.set_id !== 'string' || !data.set_id.trim()) return false
  if (typeof data.title !== 'string') return false
  if (!isCount(data.revision)) return false
  if (typeof data.submitted_by !== 'string' || !data.submitted_by.trim()) return false
  if (typeof data.submitted_at !== 'string' || !/(?:Z|\+00:00)$/.test(data.submitted_at)
    || !Number.isFinite(Date.parse(data.submitted_at))) return false
  if ('time_per_question' in data && data.time_per_question !== null && data.time_per_question !== undefined
    && (typeof data.time_per_question !== 'number' || data.time_per_question <= 0)) return false
  if (!Array.isArray(data.questions) || !data.questions.every(isGradedQuestion)) return false
  if (!isCount(data.total) || data.total !== data.questions.length) return false
  if (!isCount(data.score) || data.score !== data.questions.filter((question) => question.correct).length) return false
  return true
}

function testPath(id: string) {
  return `/study-sets/${encodeURIComponent(id)}/test`
}

export function isTestPaper(data: unknown, setId: string): data is TestPaper & Record<string, unknown> {
  return isMetadata(data, setId) && Array.isArray(data.questions) && data.questions.length > 0
    && data.questions.every(isQuestion)
}

export async function getTest(id: string, signal: AbortSignal): Promise<TestPaper> {
  const { data } = await http.get<unknown>(testPath(id), { signal })
  if (!isTestPaper(data, id)) {
    throw new Error('Unexpected Test response.')
  }
  return data
}

export async function submitTest(
  paper: TestPaper,
  answers: TestAnswer[],
  signal: AbortSignal,
  submissionId?: string,
  allowUnanswered = false,
): Promise<TestResult> {
  const payload = {
    revision: paper.revision, answers,
    ...(submissionId ? { submission_id: submissionId } : {}),
    ...(allowUnanswered ? { allow_unanswered: true } : {}),
  }
  const { data } = await http.post<unknown>(testPath(paper.set_id), payload, { signal })
  if (!isTestResult(data) || data.set_id !== paper.set_id || data.revision !== paper.revision
    || data.total !== paper.questions.length) {
    throw new Error('Unexpected Test Results response.')
  }
  return data
}

export function testConflict(error: unknown): TestConflict | undefined {
  if (!isAxiosError(error) || error.response?.status !== 409) return
  const data: unknown = error.response.data
  if (!isRecord(data) || !isRecord(data.detail)) return
  const { code, remaining_questions } = data.detail
  if (code === 'draft' && isCount(remaining_questions)) return { code, remaining_questions }
  if (code === 'revision_changed' || code === 'submission_id_reused') return { code }
}
