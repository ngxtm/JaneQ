import { Box, Button, Flex, Heading, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft, IconReportOff } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef, useState } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { historyHref } from '../navigation/app-location'
import type { TestResult } from '../test/api'
import { Results } from '../test/Results'
import { getTestAttempt } from './api'
import scoreBones from './bones/history-score.bones.json'

type HistoryResultsView =
  | { kind: 'loading'; showSkeleton: boolean }
  | { kind: 'error'; notFound: boolean; message: string }
  | { kind: 'result'; result: TestResult }

export default function HistoryResults({
  attemptId,
  onSessionExpired,
}: {
  attemptId: string
  onSessionExpired: () => void
}) {
  const [view, setView] = useState<HistoryResultsView>({ kind: 'loading', showSkeleton: false })
  const [reloadKey, setReloadKey] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setView((prev) => (prev.kind === 'loading' ? { kind: 'loading', showSkeleton: true } : prev))
    }, 200)

    getTestAttempt(attemptId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setView({ kind: 'result', result })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isUnauthorized(error)) {
          onSessionExpired()
        } else if (httpStatus(error) === 404) {
          setView({
            kind: 'error',
            notFound: true,
            message: 'Result not found or not accessible',
          })
        } else {
          setView({
            kind: 'error',
            notFound: false,
            message: httpErrorMessage(error, 'Could not load test result. Please try again.'),
          })
        }
      })
      .finally(() => window.clearTimeout(timer))

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [attemptId, reloadKey, onSessionExpired])

  function handleRetry() {
    setView({ kind: 'loading', showSkeleton: false })
    setReloadKey((k) => k + 1)
  }

  if (view.kind === 'result') {
    return (
      <Box maxW="4xl" mx="auto">
        <Results result={view.result} backHref={historyHref} backLabel="Back to History" onSessionExpired={onSessionExpired} />
      </Box>
    )
  }

  return (
    <Box maxW="4xl" mx="auto">
      <Stack gap="6">
        <Flex justify="space-between" align="center" flexWrap="wrap" gap="3">
          <Heading as="h1" ref={heading} tabIndex={-1} fontSize={{ base: '2xl', md: '3xl' }} _focus={{ outline: 'none' }}>
            Test Result
          </Heading>
          <Button asChild variant="ghost" color="janeq.muted">
            <a href={historyHref}><IconArrowLeft size={18} aria-hidden="true" /> Back to History</a>
          </Button>
        </Flex>

        {view.kind === 'loading' ? (
          <Box aria-busy="true">
            <VisuallyHidden role="status">Loading test result…</VisuallyHidden>
            {view.showSkeleton ? (
              <Box aria-hidden="true">
                <Skeleton initialBones={scoreBones} select="viewport" loading animate="solid"
                  color="var(--chakra-colors-janeq-divider)">{null}</Skeleton>
              </Box>
            ) : null}
          </Box>
        ) : null}

        {view.kind === 'error' ? (
          <Flex align="start" gap="4" bg="white" borderWidth="2px" borderStyle="solid" borderColor="janeq.divider"
            rounded="2xl" p={{ base: '4', md: '6' }}>
            <Box display="grid" placeItems="center" bg="janeq.library" color="red.600" rounded="xl" boxSize="10" flexShrink="0">
              <IconReportOff size={22} aria-hidden="true" />
            </Box>
            <Stack gap="3" align="start">
              <Box role="alert">
                <Heading as="h2" fontSize="lg">
                  {view.notFound ? 'Result not found' : 'Could not load result'}
                </Heading>
                <Text color="janeq.muted">{view.message}</Text>
              </Box>
              {!view.notFound ? <Button variant="outline" onClick={handleRetry}>Try again</Button> : null}
            </Stack>
          </Flex>
        ) : null}
      </Stack>
    </Box>
  )
}
