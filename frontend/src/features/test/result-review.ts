import type { TestResult } from './api'

export function reviewResult(result: TestResult) {
  return {
    ...result,
    percent: Math.round((result.score / result.total) * 100),
    questions: result.questions.map(({ selected_ids, correct_ids, ...question }) => {
      const selected = new Set(selected_ids)
      const correct = new Set(correct_ids)
      return {
        ...question,
        unanswered: selected.size === 0 && !question.timed_out,
        options: question.options.map((option) => ({
          ...option,
          selected: selected.has(option.id),
          correct: correct.has(option.id),
        })),
      }
    }),
  }
}

export type ResultReview = ReturnType<typeof reviewResult>
export type QuestionReview = ResultReview['questions'][number]
