import { Box, Button, Heading, HStack, Progress, Stack, Text } from '@chakra-ui/react'
import { IconListNumbers } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import type { Question } from '../study-sets/question'

type QuestionNavigatorProps = {
  questions: Question[]
  selections: ReadonlyMap<string, string[]>
  activeIndex: number
  onNavigate: (index: number) => void
}

export function QuestionNavigator({ questions, selections, activeIndex, onNavigate }: QuestionNavigatorProps) {
  const answeredCount = selections.size
  const grid = useRef<HTMLDivElement>(null)
  const activeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!grid.current || !activeButton.current) return
    const viewport = grid.current.getBoundingClientRect()
    const item = activeButton.current.getBoundingClientRect()
    if (item.top < viewport.top) grid.current.scrollTop += item.top - viewport.top - 4
    if (item.bottom > viewport.bottom) grid.current.scrollTop += item.bottom - viewport.bottom + 4
  }, [activeIndex])

  return (
    <Stack as="nav" aria-labelledby="test-navigator-title" bg="white" border="1px solid" borderColor="janeq.divider"
      rounded="2xl" p={{ base: '3', sm: '4' }} gap="3" minW="0">
      <HStack justify="space-between" flexWrap="wrap" gap="2">
        <HStack gap="2" color="janeq.focus">
          <IconListNumbers size={19} aria-hidden="true" />
          <Heading as="h2" id="test-navigator-title" color="janeq.ink" fontSize="lg">Questions</Heading>
        </HStack>
        <Text role="status" fontSize="sm" color="janeq.muted" fontWeight="semibold" fontVariantNumeric="tabular-nums">
          {answeredCount}/{questions.length} answered
        </Text>
      </HStack>
      <Progress.Root value={answeredCount} max={questions.length} size="xs" aria-label="Questions answered">
        <Progress.Track bg="janeq.divider" rounded="full">
          <Progress.Range bg="janeq.blue" _motionReduce={{ transition: 'none' }} />
        </Progress.Track>
      </Progress.Root>
      <Box ref={grid} display="grid" gridTemplateColumns="repeat(auto-fill, minmax(2.5rem, 1fr))" gap="2"
        overflowY="auto" maxH={{ base: '6.5rem', lg: '16rem' }} p="1" m="-1">
        {questions.map((question, index) => {
          const answered = selections.has(question.id)
          const current = index === activeIndex
          return (
            <Button key={question.id} ref={current ? activeButton : undefined} variant="outline" px="1" minW="0" h="10"
              rounded="lg" fontFamily="body" color={answered ? 'white' : 'janeq.muted'}
              bg={answered ? 'janeq.blue' : 'white'} borderColor={answered ? 'janeq.blue' : 'janeq.line'}
              boxShadow={current ? '0 0 0 2px white, 0 0 0 4px var(--chakra-colors-janeq-focus)' : undefined}
              _hover={{ bg: answered ? 'janeq.blueHover' : 'blue.50', borderColor: 'janeq.focus' }}
              _motionReduce={{ transition: 'none' }}
              focusVisibleRing="outside" focusRingColor="janeq.focus"
              aria-current={current ? 'step' : undefined}
              aria-label={`Question ${index + 1}, ${answered ? 'answered' : 'unanswered'}`}
              onClick={() => onNavigate(index)}>
              {index + 1}
            </Button>
          )
        })}
      </Box>
      <HStack gapX="3" gapY="1" color="janeq.muted" fontSize="xs" flexWrap="wrap">
        <HStack gap="1"><Box boxSize="2" border="2px solid" borderColor="janeq.focus" rounded="full" /> Current</HStack>
        <HStack gap="1"><Box boxSize="2" bg="janeq.blue" rounded="full" /> Answered</HStack>
        <HStack gap="1"><Box boxSize="2" border="1px solid" borderColor="janeq.line" rounded="full" /> Unanswered</HStack>
      </HStack>
    </Stack>
  )
}
