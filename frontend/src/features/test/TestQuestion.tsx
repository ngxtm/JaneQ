import { Badge, Box, Button, Checkbox, HStack, RadioGroup, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import {
  IconCircleCheckFilled, IconCircleXFilled, IconClock, IconPoint, IconPointFilled,
} from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import type { PropsWithChildren } from 'react'
import type { Question } from '../study-sets/question'
import type { QuestionReview } from './result-review'

const optionStyle = {
  alignItems: 'center', gap: '3', px: { base: '3', md: '5' }, py: '4', minH: '14',
  rounded: 'xl', borderWidth: '2px', borderStyle: 'solid', borderColor: 'janeq.divider', minW: '0',
} as const
const choiceStyle = {
  ...optionStyle, cursor: 'pointer',
  _hover: { bg: 'janeq.library' },
  _checked: { borderColor: 'janeq.focus', bg: 'blue.50' },
  _disabled: { cursor: 'default' },
  css: {
    '&:has(input:focus-visible)': { outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '2px' },
  },
} as const
const choiceGrid = { columns: { base: 1, sm: 2 }, gap: { base: '4', md: '6' } } as const
const choiceIndicator = {
  borderStyle: 'solid', flexShrink: '0', borderColor: 'janeq.muted',
  _checked: { borderColor: 'janeq.blue' },
} as const

export function TimelineGap({ children, answered, correct, timedOut }: PropsWithChildren<{
  answered?: boolean
  correct?: boolean
  timedOut?: boolean
}>) {
  const Marker = correct === undefined
    ? (answered ? IconPointFilled : IconPoint)
    : timedOut
    ? IconClock
    : (correct ? IconCircleCheckFilled : IconCircleXFilled)
  const color = correct === undefined ? 'gray.500' : (correct ? 'green.700' : timedOut ? 'orange.700' : 'red.700')
  return (
    <HStack minH="12" ps={{ base: '2', sm: '6', md: '8' }} gap="3" color={color}>
      <Box aria-hidden="true" position="relative" alignSelf="stretch" display="grid" placeItems="center" w="6">
        <Box position="absolute" insetBlock="0" w="2px" bg="janeq.divider" />
        <Box position="relative" bg="janeq.library" borderRadius="full"><Marker size={20} /></Box>
      </Box>
      <Text fontFamily="heading" fontSize="sm" fontWeight="semibold">{children}</Text>
    </HStack>
  )
}

function QuestionPanel({ question, index, total, answered, correct, timedOut, unanswered, capture, standalone, children }: PropsWithChildren<{
  question: Question
  index: number
  total: number
  answered?: boolean
  correct?: boolean
  timedOut?: boolean
  unanswered?: boolean
  capture?: boolean
  standalone?: boolean
}>) {
  const statusText = correct === undefined
    ? ''
    : correct
    ? ' · Correct'
    : timedOut
    ? ' · Time expired'
    : unanswered
    ? ' · Unanswered'
    : ' · Incorrect'
  const content = (
    <>
      {standalone ? null : (
        <TimelineGap answered={answered} correct={correct} timedOut={timedOut}>
          {index + 1} / {total}{statusText}
        </TimelineGap>
      )}
      <Stack as="section" aria-labelledby={`test-prompt-${index}`} bg="white" rounded="2xl" borderWidth="2px"
        borderStyle="solid" borderColor="janeq.divider" px={{ base: '5', sm: '6', md: '8' }} py={{ base: '5', md: '7' }} gap="6">
        <Box minH={standalone ? undefined : { base: '60px', md: '140px' }}>
          <HStack justify="space-between" align="center" mb="2">
            <Text fontSize="sm" fontWeight="semibold" color={standalone ? 'janeq.focus' : 'janeq.muted'}>
              {standalone ? `Question ${index + 1}` : 'Question'}
            </Text>
            {timedOut ? (
              <Badge colorPalette="orange" variant="subtle" size="sm">
                <IconClock size={14} aria-hidden="true" /> Time expired
              </Badge>
            ) : null}
          </HStack>
          <Text as="h2" id={`test-prompt-${index}`} tabIndex={standalone ? -1 : undefined} scrollMarginTop="4"
            fontSize={{ base: 'md', sm: 'lg', md: 'xl' }} fontWeight={standalone ? 'semibold' : 'normal'}
            whiteSpace="pre-wrap" overflowWrap="anywhere">{question.prompt}</Text>
        </Box>
        {children}
      </Stack>
    </>
  )
  return <Box as="li">{capture ? <Skeleton name="test-question" loading={false}>{content}</Skeleton> : content}</Box>
}

export function TestQuestion({ question, index, total, selected, disabled, standalone, onSelect }: {
  question: Question
  index: number
  total: number
  selected: string[]
  disabled: boolean
  standalone?: boolean
  onSelect: (selected: string[]) => void
}) {
  const label = `test-prompt-${index}`
  const hint = `test-choice-hint-${index}`
  return (
    <QuestionPanel question={question} index={index} total={total} answered={selected.length > 0}
      standalone={standalone} capture={!standalone && index === 0}>
      <Stack gap="2">
        <HStack justify="space-between" flexWrap="wrap" gap="2">
          <Text id={hint} fontSize="sm" fontWeight="semibold" color="janeq.muted">
            {question.multiple ? 'Select all that apply' : 'Select one answer'}
          </Text>
          {!question.multiple ? (
            <Button type="button" variant="ghost" size="sm" color="janeq.focus" fontFamily="body"
              focusVisibleRing="outside" focusRingColor="janeq.focus"
              disabled={disabled} aria-disabled={selected.length === 0 || undefined}
              onClick={() => { if (selected.length > 0) onSelect([]) }}>
              Clear answer
            </Button>
          ) : null}
        </HStack>
        {question.multiple ? (
          <SimpleGrid {...choiceGrid} role="group" aria-labelledby={label} aria-describedby={hint}>
            {question.options.map((option) => (
              <Checkbox.Root key={option.id} {...choiceStyle} value={option.id} checked={selected.includes(option.id)}
                disabled={disabled} colorPalette="blue" onCheckedChange={({ checked }) => {
                  onSelect(checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))
                }}>
                <Checkbox.HiddenInput />
                <Checkbox.Control {...choiceIndicator} />
                <Checkbox.Label fontSize="md" fontWeight="normal" whiteSpace="pre-wrap" overflowWrap="anywhere">
                  {option.text}
                </Checkbox.Label>
              </Checkbox.Root>
            ))}
          </SimpleGrid>
        ) : (
          <RadioGroup.Root name={`test-answer-${index}`} value={selected[0] ?? ''} disabled={disabled}
            aria-labelledby={label} aria-describedby={hint} colorPalette="blue"
            onValueChange={({ value }) => { if (value) onSelect([value]) }}>
            <SimpleGrid {...choiceGrid}>
              {question.options.map((option) => (
                <RadioGroup.Item key={option.id} value={option.id} {...choiceStyle}>
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator {...choiceIndicator} />
                  <RadioGroup.ItemText fontSize="md" fontWeight="normal" whiteSpace="pre-wrap" overflowWrap="anywhere">
                    {option.text}
                  </RadioGroup.ItemText>
                </RadioGroup.Item>
              ))}
            </SimpleGrid>
          </RadioGroup.Root>
        )}
      </Stack>
    </QuestionPanel>
  )
}

export function ReviewedQuestion({ question, index, total }: { question: QuestionReview; index: number; total: number }) {
  const timedOut = Boolean(question.timed_out)
  return (
    <QuestionPanel question={question} index={index} total={total} correct={question.correct} timedOut={timedOut}
      unanswered={question.unanswered}>
      <Stack gap="3">
        {timedOut ? (
          <Text fontSize="sm" color="orange.700" fontWeight="medium">
            Time expired · No answer was submitted
          </Text>
        ) : null}
        <SimpleGrid as="ul" {...choiceGrid} listStyleType="none" m="0" p="0">
          {question.options.map(({ id, text, selected, correct }) => {
            const color = correct ? 'green.800' : selected ? 'red.800' : 'janeq.ink'
            return (
              <HStack key={id} as="li" {...optionStyle} color={color}
                borderColor={correct ? 'green.200' : selected ? 'red.200' : 'janeq.divider'}
                bg={correct ? 'green.50' : selected ? 'red.50' : 'white'}>
                {correct ? <IconCircleCheckFilled size={18} aria-hidden="true" style={{ flexShrink: 0 }} /> : selected ? (
                  <IconCircleXFilled size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
                ) : null}
                <Stack gap="0.5" minW="0">
                  <Text whiteSpace="pre-wrap" overflowWrap="anywhere">{text}</Text>
                  {selected || correct ? (
                    <Text fontSize="xs" fontWeight="semibold">
                      {selected && correct ? 'Your answer · Correct answer' : selected ? 'Your answer' : 'Correct answer'}
                    </Text>
                  ) : null}
                </Stack>
              </HStack>
            )
          })}
        </SimpleGrid>
      </Stack>
    </QuestionPanel>
  )
}
