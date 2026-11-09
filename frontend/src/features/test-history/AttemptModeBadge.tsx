import { Badge } from '@chakra-ui/react'
import type { TestAttemptSummary } from '../test/api'

export function AttemptModeBadge({ mode, time_per_question }: Pick<TestAttemptSummary, 'mode' | 'time_per_question'>) {
  if (mode === 'timed') {
    return (
      <Badge colorPalette="orange" variant="subtle" size="sm">
        Timed{time_per_question ? ` · ${time_per_question}s/q` : ''}
      </Badge>
    )
  }
  return <Badge variant="outline" size="sm" color="janeq.muted">Standard</Badge>
}
