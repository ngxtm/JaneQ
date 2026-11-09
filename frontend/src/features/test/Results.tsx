import { Badge, Box, Button, Flex, Heading, HStack, ProgressCircle, Stack, Text } from '@chakra-ui/react'
import { IconArrowLeft, IconCircleCheck, IconCircleX, IconRotateClockwise2 } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { studySetHref } from '../navigation/app-location'
import type { TestResult } from './api'
import { DownloadResultButton } from './DownloadResultButton'
import { reviewResult } from './result-review'
import { ReviewedQuestion } from './TestQuestion'

export function Results({
  result,
  onRestart,
  backHref = studySetHref(result.set_id),
  backLabel,
  onSessionExpired,
}: {
  result: TestResult
  onRestart?: () => void
  backHref?: string
  backLabel?: string
  onSessionExpired: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [downloadError, setDownloadError] = useState('')
  useEffect(() => {
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }, [])
  const review = reviewResult(result)
  const multiple = result.questions.filter((question) => question.multiple)
  const multipleCorrect = multiple.filter((question) => question.correct).length

  return (
    <Stack gap="6">
      <Flex direction={{ base: 'column', sm: 'row' }} align={{ base: 'start', sm: 'center' }} justify="space-between" gap="4">
        <Box>
          <HStack gap="2" align="center" mb="1" flexWrap="wrap">
            <Text color="janeq.muted" fontSize="sm" fontWeight="semibold" overflowWrap="anywhere">{result.title}</Text>
            <Text color="janeq.muted" fontSize="sm" aria-hidden="true">·</Text>
            {result.mode === 'timed' ? (
              <Badge colorPalette="orange" variant="subtle" size="sm">
                Timed Test{result.time_per_question ? ` · ${result.time_per_question}s / question` : ''}
              </Badge>
            ) : (
              <Badge variant="outline" size="sm" color="janeq.muted">Standard Test</Badge>
            )}
          </HStack>
          <Heading as="h1" ref={heading} tabIndex={-1} fontSize={{ base: '3xl', md: '4xl' }} _focus={{ outline: 'none' }}>
            Your results
          </Heading>
        </Box>
        <Flex wrap="wrap" gap="2">
          <DownloadResultButton result={review} onError={setDownloadError} onSessionExpired={onSessionExpired} />
          {onRestart ? (
            <Button variant="outline" color="janeq.focus" borderColor="janeq.line" _hover={{ bg: 'blue.50' }} onClick={onRestart}>
              <IconRotateClockwise2 size={18} aria-hidden="true" /> New test
            </Button>
          ) : null}
          <Button variant="outline" borderColor="janeq.line" asChild>
            <a href={backHref}><IconArrowLeft size={18} aria-hidden="true" /> {backLabel ?? 'Back'}</a>
          </Button>
        </Flex>
      </Flex>
      {downloadError ? <Text role="alert" color="red.700">{downloadError}</Text> : null}
      <Flex as="section" aria-label="Score summary" direction={{ base: 'column', md: 'row' }} gap="6"
        bg="white" rounded="3xl" borderWidth="2px" borderStyle="solid" borderColor="janeq.divider" shadow="xl"
        px={{ base: '5', sm: '8' }} py="6">
        <HStack gap="4">
          <ProgressCircle.Root value={review.percent} aria-label="Percentage correct" flexShrink="0">
            <ProgressCircle.Circle css={{ '--size': { base: '100px', sm: '140px' }, '--thickness': '4px' }}>
              <ProgressCircle.Track stroke="janeq.divider" />
              <ProgressCircle.Range stroke="#4b83ff" strokeLinecap="round" _motionReduce={{ transition: 'none' }} />
            </ProgressCircle.Circle>
            <ProgressCircle.ValueText position="absolute" inset="0" display="grid" placeItems="center"
              fontFamily="heading" fontWeight="bold" fontSize="xl" />
          </ProgressCircle.Root>
          <Stack gap="1">
            <Heading as="h2" fontSize="2xl">{result.score} / {result.total}</Heading>
            <HStack><Box color="janeq.focus"><IconCircleCheck size={20} aria-hidden="true" /></Box><Text>{result.score} correct</Text></HStack>
            <HStack><Box color="janeq.muted"><IconCircleX size={20} aria-hidden="true" /></Box><Text>{result.total - result.score} incorrect</Text></HStack>
          </Stack>
        </HStack>
        <Stack gap="2" borderStyle="solid" borderWidth="0" borderColor="janeq.divider" borderTopWidth={{ base: '2px', md: '0' }}
          borderStartWidth={{ base: '0', md: '2px' }} pt={{ base: '4', md: '0' }} ps={{ base: '0', md: '6' }} justify="center">
          <Heading as="h2" fontSize="lg">By question type</Heading>
          {result.total > multiple.length ? (
            <Text>Single choice · {result.score - multipleCorrect} / {result.total - multiple.length}</Text>
          ) : null}
          {multiple.length ? <Text>Multiple select · {multipleCorrect} / {multiple.length}</Text> : null}
        </Stack>
      </Flex>
      <Box as="ol" role="list" listStyleType="none" m="0" p="0" aria-label="Question review">
        {review.questions.map((question, index) => (
          <ReviewedQuestion key={question.id} question={question} index={index} total={result.total} />
        ))}
      </Box>
      <Button alignSelf="center" variant="ghost" onClick={() => {
        window.scrollTo(0, 0)
        heading.current?.focus({ preventScroll: true })
      }}>Back to top</Button>
    </Stack>
  )
}
