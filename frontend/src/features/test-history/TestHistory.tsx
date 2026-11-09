import {
  Box, Button, Center, Flex, Heading, HStack, Link, Stack, Table, Text, VisuallyHidden,
} from '@chakra-ui/react'
import { IconArrowLeft, IconArrowRight, IconHistory, IconReportOff } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef, useState } from 'react'
import { httpErrorMessage, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { historyResultHref, homeHref } from '../navigation/app-location'
import type { TestAttemptSummary } from '../test/api'
import { listTestAttempts } from './api'
import { formatAttemptScore, formatAttemptTime } from './attempt-format'
import { AttemptModeBadge } from './AttemptModeBadge'
import historyBones from './bones/test-history.bones.json'

type TestHistoryState =
  | { kind: 'loading'; showSkeleton: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; attempts: TestAttemptSummary[]; nextBefore: string | null }

export default function TestHistory({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [state, setState] = useState<TestHistoryState>({ kind: 'loading', showSkeleton: false })
  const [reloadKey, setReloadKey] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState('')
  const pageRequest = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setState((prev) => (prev.kind === 'loading' ? { kind: 'loading', showSkeleton: true } : prev))
    }, 200)

    listTestAttempts(controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'loaded', attempts: page.attempts, nextBefore: page.next_before })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isUnauthorized(error)) {
          onSessionExpired()
        } else {
          setState({
            kind: 'error',
            message: httpErrorMessage(error, 'Could not load test history. Please try again.'),
          })
        }
      })
      .finally(() => window.clearTimeout(timer))

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [reloadKey, onSessionExpired])

  useEffect(() => () => pageRequest.current?.abort(), [])

  function handleRetry() {
    setState({ kind: 'loading', showSkeleton: false })
    setReloadKey((k) => k + 1)
  }

  async function handleLoadMore() {
    if (state.kind !== 'loaded' || !state.nextBefore || pageRequest.current) return

    const controller = new AbortController()
    pageRequest.current = controller
    setLoadingMore(true)
    try {
      const page = await listTestAttempts(controller.signal, { before: state.nextBefore })
      if (!controller.signal.aborted) {
        setPageError('')
        setState({
          kind: 'loaded',
          attempts: [...state.attempts, ...page.attempts],
          nextBefore: page.next_before,
        })
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) {
        onSessionExpired()
      } else {
        setPageError('Could not load more attempts.')
      }
    } finally {
      pageRequest.current = null
      if (!controller.signal.aborted) {
        setLoadingMore(false)
      }
    }
  }

  const isLoading = state.kind === 'loading'
  const isError = state.kind === 'error'
  const isLoaded = state.kind === 'loaded'
  const isEmpty = isLoaded && state.attempts.length === 0

  return (
    <Stack gap="6" maxW="5xl" mx="auto">
      <Flex direction={{ base: 'column-reverse', sm: 'row' }} justify="space-between" align={{ base: 'start', sm: 'center' }} gap="3">
        <Box>
          <Heading as="h1" ref={heading} tabIndex={-1} fontSize={{ base: '3xl', md: '4xl' }} _focus={{ outline: 'none' }}>
            Test History
          </Heading>
          <Text color="janeq.muted" mt="1">
            Review past test attempts and your scores over time.
          </Text>
        </Box>
        <Button asChild variant="ghost" color="janeq.muted">
          <a href={homeHref}>
            <IconArrowLeft size={18} aria-hidden="true" /> Back to Home
          </a>
        </Button>
      </Flex>

      {isLoading ? (
        <Box aria-busy="true">
          <VisuallyHidden role="status">Loading test history…</VisuallyHidden>
          {state.showSkeleton ? (
            <Box aria-hidden="true">
              <Skeleton initialBones={historyBones} select="viewport" loading animate="solid"
                color="var(--chakra-colors-janeq-divider)">{null}</Skeleton>
            </Box>
          ) : null}
        </Box>
      ) : null}

      {isError ? (
        <Flex align="start" gap="4" bg="white" borderWidth="2px" borderStyle="solid" borderColor="janeq.divider"
          rounded="2xl" p={{ base: '4', md: '6' }}>
          <Box display="grid" placeItems="center" bg="janeq.library" color="red.600" rounded="xl" boxSize="10" flexShrink="0">
            <IconReportOff size={22} aria-hidden="true" />
          </Box>
          <Stack gap="3" align="start">
            <Box role="alert">
              <Heading as="h2" fontSize="lg">Could not load test history</Heading>
              <Text color="janeq.muted">{state.message}</Text>
            </Box>
            <Button variant="outline" onClick={handleRetry}>Try again</Button>
          </Stack>
        </Flex>
      ) : null}

      {isEmpty ? (
        <Center p={{ base: '8', md: '14' }} rounded="2xl" bg="white" borderWidth="2px" borderStyle="solid" borderColor="janeq.divider">
          <Stack align="center" textAlign="center" gap="4" maxW="md">
            <Box display="grid" placeItems="center" bg="blue.50" color="janeq.blue" rounded="full" boxSize="16">
              <IconHistory size={32} aria-hidden="true" />
            </Box>
            <Stack gap="1">
              <Heading as="h2" fontSize="xl">No test attempts yet</Heading>
              <Text color="janeq.muted" fontSize="sm">
                Complete a Test to see your history.
              </Text>
            </Stack>
            <PrimaryButton asChild mt="2">
              <a href={homeHref}>
                Back to Home
              </a>
            </PrimaryButton>
          </Stack>
        </Center>
      ) : null}

      {isLoaded && !isEmpty ? (
        <Box data-history-list>
          <Box hideBelow="md" bg="white" rounded="2xl" borderWidth="1px" borderColor="janeq.divider" overflow="hidden" shadow="sm">
            <Table.Root variant="outline" size="md">
              <Table.Header>
                <Table.Row bg="janeq.library">
                  <Table.ColumnHeader py="3.5" px="5" fontWeight="semibold">Study Set</Table.ColumnHeader>
                  <Table.ColumnHeader py="3.5" px="4" fontWeight="semibold">Mode</Table.ColumnHeader>
                  <Table.ColumnHeader py="3.5" px="4" fontWeight="semibold">Score</Table.ColumnHeader>
                  <Table.ColumnHeader py="3.5" px="4" fontWeight="semibold">Submitted</Table.ColumnHeader>
                  <Table.ColumnHeader py="3.5" px="5" textAlign="end" fontWeight="semibold">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {state.attempts.map((attempt) => (
                  <Table.Row key={attempt.attempt_id} _hover={{ bg: 'janeq.library' }} transition="background 120ms ease"
                    _motionReduce={{ transition: 'none' }}>
                    <Table.Cell py="4" px="5" fontWeight="semibold" color="janeq.ink" maxW="300px" overflowWrap="anywhere">
                      {attempt.title}
                    </Table.Cell>
                    <Table.Cell py="4" px="4">
                      <AttemptModeBadge mode={attempt.mode} time_per_question={attempt.time_per_question} />
                    </Table.Cell>
                    <Table.Cell py="4" px="4" fontWeight="medium">
                      {formatAttemptScore(attempt)}
                    </Table.Cell>
                    <Table.Cell py="4" px="4" color="janeq.muted" fontSize="sm">
                      <time dateTime={attempt.submitted_at}>{formatAttemptTime(attempt.submitted_at)}</time>
                    </Table.Cell>
                    <Table.Cell py="4" px="5" textAlign="end">
                      <Button asChild variant="ghost" size="sm" color="janeq.blue" _hover={{ bg: 'blue.50' }}
                        focusVisibleRing="outside" focusRingColor="janeq.focus">
                        <a href={historyResultHref(attempt.attempt_id)} aria-label={`View results for ${attempt.title}`}>
                          View results <IconArrowRight size={16} aria-hidden="true" />
                        </a>
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>

          <Stack hideFrom="md" gap="3">
            {state.attempts.map((attempt) => (
              <Link
                key={attempt.attempt_id}
                href={historyResultHref(attempt.attempt_id)}
                display="block"
                p="4"
                bg="white"
                rounded="xl"
                borderWidth="1px"
                borderColor="janeq.divider"
                shadow="sm"
                _hover={{ borderColor: 'janeq.focus', textDecoration: 'none' }}
                focusVisibleRing="outside"
                focusRingColor="janeq.focus"
              >
                <Flex justify="space-between" align="start" gap="2" mb="2">
                  <Heading as="h2" fontSize="md" fontWeight="bold" overflowWrap="anywhere">
                    {attempt.title}
                  </Heading>
                  <AttemptModeBadge mode={attempt.mode} time_per_question={attempt.time_per_question} />
                </Flex>
                <HStack justify="space-between" align="center" fontSize="sm" mt="3" pt="2" borderTopWidth="1px" borderColor="gray.100">
                  <Text fontWeight="semibold" color="janeq.ink">
                    {formatAttemptScore(attempt)}
                  </Text>
                  <Text asChild color="janeq.muted">
                    <time dateTime={attempt.submitted_at}>{formatAttemptTime(attempt.submitted_at)}</time>
                  </Text>
                </HStack>
                <HStack justify="end" mt="2" color="janeq.blue" fontSize="sm" fontWeight="semibold" gap="1">
                  <Text>View results</Text><IconArrowRight size={14} aria-hidden="true" />
                </HStack>
              </Link>
            ))}
          </Stack>

          {state.nextBefore ? (
            <Stack align="center" gap="2" pt="4">
              {pageError ? <Text role="alert" color="red.700" fontSize="sm">{pageError}</Text> : null}
              <Button
                variant="outline"
                borderColor="janeq.line"
                loading={loadingMore}
                loadingText={pageError ? 'Try again' : 'Load more'}
                onClick={handleLoadMore}
              >
                {pageError ? 'Try again' : 'Load more'}
              </Button>
            </Stack>
          ) : null}
        </Box>
      ) : null}
    </Stack>
  )
}
