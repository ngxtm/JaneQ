import type { TestResult } from './api'

export function reviewResult(result: TestResult) {
  return {
    ...result,
    percent: Math.round(result.score / result.total * 100),
    questions: result.questions.map(({ selected_ids, correct_ids, answer_text, correct_text, ...question }) => {
      const selected = new Set(selected_ids)
      const correct = new Set(correct_ids)
      return {
        ...question,
        written: !question.options.length,
        options: answer_text !== undefined && correct_text !== undefined ? [
          { id: 'written-response', text: answer_text, selected: true, correct: answer_text === correct_text },
          ...(answer_text === correct_text ? [] : [{ id: 'written-key', text: correct_text, selected: false, correct: true }]),
        ] : question.options.map((option) => ({
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
