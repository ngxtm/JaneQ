export type Option = { id: string; text: string }
export type Question = { id: string; prompt: string; options: Option[]; multiple: boolean }
export type AnswerInput = { selected_ids: string[] } | { answer_text: string }

export function isQuestion(value: unknown): value is Question {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'prompt' in value && typeof value.prompt === 'string'
    && 'multiple' in value && typeof value.multiple === 'boolean'
    && 'options' in value && Array.isArray(value.options)
    && value.options.every((option: unknown) => typeof option === 'object' && option !== null
      && 'id' in option && typeof option.id === 'string' && 'text' in option && typeof option.text === 'string')
}
