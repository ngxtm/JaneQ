import { Box, Button, Heading, HStack, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { lazy, Suspense, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { isUnauthorized } from '../../http'
import { UiProvider } from '../../ui/UiProvider'
import { homeHref, type LibraryRoute } from '../navigation/app-location'
import { draftTestMessage } from '../test/copy'
import { getStudySets, type StudySet } from './api'
import { EmptyLibrary } from './EmptyLibrary'
import { LibraryLayout } from './LibraryLayout'
import { useLibraryNavigation } from './library-navigation'
import { createPreviewLoader } from './preview-loader'
import { StudySetGrid, StudySetGridPlaceholder } from './StudySetGrid'
import { StudySetModes, TestModeCard } from './StudySetModes'
import './bones/registry'

const Learn = lazy(() => import('../learn/Learn'))
const Test = lazy(() => import('../test/Test'))
const NotFoundPage = lazy(() => import('../navigation/NotFoundPage'))

type StudySetsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; sets: StudySet[] }

type HomeProps = {
  route: LibraryRoute
  username: string
  signingOut: boolean
  signOutError: string
  onSignOut: () => void
  onSessionExpired: () => void
}

const emptySets: StudySet[] = []
const placeholderDelayMs = 200
// Match the seeded catalog while the API is loading.
const builtInPlaceholderCount = 18

function SetSection({ id, title, busy, children }: PropsWithChildren<{
  id: string
  title: string
  busy?: boolean
}>) {
  return (
    <Stack as="section" id={id} aria-labelledby={`${id}-title`} aria-busy={busy} gap="6">
      <Heading as="h2" id={`${id}-title`} fontFamily="heading" fontSize="2xl">{title}</Heading>
      {children}
    </Stack>
  )
}

function StudySetLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <HStack flexWrap="wrap" gap="4">
      <Text color="red.700" role="alert">Could not load study sets.</Text>
      <Button variant="outline" fontFamily="body" onClick={onRetry}>Try again</Button>
    </HStack>
  )
}

function StudySetOverview({ set, status, showSkeleton, onRetry, username, onSessionExpired, loadPreview }: {
  set: StudySet | undefined
  status: StudySetsState['kind']
  showSkeleton: boolean
  onRetry: () => void
  username: string
  onSessionExpired: () => void
  loadPreview: ReturnType<typeof createPreviewLoader>['load']
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const setId = set?.id
  const pending = status === 'loading'

  useEffect(() => {
    // Do not take focus away from navigation during a delayed response.
    if (status === 'loaded' && document.activeElement === document.body) heading.current?.focus()
  }, [setId, status])

  return (
    <Stack align="start" gap="4">
      <Button asChild variant="ghost" size="xs" h="6" minH="6" fontFamily="body" color="janeq.ink">
        <a href={homeHref}><IconArrowLeft size={18} /> Back to Home</a>
      </Button>
      {pending ? <VisuallyHidden role="status">Loading study set…</VisuallyHidden> : null}
      {status === 'error' ? <StudySetLoadError onRetry={onRetry} /> : null}
      <Box w="full" aria-busy={pending || undefined}>
        <div aria-hidden={pending || undefined}>
          <Skeleton name="study-set-overview" loading={pending && showSkeleton} animate="solid" color="var(--chakra-colors-janeq-divider)">
            {status === 'loaded' && set ? (
              <Stack gap="4">
                <Heading as="h1" ref={heading} tabIndex={-1} fontFamily="heading" fontSize={{ base: '4xl', md: '5xl' }} fontWeight="bold"
                  lineHeight={{ base: '1.2', md: '1' }} _focus={{ outline: 'none' }}>
                  {set.title}
                </Heading>
                <Text color="janeq.muted" fontWeight="semibold" minH="8" display="flex" alignItems="center">
                  {set.status === 'draft' ? 'Draft' : 'Ready'} · {set.question_count} {set.question_count === 1 ? 'question' : 'questions'}
                </Text>
                {set.description ? <Text>{set.description}</Text> : null}
                {set.status === 'draft' ? (
                  <Stack gap="2" align="start">
                    <Text role="status" id="test-draft-reason">{draftTestMessage(set.question_count - set.configured_count)}</Text>
                    <Text color="janeq.muted">{set.configured_count} of {set.question_count} answer keys set</Text>
                    <Box mt="4" w="40"><TestModeCard describedBy="test-draft-reason" /></Box>
                  </Stack>
                ) : <Box mt="6"><StudySetModes key={set.id} setId={set.id} legacyId={set.legacy_id} username={username} onSessionExpired={onSessionExpired}
                  loadPreview={loadPreview} /></Box>}
              </Stack>
            ) : null}
          </Skeleton>
        </div>
      </Box>
    </Stack>
  )
}

export default function Home({ route, username, signingOut, signOutError, onSignOut, onSessionExpired }: HomeProps) {
  const [state, setState] = useState<StudySetsState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [previewLoader] = useState(createPreviewLoader)
  const sets = state.kind === 'loaded' ? state.sets : emptySets
  const { selectedSet, recent, recentCount, viewingSet, viewingLearn, viewingTest, removeUnavailableRecentSets } =
    useLibraryNavigation(username, sets, route)

  useEffect(() => previewLoader.clear, [previewLoader])

  function prefetchPreview(set: StudySet) {
    if (set.status === 'ready') {
      // The overview handles failures when the user actually opens the set.
      void previewLoader.load(set.id).catch(() => {})
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    // Brief waits leave the card region quiet to avoid flashing the placeholder.
    const timer = window.setTimeout(() => setShowSkeleton(true), placeholderDelayMs)
    getStudySets(controller.signal).then((sets) => {
      if (controller.signal.aborted) return
      removeUnavailableRecentSets(sets)
      setState({ kind: 'loaded', sets })
    }).catch((error: unknown) => {
      // A stale response from a previous Home screen cannot end the current session.
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) {
        onSessionExpired()
        return
      }
      setState({ kind: 'error' })
    }).finally(() => window.clearTimeout(timer))
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [attempt, onSessionExpired, removeUnavailableRecentSets])

  function retry() {
    setShowSkeleton(false)
    setState({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }

  if (viewingSet && state.kind === 'loaded' && !selectedSet) {
    return <Suspense fallback={null}><NotFoundPage studySet /></Suspense>
  }

  function renderLibrary() {
    if (viewingSet) {
      if (viewingTest && selectedSet) return (
        <Suspense fallback={<VisuallyHidden role="status">Loading Test…</VisuallyHidden>}>
          <Test key={selectedSet.id} set={selectedSet} onSessionExpired={onSessionExpired} />
        </Suspense>
      )
      if (viewingLearn && selectedSet) return (
        <Suspense fallback={<VisuallyHidden role="status">Loading Learn…</VisuallyHidden>}>
          <Learn key={selectedSet.id} setId={selectedSet.id} onSessionExpired={onSessionExpired} />
        </Suspense>
      )
      return <StudySetOverview set={selectedSet} status={state.kind} showSkeleton={showSkeleton} onRetry={retry}
        username={username} onSessionExpired={onSessionExpired} loadPreview={previewLoader.load} />
    }
    if (state.kind === 'error') return <StudySetLoadError onRetry={retry} />

    const pending = state.kind === 'loading'
    const builtInSets = sets.filter((set) => set.source_kind === 'builtin')
    const mySets = sets.filter((set) => set.source_kind === 'custom')
    const showRecent = (pending ? recentCount : recent.length) > 0

    return (
      <Stack gap="12">
        {pending ? <VisuallyHidden role="status">Loading study sets…</VisuallyHidden> : null}
        {showRecent ? <VisuallyHidden as="h1">Home</VisuallyHidden> : <EmptyLibrary />}
        {showRecent ? (
          <SetSection id="recent" title="Recent" busy={pending}>
            {pending ? <StudySetGridPlaceholder count={recentCount} visible={showSkeleton} /> : (
              <StudySetGrid sets={recent} username={username} onIntent={prefetchPreview} />
            )}
          </SetSection>
        ) : null}
        <SetSection id="built-in-sets" title="Built-in sets" busy={pending}>
          {pending ? <StudySetGridPlaceholder count={builtInPlaceholderCount} visible={showSkeleton} /> : null}
          {builtInSets.length ? <StudySetGrid sets={builtInSets} username={username} onIntent={prefetchPreview} captureCard /> : null}
          {!pending && !builtInSets.length ? <Text color="janeq.muted">No study sets are available.</Text> : null}
        </SetSection>
        {mySets.length ? (
          <SetSection id="my-sets" title="My sets"><StudySetGrid sets={mySets} username={username} onIntent={prefetchPreview} /></SetSection>
        ) : null}
      </Stack>
    )
  }

  return (
    <UiProvider>
      <LibraryLayout username={username} signingOut={signingOut} signOutError={signOutError} onSignOut={onSignOut}>
        {renderLibrary()}
      </LibraryLayout>
    </UiProvider>
  )
}
