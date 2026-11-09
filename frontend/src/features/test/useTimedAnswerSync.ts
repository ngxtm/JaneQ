import { useCallback, useEffect, useRef, useState } from 'react'
import { isUnauthorized } from '../../http'
import type { TestResult } from './api'
import { saveTimedAnswer, type TimedPaper } from './timed-paper-api'

type ConfirmedAnswer = { version: number; selectedIds: string[] }
type SaveProblem = { attemptId: string; questionId: string } & (
  | { kind: 'failed' | 'retrying'; writeIds: string[] }
  | { kind: 'conflict'; saved: ConfirmedAnswer }
)
const noAnswer: string[] = []

function sameAnswer(left: string[] = noAnswer, right: string[] = noAnswer) {
  return left.length === right.length && left.every((id) => right.includes(id))
}

export function useTimedAnswerSync(
  paper: TimedPaper | undefined,
  selections: ReadonlyMap<string, string[]>,
  expired: boolean,
  onResult: (result: TestResult) => void,
  onSessionExpired: () => void,
) {
  const [confirmed, setConfirmed] = useState<{ attemptId: string; answers: Map<string, ConfirmedAnswer> }>()
  const [saveProblem, setSaveProblem] = useState<SaveProblem>()
  const [saving, setSaving] = useState(false)
  const request = useRef<AbortController | null>(null)
  const attemptId = paper?.attempt_id
  const savedAnswers = confirmed?.attemptId === attemptId ? confirmed?.answers : undefined
  const problem = saveProblem?.attemptId === attemptId ? saveProblem : undefined
  const conflict = problem?.kind === 'conflict' ? problem : undefined
  const retrying = problem?.kind === 'retrying' ? problem : undefined
  const unsavedId = problem?.questionId ?? paper?.questions.find(({ id }) =>
    !sameAnswer(selections.get(id), savedAnswers?.get(id)?.selectedIds ?? paper.answers[id]))?.id
  const selectedIds = unsavedId ? selections.get(unsavedId) ?? noAnswer : noAnswer
  const version = unsavedId ? savedAnswers?.get(unsavedId)?.version ?? paper?.answer_versions[unsavedId] ?? 0 : 0
  const failed = problem?.kind === 'failed'
  const retry = useCallback(() => {
    setSaveProblem((pending) => pending?.kind === 'failed' ? { ...pending, kind: 'retrying' } : pending)
  }, [])
  const resolveConflict = () => setSaveProblem(undefined)

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (!attemptId || !unsavedId || expired || failed || conflict || saving || request.current) return

    // Save one change at a time. Choices made in flight remain eligible for the next save.
    const controller = new AbortController()
    const writeId = crypto.randomUUID()
    request.current = controller
    setSaving(true)
    saveTimedAnswer(attemptId, {
      question_id: unsavedId, selected_ids: selectedIds, expected_version: version, write_id: writeId,
    }, controller.signal)
      .then((update) => {
        if (controller.signal.aborted) return
        if (update.kind === 'finished') {
          onResult(update.result)
          return
        }
        const saved = { version: update.version, selectedIds: update.selectedIds }
        setConfirmed((previous) => {
          const answers = new Map(previous?.attemptId === attemptId ? previous.answers : undefined)
          answers.set(unsavedId, saved)
          return { attemptId, answers }
        })
        const acknowledged = update.kind === 'conflict' && update.writeId !== undefined
          && retrying?.writeIds.includes(update.writeId)
        if (update.kind === 'conflict' && !acknowledged && !sameAnswer(selectedIds, saved.selectedIds)) {
          setSaveProblem({ kind: 'conflict', attemptId, questionId: unsavedId, saved })
        } else {
          setSaveProblem(undefined)
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isUnauthorized(error)) onSessionExpired()
        else setSaveProblem({ kind: 'failed', attemptId, questionId: unsavedId, writeIds: [...(retrying?.writeIds ?? []), writeId] })
      })
      .finally(() => {
        request.current = null
        if (!controller.signal.aborted) setSaving(false)
      })
  }, [attemptId, conflict, expired, failed, onResult, onSessionExpired, retrying, saving, selectedIds, unsavedId, version])

  useEffect(() => {
    if (!failed) return
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [failed, retry])

  return {
    saving,
    unsaved: Boolean(unsavedId),
    failed,
    conflict,
    retry,
    resolveConflict,
  }
}
