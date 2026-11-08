import { Box, Button, Flex, Heading, HStack, ProgressCircle, Stack, Text } from '@chakra-ui/react'
import { IconArrowLeft, IconCircleCheck, IconCircleX, IconDownload, IconRotateClockwise2 } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { studySetHref } from '../study-sets/library-navigation'
import type { TestResult } from './api'
import { ReviewedQuestion } from './TestQuestion'

function downloadResult(result: TestResult) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${result.set_id.replace(/[^a-zA-Z0-9_-]/g, '-')}-test-results.json`
  document.body.append(link)
  link.click()
  link.remove()
  // Leave the URL available until Chromium has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Results({ result, onRestart }: { result: TestResult; onRestart: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }, [])
  const percent = Math.round(result.score / result.total * 100)
  const multiple = result.questions.filter((question) => question.multiple)
  const multipleCorrect = multiple.filter((question) => question.correct).length

  return (
    <Stack gap="6">
      <Flex direction={{ base: 'column', sm: 'row' }} align={{ base: 'start', sm: 'center' }} justify="space-between" gap="4">
        <Box>
          <Text color="janeq.muted" fontSize="sm" fontWeight="semibold" overflowWrap="anywhere">{result.title}</Text>
          <Heading as="h1" ref={heading} tabIndex={-1} fontSize={{ base: '3xl', md: '4xl' }} _focus={{ outline: 'none' }}>
            Your results
          </Heading>
        </Box>
        <Flex wrap="wrap" gap="2">
          <PrimaryButton onClick={() => downloadResult(result)}><IconDownload size={18} aria-hidden="true" /> Export JSON</PrimaryButton>
          <Button variant="outline" color="janeq.focus" borderColor="janeq.line" _hover={{ bg: 'blue.50' }} onClick={onRestart}>
            <IconRotateClockwise2 size={18} aria-hidden="true" /> New test
          </Button>
          <Button variant="outline" borderColor="janeq.line" asChild>
            <a href={studySetHref(result.set_id)}><IconArrowLeft size={18} aria-hidden="true" /> Back</a>
          </Button>
        </Flex>
      </Flex>
      <Flex as="section" aria-label="Score summary" direction={{ base: 'column', md: 'row' }} gap="6"
        bg="white" rounded="3xl" borderWidth="2px" borderStyle="solid" borderColor="janeq.divider" shadow="xl"
        px={{ base: '5', sm: '8' }} py="6">
        <HStack gap="4">
          <ProgressCircle.Root value={percent} aria-label="Percentage correct" flexShrink="0">
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
        {result.questions.map((question, index) => (
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
