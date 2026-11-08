import type { QuestionField } from './QuestionFields'

export function questionErrors({ prompt, options }: QuestionField) {
  const blankOptions = new Set(options.filter((option) => !option.text.trim()).map((option) => option.key))
  const missingPrompt = !prompt.trim()
  const missingOptions = options.length === 0
  const missingAnswer = !options.some((option) => option.is_correct && !blankOptions.has(option.key))
  if (missingPrompt || missingOptions || missingAnswer || blankOptions.size) {
    return { missingPrompt, missingOptions, missingAnswer, blankOptions }
  }
  return undefined
}
