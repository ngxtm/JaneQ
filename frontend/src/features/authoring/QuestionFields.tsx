import { Button, Checkbox, Field, Flex, Grid, Heading, HStack, IconButton, Input, Menu, Portal, Stack, Text, Textarea, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowDown, IconArrowUp, IconGripHorizontal, IconListDetails, IconTrash } from '@tabler/icons-react'
import type { OptionContent } from './api'
import type { questionErrors } from './validation'

export type OptionField = OptionContent & { key: string }
export type QuestionField = { key: string; prompt: string; options: OptionField[] }

type QuestionFieldsProps = {
  question: QuestionField
  number: number
  count: number
  focusKey: string | undefined
  errors?: ReturnType<typeof questionErrors>
  onChange: (question: QuestionField) => void
  onAddOption: () => void
  onRemove: () => void
  onMove: (key: string, destination: number) => void
}

const questionDragType = 'application/x-janeq-question'

export function QuestionFields({ question, number, count, focusKey, errors, onChange, onAddOption, onRemove, onMove }: QuestionFieldsProps) {
  const headingId = `question-${question.key}`
  const answerErrorId = `${headingId}-answer-error`
  const optionsErrorId = `${headingId}-options-error`

  function updateOption(key: string, update: Partial<OptionContent>) {
    onChange({ ...question, options: question.options.map((option) => option.key === key ? { ...option, ...update } : option) })
  }

  return (
    <Stack as="section" id={`${headingId}-card`} aria-labelledby={headingId} bg="white" rounded="xl" border="2px solid"
      borderColor={errors ? 'red.600' : 'janeq.canvas'} shadow="sm" gap="0"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(questionDragType)) event.preventDefault()
      }} onDrop={(event) => {
        const key = event.dataTransfer.getData(questionDragType)
        if (!key) return
        event.preventDefault()
        onMove(key, number - 1)
      }}>
      <Flex align="center" justify="space-between" gap="4" px="5" py="2" borderBottom="2px solid" borderColor="janeq.canvas">
        <Heading as="h3" id={headingId} size="md"><VisuallyHidden>Question </VisuallyHidden>{number}</Heading>
        <HStack gap="1">
          <Menu.Root positioning={{ placement: 'bottom-end' }}>
            <Menu.Trigger asChild>
              <IconButton type="button" variant="ghost" size="sm" color="janeq.blue" aria-label={`Reorder question ${number}`}
                disabled={count < 2} draggable={count > 1} onDragStart={(event) => {
                  event.dataTransfer.setData(questionDragType, question.key)
                  event.dataTransfer.effectAllowed = 'move'
                }}>
                <IconGripHorizontal size={18} />
              </IconButton>
            </Menu.Trigger>
            <Portal><Menu.Positioner><Menu.Content fontFamily="body">
              <Menu.Item value="up" disabled={number === 1} onSelect={() => onMove(question.key, number - 2)}><IconArrowUp size={16} /> Move up</Menu.Item>
              <Menu.Item value="down" disabled={number === count} onSelect={() => onMove(question.key, number)}><IconArrowDown size={16} /> Move down</Menu.Item>
            </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
          <IconButton type="button" variant="ghost" size="sm" color="janeq.muted" aria-label={`Remove question ${number}`} onClick={onRemove}>
            <IconTrash size={18} />
          </IconButton>
        </HStack>
      </Flex>
      <Grid templateColumns={{ base: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }} gap="6" p="5">
        <Field.Root invalid={errors?.missingPrompt}>
          <Textarea value={question.prompt} autoFocus={focusKey === question.key} resize="vertical"
            variant="flushed" borderColor={errors?.missingPrompt ? 'red.600' : 'janeq.line'}
            onChange={(event) => onChange({ ...question, prompt: event.target.value })}
            rows={2} placeholder="Enter a question" />
          <Field.Label color="janeq.muted" fontSize="sm">Question<VisuallyHidden>{` ${number} prompt`}</VisuallyHidden></Field.Label>
          {errors?.missingPrompt ? <Field.ErrorText>Enter the question prompt.</Field.ErrorText> : null}
        </Field.Root>
        <Stack gap="3">
          <Text fontSize="sm" fontWeight="medium">Answer options</Text>
          {question.options.map((option, index) => (
            <Flex key={option.key} gap="2" align="end" flexWrap="wrap">
              <Field.Root flex="1" minW="28" invalid={errors?.blankOptions.has(option.key)}>
                <VisuallyHidden asChild><Field.Label>Question {number}, option {index + 1}</Field.Label></VisuallyHidden>
                <Input value={option.text} autoFocus={focusKey === option.key} placeholder={`Option ${index + 1}`}
                  variant="flushed" borderColor={errors?.blankOptions.has(option.key) ? 'red.600' : 'janeq.line'} onChange={(event) => {
                  const text = event.target.value
                  updateOption(option.key, { text, is_correct: Boolean(text.trim()) && option.is_correct })
                }} />
                {errors?.blankOptions.has(option.key) ? <Field.ErrorText>Enter an option or remove this row.</Field.ErrorText> : null}
              </Field.Root>
              <Checkbox.Root checked={option.is_correct} disabled={!option.text.trim()} minH="10" colorPalette="blue"
                css={{ '&:has(input:focus-visible) [data-part=control]': { outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '2px' } }}
                onCheckedChange={({ checked }) => updateOption(option.key, { is_correct: checked === true })}>
                <Checkbox.HiddenInput aria-describedby={errors?.missingAnswer ? answerErrorId : undefined}
                  data-validation-focus={errors?.missingAnswer && !errors.missingOptions && option.text.trim() ? '' : undefined} />
                <Checkbox.Control borderStyle="solid" borderColor={errors?.missingAnswer ? 'red.600' : 'janeq.muted'}
                  _checked={{ bg: 'janeq.blue', borderColor: 'janeq.blue', color: 'white' }} />
                <Checkbox.Label>Correct<VisuallyHidden>{` for question ${number}, option ${index + 1}`}</VisuallyHidden></Checkbox.Label>
              </Checkbox.Root>
              <IconButton type="button" variant="ghost" aria-label={`Remove question ${number}, option ${index + 1}`}
                onClick={() => onChange({ ...question, options: question.options.filter((item) => item.key !== option.key) })}>
                <IconTrash size={18} />
              </IconButton>
            </Flex>
          ))}
          {errors?.missingOptions ? <Text id={optionsErrorId} fontSize="sm" color="red.700">Enter at least two answer options.</Text> : null}
          {errors?.missingAnswer ? <Text id={answerErrorId} fontSize="sm" color="red.700">Mark at least one option correct.</Text> : null}
          <Button type="button" variant="ghost" size="sm" fontFamily="body" color="janeq.blue" alignSelf="start" onClick={onAddOption}
            aria-describedby={errors?.missingOptions ? optionsErrorId : undefined} data-validation-focus={errors?.missingOptions ? '' : undefined}>
            <IconListDetails size={18} /> Add answer option
          </Button>
        </Stack>
      </Grid>
    </Stack>
  )
}
