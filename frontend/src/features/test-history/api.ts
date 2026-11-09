import { http } from '../../http'
import { isTestResult, type TestAttemptSummary, type TestResult } from '../test/api'

export type TestHistoryPage = {
  attempts: TestAttemptSummary[]
  next_before: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isTestAttemptSummary(value: unknown): value is TestAttemptSummary {
  if (!isRecord(value)) return false
  if (typeof value.attempt_id !== 'string' || !value.attempt_id.trim()) return false
  if (value.mode !== 'standard' && value.mode !== 'timed') return false
  if (typeof value.set_id !== 'string' || !value.set_id.trim()) return false
  if (typeof value.title !== 'string') return false
  if (!isCount(value.revision)) return false
  if (!isCount(value.score)) return false
  if (!isCount(value.total) || value.total < value.score) return false
  if (typeof value.submitted_by !== 'string' || !value.submitted_by.trim()) return false
  if (typeof value.submitted_at !== 'string' || !/(?:Z|\+00:00)$/.test(value.submitted_at)
    || !Number.isFinite(Date.parse(value.submitted_at))) return false
  if ('time_per_question' in value && value.time_per_question !== null && value.time_per_question !== undefined
    && (typeof value.time_per_question !== 'number' || value.time_per_question <= 0)) return false
  return true
}

function isTestHistoryPage(value: unknown): value is TestHistoryPage {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.attempts) || !value.attempts.every(isTestAttemptSummary)) return false
  if (value.next_before !== null && (typeof value.next_before !== 'string' || !value.next_before.trim())) return false
  return true
}

type HistoryQuery = { limit?: number; before?: string; set_id?: string }

export async function listTestAttempts(signal: AbortSignal, params: HistoryQuery = {}): Promise<TestHistoryPage> {
  const { data } = await http.get<unknown>('/test-attempts', { params, signal })
  if (!isTestHistoryPage(data)) {
    throw new Error('Unexpected Test History response.')
  }
  return data
}

export async function getTestAttempt(attemptId: string, signal: AbortSignal): Promise<TestResult> {
  const { data } = await http.get<unknown>(`/test-attempts/${encodeURIComponent(attemptId)}`, { signal })
  if (!isTestResult(data) || data.attempt_id !== attemptId) {
    throw new Error('Unexpected Test Attempt response.')
  }
  return data
}
