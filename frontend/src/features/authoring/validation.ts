import type { QuestionField } from './QuestionFields'

export function questionErrors({ prompt, options }: QuestionField) {
  const optionIssues = new Map<string, string>()
  const correctnessByText = new Map<string, boolean>()
  const conflictingTexts = new Set<string>()
  let filledOptions = 0
  for (const option of options) {
    const text = option.text.trim()
    if (!text) continue
    filledOptions++
    const correctness = correctnessByText.get(text)
    if (correctness !== undefined && correctness !== option.is_correct) conflictingTexts.add(text)
    correctnessByText.set(text, option.is_correct)
  }
  for (const option of options) {
    const text = option.text.trim()
    if (!text) optionIssues.set(option.key, 'Enter an option or remove this row.')
    else if (conflictingTexts.has(text)) optionIssues.set(option.key, 'Identical options must have matching Correct selections.')
  }
  const missingPrompt = !prompt.trim()
  const missingOptions = filledOptions < 2
  const missingAnswer = !options.some((option) => option.is_correct && option.text.trim())
  if (missingPrompt || missingOptions || missingAnswer || optionIssues.size) {
    return { missingPrompt, missingOptions, missingAnswer, optionIssues }
  }
  return undefined
}
