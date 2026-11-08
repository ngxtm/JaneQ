import { Box, Button, Flex, Heading, HStack, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft, IconCircleCheckFilled, IconReportOff } from '@tabler/icons-react'
import { registerBones } from 'boneyard-js'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import type { StudySet } from '../study-sets/api'
import { studySetHref } from '../study-sets/library-navigation'
import { getTest, submitTest, testConflict, type TestPaper, type TestResult } from './api'
import questionBones from './bones/test-question.bones.json'
import { draftTestMessage } from './copy'
import { Results } from './Results'
import { TestQuestion } from './TestQuestion'

registerBones({ 'test-question': questionBones })

type Issue = { title: string; message: string; action?: 'retry' | 'new' }
type View =
  | { kind: 'loading'; showSkeleton: boolean }
  | { kind: 'error'; issue: Issue }
  | { kind: 'paper'; paper: TestPaper }
  | { kind: 'results'; result: TestResult }

function loadIssue(error: unknown): Issue {
  const conflict = testConflict(error)
  if (conflict?.code === 'draft') {
    return { title: 'This set is a draft', message: draftTestMessage(conflict.remaining_questions) }
  }
  if (httpStatus(error) === 404) {
    return { title: 'Study set unavailable', message: 'This study set could not be found.' }
  }
  return { title: 'Could not load the test', message: 'Check your connection and try again.', action: 'retry' }
}

function submitIssue(error: unknown): Issue {
  const conflict = testConflict(error)
  if (conflict?.code === 'draft') return loadIssue(error)
  if (conflict?.code === 'revision_changed') {
    return { title: 'This study set has changed', message: 'Open a new test to answer the updated questions.', action: 'new' }
  }
  if (httpStatus(error) === 404) return loadIssue(error)
  return {
    title: 'Could not submit the test',
    message: httpErrorMessage(error, 'Your choices are still here. Check your connection and try again.'),
    action: 'retry',
  }
}

function TestNotice({ issue, onAction }: { issue: Issue; onAction?: () => void }) {
  return (
    <Flex align="start" gap="4" bg="white" borderWidth="2px" borderStyle="solid" borderColor="janeq.divider"
      rounded="2xl" p={{ base: '4', md: '6' }}>
      <Box display="grid" placeItems="center" bg="janeq.library" color="janeq.muted" rounded="xl" boxSize="10" flexShrink="0">
        <IconReportOff size={22} aria-hidden="true" />
      </Box>
      <Stack gap="3" align="start">
        <Box role="alert">
          <Heading as="h2" fontSize="lg">{issue.title}</Heading>
          <Text color="janeq.muted">{issue.message}</Text>
        </Box>
        {onAction ? (
          <Button variant="outline" onClick={onAction}>{issue.action === 'new' ? 'Open a new test' : 'Try again'}</Button>
        ) : null}
      </Stack>
    </Flex>
  )
}

export default function Test({ set, onSessionExpired }: { set: StudySet; onSessionExpired: () => void }) {
  const [view, setView] = useState<View>({ kind: 'loading', showSkeleton: false })
  const [attempt, setAttempt] = useState(0)
  const [selections, setSelections] = useState(() => new Map<string, string[]>())
  const [submitting, setSubmitting] = useState(false)
  const [issue, setIssue] = useState<Issue>()
  const submission = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const showingResults = view.kind === 'results'

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => setView({ kind: 'loading', showSkeleton: true }), 200)
    getTest(set.id, controller.signal).then((paper) => {
      if (!controller.signal.aborted) setView({ kind: 'paper', paper })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) onSessionExpired()
      else setView({ kind: 'error', issue: loadIssue(error) })
    }).finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [attempt, onSessionExpired, set.id])

  useEffect(() => {
    if (!showingResults) heading.current?.focus({ preventScroll: true })
  }, [showingResults])

  useEffect(() => () => submission.current?.abort(), [])

  function restart() {
    setSelections(new Map())
    setIssue(undefined)
    setView({ kind: 'loading', showSkeleton: false })
    setAttempt((value) => value + 1)
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }

  const answered = view.kind === 'paper'
    ? view.paper.questions.filter((question) => (selections.get(question.id)?.length ?? 0) > 0).length
    : 0
  const blocked = issue !== undefined && issue.action !== 'retry'
  const canSubmit = view.kind === 'paper' && !blocked && !submitting && answered === view.paper.questions.length

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (view.kind !== 'paper' || !canSubmit || submission.current) return

    const controller = new AbortController()
    submission.current = controller
    setSubmitting(true)
    setIssue(undefined)
    const answers = view.paper.questions.map((question) => ({ question_id: question.id, selected_ids: selections.get(question.id) ?? [] }))
    try {
      const result = await submitTest(view.paper, answers, controller.signal)
      if (!controller.signal.aborted) setView({ kind: 'results', result })
    } catch (error) {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) onSessionExpired()
      else setIssue(submitIssue(error))
    } finally {
      submission.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  const pending = view.kind === 'loading'
  return (
    <Box maxW="4xl" mx="auto">
      {view.kind === 'results' ? <Results result={view.result} onRestart={restart} /> : (
        <Stack gap="4">
          <Flex align={{ base: 'start', sm: 'center' }} direction={{ base: 'column-reverse', sm: 'row' }}
            justify="space-between" gap="3" px={{ base: '2', sm: '6', md: '8' }}>
            <Box minW="0">
              <Text fontSize="sm" fontWeight="semibold" color="janeq.muted">Test</Text>
              <Heading as="h1" ref={heading} tabIndex={-1} fontSize={{ base: '3xl', md: '4xl' }}
                overflowWrap="anywhere" _focus={{ outline: 'none' }}>{view.kind === 'paper' ? view.paper.title : set.title}</Heading>
            </Box>
            <Button asChild variant="ghost" color="janeq.muted">
              <a href={studySetHref(set.id)}><IconArrowLeft size={18} aria-hidden="true" /> Back to Study Set</a>
            </Button>
          </Flex>
          {pending ? <VisuallyHidden role="status">Loading test questions…</VisuallyHidden> : null}
          {view.kind === 'error' ? <TestNotice issue={view.issue} onAction={view.issue.action ? restart : undefined} /> : null}
          <Box aria-busy={pending || undefined}>
            {pending && view.showSkeleton ? (
              <Box aria-hidden="true">
                <Skeleton name="test-question" loading animate="solid" color="var(--chakra-colors-janeq-divider)">{null}</Skeleton>
              </Box>
            ) : null}
            {view.kind === 'paper' ? (
              <Stack asChild gap="0">
                <form onSubmit={handleSubmit} aria-busy={submitting || undefined}>
                  <Text role="status" px={{ base: '2', sm: '6', md: '8' }} color="janeq.muted" fontSize="sm" fontWeight="semibold">
                    {answered}/{view.paper.questions.length} answered
                  </Text>
                  <Box as="ol" role="list" listStyleType="none" m="0" p="0" aria-label="Test questions">
                    {view.paper.questions.map((question, index) => (
                      <TestQuestion key={question.id} question={question} index={index} total={view.paper.questions.length}
                        selected={selections.get(question.id) ?? []} disabled={submitting || blocked}
                        onSelect={(ids) => setSelections((current) => new Map(current).set(question.id, ids))} />
                    ))}
                  </Box>
                  <Stack align="center" gap="4" pt="8">
                    <HStack color="janeq.muted"><IconCircleCheckFilled size={20} aria-hidden="true" />
                      <Heading as="h2" fontSize="lg">Ready to submit your test?</Heading>
                    </HStack>
                    {issue ? <TestNotice issue={issue} onAction={issue.action === 'new' ? restart : undefined} /> : null}
                    <PrimaryButton type="submit" size="lg" disabled={!canSubmit} loading={submitting} loadingText="Submit test">
                      Submit test
                    </PrimaryButton>
                  </Stack>
                </form>
              </Stack>
            ) : null}
          </Box>
        </Stack>
      )}
    </Box>
  )
}
