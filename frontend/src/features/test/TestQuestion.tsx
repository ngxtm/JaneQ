import { Box, Checkbox, HStack, RadioGroup, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import {
  IconCircleCheckFilled, IconCircleXFilled, IconPoint, IconPointFilled,
} from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import type { PropsWithChildren } from 'react'
import type { Question } from '../study-sets/question'
import type { GradedQuestion } from './api'

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

export function TimelineGap({ children, answered, correct }: PropsWithChildren<{ answered?: boolean; correct?: boolean }>) {
  const Marker = correct === undefined
    ? (answered ? IconPointFilled : IconPoint)
    : (correct ? IconCircleCheckFilled : IconCircleXFilled)
  const color = correct === undefined ? 'gray.500' : (correct ? 'green.700' : 'red.700')
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

function QuestionPanel({ question, index, total, answered, correct, capture, children }: PropsWithChildren<{
  question: Question
  index: number
  total: number
  answered?: boolean
  correct?: boolean
  capture?: boolean
}>) {
  const content = (
    <>
      <TimelineGap answered={answered} correct={correct}>
        {index + 1} / {total}{correct === undefined ? '' : correct ? ' · Correct' : ' · Incorrect'}
      </TimelineGap>
      <Stack as="section" aria-labelledby={`test-prompt-${index}`} bg="white" rounded="2xl" borderWidth="2px"
        borderStyle="solid" borderColor="janeq.divider" px={{ base: '5', sm: '6', md: '8' }} py={{ base: '5', md: '7' }} gap="6">
        <Box minH={{ base: '60px', md: '140px' }}>
          <Text fontSize="sm" fontWeight="semibold" color="janeq.muted" mb="2">Question</Text>
          <Text as="h2" id={`test-prompt-${index}`} fontSize={{ base: 'md', sm: 'lg', md: 'xl' }} fontWeight="normal"
            whiteSpace="pre-wrap" overflowWrap="anywhere">{question.prompt}</Text>
        </Box>
        {children}
      </Stack>
    </>
  )
  return <Box as="li">{capture ? <Skeleton name="test-question" loading={false}>{content}</Skeleton> : content}</Box>
}

export function TestQuestion({ question, index, total, selected, disabled, onSelect }: {
  question: Question
  index: number
  total: number
  selected: string[]
  disabled: boolean
  onSelect: (selected: string[]) => void
}) {
  const label = `test-prompt-${index}`
  const hint = `test-choice-hint-${index}`
  return (
    <QuestionPanel question={question} index={index} total={total} answered={selected.length > 0} capture={index === 0}>
      <Stack gap="2">
        <Text id={hint} fontSize="sm" fontWeight="semibold" color="janeq.muted">
          {question.multiple ? 'Select all that apply' : 'Select one answer'}
        </Text>
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

export function ReviewedQuestion({ question, index, total }: { question: GradedQuestion; index: number; total: number }) {
  return (
    <QuestionPanel question={question} index={index} total={total} correct={question.correct}>
      <SimpleGrid as="ul" {...choiceGrid} listStyleType="none" m="0" p="0">
        {question.options.map((option) => {
          const selected = question.selected_ids.includes(option.id)
          const correct = question.correct_ids.includes(option.id)
          const color = correct ? 'green.800' : selected ? 'red.800' : 'janeq.ink'
          return (
            <HStack key={option.id} as="li" {...optionStyle} color={color}
              borderColor={correct ? 'green.200' : selected ? 'red.200' : 'janeq.divider'}
              bg={correct ? 'green.50' : selected ? 'red.50' : 'white'}>
              {correct ? <IconCircleCheckFilled size={18} aria-hidden="true" style={{ flexShrink: 0 }} /> : selected ? (
                <IconCircleXFilled size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
              ) : null}
              <Stack gap="0.5" minW="0">
                <Text whiteSpace="pre-wrap" overflowWrap="anywhere">{option.text}</Text>
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
    </QuestionPanel>
  )
}
