import { Badge, Box, Button, Flex, Grid, Heading, HStack, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconInfinity, IconReportOff } from '@tabler/icons-react'
import { registerBones } from 'boneyard-js'
import { Skeleton } from 'boneyard-js/react'
import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { homeHref, studySetHref } from '../navigation/app-location'
import { getTest, submitTest, testConflict, type TestAnswer, type TestPaper, type TestResult } from './api'
import workspaceBones from './bones/test-workspace.bones.json'
import { draftTestMessage } from './copy'
import { QuestionNavigator } from './QuestionNavigator'
import { Results } from './Results'
import { SubmitTestButton, SubmitTestDialog } from './SubmitTestDialog'
import { TestQuestion } from './TestQuestion'
import { describeDuration, saveTestMode, type TestMode } from './test-mode'
import { finishTimedPaper, startTimedPaper, type TimedPaper } from './timed-paper-api'
import { TimedTestTimer } from './TimedTestTimer'
import { useTimedAnswerSync } from './useTimedAnswerSync'

registerBones({ 'test-workspace': workspaceBones })

type Issue = { title: string; message: string; action?: 'retry' | 'new' }
type PracticeSubmission = { answers: TestAnswer[]; allowUnanswered: boolean }
type View =
  | { kind: 'loading'; showSkeleton: boolean }
  | { kind: 'error'; issue: Issue }
  | { kind: 'paper'; paper: TestPaper; timing?: TimedPaper }
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
  if (conflict?.code === 'submission_id_reused') {
    return {
      title: 'This attempt was already submitted',
      message: 'You can review the saved result in Test History or open a new test.',
      action: 'new',
    }
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

const noSelection: string[] = []

function answerText(question: TestPaper['questions'][number], ids: string[]) {
  return question.options.filter(({ id }) => ids.includes(id)).map(({ text }) => text).join(', ') || 'Unanswered'
}

function focusQuestion(index: number) {
  const prompt = document.getElementById(`test-prompt-${index}`)
  prompt?.focus({ preventScroll: true })
  prompt?.scrollIntoView({ block: 'nearest' })
}

export default function Test({ setId, setTitle, canStartNewTest, mode, onSessionExpired }: {
  setId: string
  setTitle?: string
  canStartNewTest: boolean
  mode: TestMode
  onSessionExpired: () => void
}) {
  const [view, setView] = useState<View>({ kind: 'loading', showSkeleton: false })
  const [attempt, setAttempt] = useState(0)
  const [selections, setSelections] = useState(() => new Map<string, string[]>())
  const [activeIndex, setActiveIndex] = useState(0)
  const [expired, setExpired] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingPractice, setPendingPractice] = useState<PracticeSubmission>()
  const [issue, setIssue] = useState<Issue>()
  const submission = useRef<AbortController | null>(null)
  const [requestId, setRequestId] = useState(() => mode.kind === 'timed' ? mode.startId : crypto.randomUUID())
  const heading = useRef<HTMLHeadingElement>(null)
  const shouldFocusQuestion = useRef(false)
  const duration = mode.kind === 'timed' ? mode.duration : undefined
  const showingResults = view.kind === 'results'
  const timing = view.kind === 'paper' ? view.timing : undefined
  const showResult = useCallback((result: TestResult) => setView({ kind: 'results', result }), [])
  const sync = useTimedAnswerSync(timing, selections, expired, showResult, onSessionExpired)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => setView((current) =>
      current.kind === 'loading' ? { kind: 'loading', showSkeleton: true } : current), 200)

    async function load() {
      if (duration === undefined) {
        const paper = await getTest(setId, controller.signal)
        if (!controller.signal.aborted) setView({ kind: 'paper', paper })
        return
      }
      const state = await startTimedPaper(setId, requestId, duration, controller.signal)
      if (controller.signal.aborted) return
      if (state.status === 'completed') {
        showResult(state.result)
        return
      }
      setSelections(new Map(Object.entries(state.answers)))
      setView({ kind: 'paper', paper: state, timing: state })
    }

    void load().catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) onSessionExpired()
      else setView({ kind: 'error', issue: loadIssue(error) })
    }).finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [attempt, duration, onSessionExpired, requestId, setId, showResult])

  useEffect(() => {
    if (!showingResults) heading.current?.focus({ preventScroll: true })
  }, [showingResults])

  useEffect(() => () => submission.current?.abort(), [])

  useEffect(() => {
    if (!shouldFocusQuestion.current) return
    shouldFocusQuestion.current = false
    focusQuestion(activeIndex)
  }, [activeIndex])

  function restart(newAttempt: boolean) {
    if (newAttempt) {
      const startId = crypto.randomUUID()
      setRequestId(startId)
      if (mode.kind === 'timed') saveTestMode(setId, { ...mode, startId })
    }
    setSelections(new Map())
    setActiveIndex(0)
    setExpired(false)
    setConfirming(false)
    setPendingPractice(undefined)
    setIssue(undefined)
    setView({ kind: 'loading', showSkeleton: false })
    setAttempt((value) => value + 1)
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }

  function navigateTo(index: number) {
    if (index === activeIndex) {
      focusQuestion(index)
      return
    }
    shouldFocusQuestion.current = true
    setActiveIndex(index)
  }

  function selectAnswer(questionId: string, ids: string[]) {
    setSelections((current) => {
      const next = new Map(current)
      if (ids.length) next.set(questionId, ids)
      else next.delete(questionId)
      return next
    })
  }

  const answerConflict = sync.conflict
  const conflictIndex = view.kind === 'paper' && answerConflict
    ? view.paper.questions.findIndex(({ id }) => id === answerConflict.questionId)
    : -1
  const conflictQuestion = view.kind === 'paper' ? view.paper.questions[conflictIndex] : undefined
  const blocked = issue !== undefined && issue.action !== 'retry'
  const unanswered = view.kind === 'paper'
    ? view.paper.questions.flatMap(({ id }, index) => selections.has(id) ? [] : [index + 1])
    : []
  const waitingForAnswers = sync.saving || sync.unsaved
  const canRequestSubmit = view.kind === 'paper' && !blocked && !submitting && !expired
  const canSubmit = canRequestSubmit && !waitingForAnswers

  async function submit(allowUnanswered = false) {
    if (view.kind !== 'paper' || submission.current) return

    const controller = new AbortController()
    submission.current = controller
    setSubmitting(true)
    setIssue(undefined)
    let practiceSnapshot: PracticeSubmission | undefined
    try {
      if (timing) {
        const finish = await finishTimedPaper(timing, expired, controller.signal)
        if (controller.signal.aborted) return
        if (finish.kind === 'running') {
          setView({ ...view, timing: { ...timing, clientDeadline: finish.clientDeadline } })
          setExpired(false)
        } else {
          showResult(finish.result)
        }
      } else {
        // A retry must replay the same choices if the server committed before the connection failed.
        practiceSnapshot = pendingPractice ?? {
          answers: view.paper.questions.map(({ id }) => ({
            question_id: id, selected_ids: selections.get(id) ?? noSelection,
          })),
          allowUnanswered,
        }
        const result = await submitTest(
          view.paper, practiceSnapshot.answers, controller.signal, requestId, practiceSnapshot.allowUnanswered,
        )
        if (!controller.signal.aborted) showResult(result)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) {
        onSessionExpired()
        return
      }
      const status = httpStatus(error)
      const rejected = status !== undefined && status >= 400 && status < 500
      if (practiceSnapshot && !rejected) {
        setPendingPractice(practiceSnapshot)
        setIssue({
          title: 'Could not confirm submission',
          message: 'Retry submission to send the same answers and recover your result.',
          action: 'retry',
        })
      } else {
        setPendingPractice(undefined)
        setIssue(submitIssue(error))
      }
    } finally {
      submission.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  const submitExpiredPaper = useEffectEvent(submit)
  useEffect(() => {
    if (!timing || !expired || sync.saving || issue) return
    const timer = window.setTimeout(() => void submitExpiredPaper(), 0)
    return () => window.clearTimeout(timer)
  }, [expired, issue, sync.saving, timing])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canRequestSubmit) return
    if (!pendingPractice && unanswered.length > 0) setConfirming(true)
    else if (canSubmit) void submit()
  }

  function confirmSubmit() {
    if (!canSubmit) return
    setConfirming(false)
    void submit(true)
  }

  const pending = view.kind === 'loading'
  const backHref = setTitle === undefined ? homeHref : studySetHref(setId)
  const backLabel = setTitle === undefined ? 'Back to Home' : 'Back to study set'
  const submitLabel = pendingPractice ? 'Retry submission' : 'Submit test'
  const question = view.kind === 'paper' ? view.paper.questions[activeIndex] : undefined
  return (
    <Box maxW={showingResults ? '4xl' : '6xl'} mx="auto">
      {view.kind === 'results' ? (
        <Results result={view.result} backHref={backHref} backLabel={setTitle === undefined ? backLabel : undefined}
          onSessionExpired={onSessionExpired}
          onRestart={canStartNewTest ? () => restart(true) : undefined} />
      ) : (
        <Stack gap="5">
          <Flex align={{ base: 'start', md: 'end' }} direction={{ base: 'column', md: 'row' }}
            justify="space-between" gap="3">
            <Box minW="0">
              <HStack gap="2" mb="1.5" flexWrap="wrap">
                <Badge variant="subtle" colorPalette="blue" color="janeq.focus">{duration ? 'Timed test' : 'Practice test'}</Badge>
                <HStack gap="1" color="janeq.muted" fontSize="sm">
                  {duration ? null : <IconInfinity size={16} aria-hidden="true" />}
                  <Text>{duration ? `${describeDuration(timing?.duration_minutes ?? duration)} total` : 'No time limit'}</Text>
                </HStack>
              </HStack>
              <Heading as="h1" ref={heading} tabIndex={-1} fontSize={{ base: '3xl', md: '4xl' }}
                overflowWrap="anywhere" _focus={{ outline: 'none' }}>{view.kind === 'paper' ? view.paper.title : setTitle ?? 'Test'}</Heading>
            </Box>
            <HStack gap="2" flexWrap="wrap">
              <Button asChild variant="ghost" color="janeq.muted" focusVisibleRing="outside" focusRingColor="janeq.focus">
                <a href={backHref}><IconArrowLeft size={18} aria-hidden="true" /> {backLabel}</a>
              </Button>
              {timing ? (
                <TimedTestTimer key={timing.clientDeadline} clientDeadline={timing.clientDeadline}
                  onExpire={() => { setExpired(true); setConfirming(false); setIssue(undefined) }} isSubmitting={submitting} />
              ) : null}
            </HStack>
          </Flex>
          {pending ? <VisuallyHidden role="status">Loading test questions…</VisuallyHidden> : null}
          {view.kind === 'error' ? <TestNotice issue={view.issue} onAction={view.issue.action ? () => restart(false) : undefined} /> : null}
          <Box aria-busy={pending || undefined}>
            {pending && view.showSkeleton ? (
              <Box aria-hidden="true">
                <Skeleton name="test-workspace" select="viewport" loading animate="solid" color="var(--chakra-colors-janeq-divider)">{null}</Skeleton>
              </Box>
            ) : null}
            {view.kind === 'paper' && question ? (
              <Grid asChild templateColumns={{ base: 'minmax(0, 1fr)', lg: '17rem minmax(0, 1fr)' }}
                alignItems="start" gap={{ base: '4', lg: '6' }}>
                <form onSubmit={handleSubmit} aria-busy={submitting || undefined}>
                  <Stack gap="3" position={{ lg: 'sticky' }} top={{ lg: '4' }} minW="0">
                    <QuestionNavigator questions={view.paper.questions} selections={selections} activeIndex={activeIndex} onNavigate={navigateTo} />
                    <SubmitTestButton type="submit" disabled={!canRequestSubmit || (unanswered.length === 0 && waitingForAnswers)}
                      loading={submitting} loadingText={submitLabel}>
                      {submitLabel}
                    </SubmitTestButton>
                    {expired || sync.saving ? (
                      <Text color="janeq.muted" fontSize="sm" role="status">{expired ? 'Time is up.' : 'Saving answers…'}</Text>
                    ) : null}
                  </Stack>
                  <Stack gap="4" minW="0">
                    <Box asChild listStyleType="none" m="0" p="0">
                      <ol start={activeIndex + 1} role="list" aria-label="Current question">
                        <TestQuestion key={question.id} question={question} index={activeIndex} total={view.paper.questions.length}
                          selected={selections.get(question.id) ?? noSelection}
                          disabled={submitting || blocked || expired || Boolean(pendingPractice)} standalone
                          onSelect={(ids) => selectAnswer(question.id, ids)} />
                      </ol>
                    </Box>
                    <Flex justify="space-between" gap="2">
                      <Button type="button" variant="outline" bg="white" borderColor="janeq.line" color="janeq.ink" fontFamily="body" rounded="lg"
                        _hover={{ bg: 'blue.50' }}
                        focusVisibleRing="outside" focusRingColor="janeq.focus" disabled={activeIndex === 0}
                        onClick={() => navigateTo(activeIndex - 1)}><IconChevronLeft size={18} aria-hidden="true" /> Previous</Button>
                      <Button type="button" variant="outline" bg="white" borderColor="janeq.line" color="janeq.ink" fontFamily="body" rounded="lg"
                        _hover={{ bg: 'blue.50' }}
                        focusVisibleRing="outside" focusRingColor="janeq.focus" disabled={activeIndex === view.paper.questions.length - 1}
                        onClick={() => navigateTo(activeIndex + 1)}>Next <IconChevronRight size={18} aria-hidden="true" /></Button>
                    </Flex>
                    {sync.failed && !expired ? (
                      <TestNotice issue={{ title: 'Could not save your answer', message: 'Check your connection and retry before time runs out.', action: 'retry' }}
                        onAction={sync.retry} />
                    ) : null}
                    {answerConflict && conflictQuestion && !expired ? (
                      <Stack bg="white" border="1px solid" borderColor="janeq.divider" rounded="xl" p="4" gap="3">
                        <Box role="alert">
                          <Heading as="h2" fontSize="lg">
                            Question {conflictIndex + 1} changed in another tab
                          </Heading>
                          <Text color="janeq.muted">Choose which answer to keep before submitting.</Text>
                        </Box>
                        <Stack gap="1" fontSize="sm" overflowWrap="anywhere">
                          <Text><strong>Saved answer:</strong> {answerText(conflictQuestion, answerConflict.saved.selectedIds)}</Text>
                          <Text><strong>Your answer:</strong> {answerText(conflictQuestion, selections.get(conflictQuestion.id) ?? noSelection)}</Text>
                        </Stack>
                        <HStack flexWrap="wrap">
                          <Button type="button" variant="outline" borderColor="janeq.line" onClick={() => {
                            selectAnswer(answerConflict.questionId, answerConflict.saved.selectedIds)
                            sync.resolveConflict()
                          }}>Use saved answer</Button>
                          <Button type="button" variant="outline" borderColor="janeq.line" onClick={sync.resolveConflict}>
                            Save my answer
                          </Button>
                        </HStack>
                      </Stack>
                    ) : null}
                    {issue ? <TestNotice issue={issue}
                      onAction={issue.action === 'new' ? () => restart(true) : expired ? () => void submit() : undefined} /> : null}
                  </Stack>
                </form>
              </Grid>
            ) : null}
          </Box>
          <SubmitTestDialog open={confirming} unanswered={unanswered} waiting={waitingForAnswers}
            saveIssue={answerConflict ? 'Keep working to resolve the answer conflict.'
              : sync.failed ? 'Keep working to retry saving your answers.' : undefined}
            onClose={() => setConfirming(false)} onConfirm={confirmSubmit} />
        </Stack>
      )}
    </Box>
  )
}
