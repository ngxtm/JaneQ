import type { TestAttemptSummary } from '../test/api'

const submittedTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatAttemptTime(submittedAt: string) {
  return submittedTimeFormat.format(new Date(submittedAt))
}

export function formatAttemptScore({ score, total }: Pick<TestAttemptSummary, 'score' | 'total'>) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0
  return `${score} / ${total} (${percent}%)`
}
