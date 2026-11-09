import { isAxiosError } from 'axios'
import { http } from '../../http'
import { isTestPaper, isTestResult, type TestAnswer, type TestPaper, type TestResult } from './api'

type TimedPaperResponse = TestPaper & {
  status: 'paper'
  attempt_id: string
  server_now: string
  deadline_at: string
  duration_minutes: number
  answers: Record<string, string[]>
  answer_versions: Record<string, number>
}

export type TimedPaper = TimedPaperResponse & { clientDeadline: number }
type TimedPaperState = TimedPaper | { status: 'completed'; result: TestResult }
type TimedFinish = { kind: 'finished'; result: TestResult } | { kind: 'running'; clientDeadline: number }
type AnswerUpdate =
  | { kind: 'confirmed'; version: number; selectedIds: string[] }
  | { kind: 'conflict'; version: number; selectedIds: string[]; writeId?: string }
  | { kind: 'finished'; result: TestResult }

const writeTimeoutMs = 5_000

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAnswerVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function conflictDetail(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error) || error.response?.status !== 409) return
  const data: unknown = error.response.data
  if (isRecord(data) && isRecord(data.detail)) return data.detail
}

function isTimedPaper(value: unknown, setId: string): value is TimedPaperResponse {
  if (!isTestPaper(value, setId) || value.status !== 'paper'
    || typeof value.attempt_id !== 'string' || !value.attempt_id
    || !isTimestamp(value.server_now) || !isTimestamp(value.deadline_at)
    || typeof value.duration_minutes !== 'number' || !Number.isInteger(value.duration_minutes)
    || value.duration_minutes < 1 || value.duration_minutes > 1440
    || !isRecord(value.answers) || !isRecord(value.answer_versions)) return false

  const questions = new Map(value.questions.map((question) => [question.id, question]))
  if (!Object.entries(value.answer_versions).every(([id, version]) => questions.has(id) && isAnswerVersion(version))) return false
  return Object.entries(value.answers).every(([id, selected]) => {
    const question = questions.get(id)
    if (!question || !Array.isArray(selected) || selected.length === 0 || new Set(selected).size !== selected.length
      || (!question.multiple && selected.length !== 1)) return false
    return selected.every((optionId) => question.options.some((option) => option.id === optionId))
  })
}

function deadlineOnClient(deadlineAt: string, serverNow: string, localServerNow: number) {
  return localServerNow + Math.max(0, Date.parse(deadlineAt) - Date.parse(serverNow))
}

export async function startTimedPaper(setId: string, startId: string, duration: number, signal: AbortSignal): Promise<TimedPaperState> {
  const sentAt = performance.now()
  const { data } = await http.post<unknown>(`/study-sets/${encodeURIComponent(setId)}/timed-test`, {
    start_id: startId, duration_minutes: duration,
  }, { signal })
  const receivedAt = performance.now()
  if (isTimedPaper(data, setId)) {
    // Estimate the clock offset from the request midpoint. The server still enforces expiry.
    const clientDeadline = deadlineOnClient(data.deadline_at, data.server_now, (sentAt + receivedAt) / 2)
    return { ...data, clientDeadline }
  }
  if (data && typeof data === 'object' && 'status' in data && data.status === 'completed' && 'result' in data
    && isTestResult(data.result) && data.result.mode === 'timed' && data.result.set_id === setId) {
    return { status: 'completed', result: data.result }
  }
  throw new Error('Unexpected timed test response.')
}

function readTimedResult(data: unknown, attemptId: string): TestResult {
  if (!isTestResult(data) || data.mode !== 'timed' || data.attempt_id !== attemptId) {
    throw new Error('Unexpected timed test result.')
  }
  return data
}

export async function saveTimedAnswer(
  attemptId: string, answer: TestAnswer & { expected_version: number; write_id: string }, signal: AbortSignal,
): Promise<AnswerUpdate> {
  try {
    const { data } = await http.put<unknown>(`/test-attempts/${encodeURIComponent(attemptId)}/answer`, answer, {
      signal, timeout: writeTimeoutMs,
    })
    return data === null
      ? { kind: 'confirmed', version: answer.expected_version + 1, selectedIds: answer.selected_ids }
      : { kind: 'finished', result: readTimedResult(data, attemptId) }
  } catch (error) {
    const detail = conflictDetail(error)
    if (detail?.code !== 'answer_version_changed' || !isAnswerVersion(detail.version)
      || !Array.isArray(detail.selected_ids) || !detail.selected_ids.every((id: unknown) => typeof id === 'string')) throw error
    const writeId = detail.write_id
    if (writeId !== undefined && typeof writeId !== 'string') throw error
    return { kind: 'conflict', version: detail.version, selectedIds: detail.selected_ids, writeId }
  }
}

export async function finishTimedPaper(paper: TimedPaper, onlyIfExpired: boolean, signal: AbortSignal): Promise<TimedFinish> {
  try {
    const { data } = await http.post<unknown>(`/test-attempts/${encodeURIComponent(paper.attempt_id)}/finish`, undefined, {
      params: { only_if_expired: onlyIfExpired }, signal, timeout: writeTimeoutMs,
    })
    return { kind: 'finished', result: readTimedResult(data, paper.attempt_id) }
  } catch (error) {
    const detail = conflictDetail(error)
    if (!onlyIfExpired || detail?.code !== 'time_remaining' || !isTimestamp(detail.server_now)) throw error

    // Use the reply time after an early finish so the next request cannot repeat the early estimate.
    const clientDeadline = deadlineOnClient(paper.deadline_at, detail.server_now, performance.now())
    return { kind: 'running', clientDeadline }
  }
}
