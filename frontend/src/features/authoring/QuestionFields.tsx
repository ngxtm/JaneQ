import { Button, Checkbox, Field, Flex, Grid, Heading, IconButton, Input, Stack, Text, Textarea, VisuallyHidden } from '@chakra-ui/react'
import { IconListDetails, IconTrash } from '@tabler/icons-react'
import type { OptionContent } from './api'

export type OptionField = OptionContent & { key: string }
export type QuestionField = { key: string; prompt: string; options: OptionField[] }

type QuestionFieldsProps = {
  question: QuestionField
  number: number
  focusKey: string | undefined
  onChange: (question: QuestionField) => void
  onAddOption: () => void
  onRemove: () => void
}

export function QuestionFields({ question, number, focusKey, onChange, onAddOption, onRemove }: QuestionFieldsProps) {
  const headingId = `question-${question.key}`

  function updateOption(key: string, update: Partial<OptionContent>) {
    onChange({ ...question, options: question.options.map((option) => option.key === key ? { ...option, ...update } : option) })
  }

  return (
    <Stack as="section" aria-labelledby={headingId} bg="white" rounded="xl" border="1px solid" borderColor="janeq.divider" shadow="sm" gap="0">
      <Flex align="center" justify="space-between" gap="4" px="5" py="2" borderBottom="1px solid" borderColor="janeq.divider">
        <Heading as="h3" id={headingId} size="md">Question {number}</Heading>
        <IconButton type="button" variant="ghost" size="sm" aria-label={`Remove question ${number}`} onClick={onRemove}>
          <IconTrash size={18} />
        </IconButton>
      </Flex>
      <Grid templateColumns={{ base: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }} gap="6" p="5">
        <Field.Root>
          <Textarea value={question.prompt} autoFocus={focusKey === question.key} resize="vertical"
            variant="flushed" borderColor="janeq.line"
            onChange={(event) => onChange({ ...question, prompt: event.target.value })}
            rows={2} placeholder="Enter a question" />
          <Field.Label color="janeq.muted" fontSize="sm">Question {number} prompt</Field.Label>
        </Field.Root>
        <Stack gap="3">
          <Text fontSize="sm" fontWeight="medium">Answer options</Text>
          {question.options.map((option, index) => (
            <Flex key={option.key} gap="2" align="end" flexWrap="wrap">
              <Field.Root flex="1" minW="28">
                <VisuallyHidden asChild><Field.Label>Question {number}, option {index + 1}</Field.Label></VisuallyHidden>
                <Input value={option.text} autoFocus={focusKey === option.key} placeholder={`Option ${index + 1}`}
                  variant="flushed" borderColor="janeq.line" onChange={(event) => {
                  const text = event.target.value
                  updateOption(option.key, { text, is_correct: Boolean(text.trim()) && option.is_correct })
                }} />
              </Field.Root>
              <Checkbox.Root checked={option.is_correct} disabled={!option.text.trim()} minH="10" colorPalette="blue"
                css={{ '&:has(input:focus-visible) [data-part=control]': { outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '2px' } }}
                onCheckedChange={({ checked }) => updateOption(option.key, { is_correct: checked === true })}>
                <Checkbox.HiddenInput />
                <Checkbox.Control borderStyle="solid" borderColor="janeq.muted" _checked={{ bg: 'janeq.blue', borderColor: 'janeq.blue', color: 'white' }} />
                <Checkbox.Label>Correct<VisuallyHidden>{` for question ${number}, option ${index + 1}`}</VisuallyHidden></Checkbox.Label>
              </Checkbox.Root>
              <IconButton type="button" variant="ghost" aria-label={`Remove question ${number}, option ${index + 1}`}
                onClick={() => onChange({ ...question, options: question.options.filter((item) => item.key !== option.key) })}>
                <IconTrash size={18} />
              </IconButton>
            </Flex>
          ))}
          <Button type="button" variant="ghost" size="sm" fontFamily="body" color="janeq.blue" alignSelf="start" onClick={onAddOption}>
            <IconListDetails size={18} /> Add answer option
          </Button>
        </Stack>
      </Grid>
    </Stack>
  )
}
