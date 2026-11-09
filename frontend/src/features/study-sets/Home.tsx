import { Box, Button, Heading, HStack, IconButton, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft, IconEditCircle } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { lazy, Suspense, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { isUnauthorized } from '../../http'
import { UiProvider } from '../../ui/UiProvider'
import { SetDeleteMenu, type OnSetDeleted } from '../authoring/SetDeleteMenu'
import { homeHref, mySetsHref, navigateLibrary, studySetHref, type LibraryRoute } from '../navigation/app-location'
import { getStudySets, type StudySet } from './api'
import { EmptyLibrary } from './EmptyLibrary'
import { LibraryLayout } from './LibraryLayout'
import { useLibraryNavigation } from './library-navigation'
import { createPreviewLoader } from './preview-loader'
import { StudySetGrid, StudySetGridPlaceholder } from './StudySetGrid'
import { StudySetModes } from './StudySetModes'
import './bones/registry'

const Learn = lazy(() => import('../learn/Learn'))
const Test = lazy(() => import('../test/Test'))
const MySets = lazy(() => import('../authoring/MySets'))
const SetEditor = lazy(() => import('../authoring/SetEditor'))
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

function StudySetOverview({ set, status, showSkeleton, onRetry, username, onSessionExpired, loadPreview, onDeleted }: {
  set: StudySet | undefined
  status: StudySetsState['kind']
  showSkeleton: boolean
  onRetry: () => void
  username: string
  onSessionExpired: () => void
  loadPreview: ReturnType<typeof createPreviewLoader>['load']
  onDeleted: OnSetDeleted
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const setId = set?.id
  const pending = status === 'loading'
  const custom = set?.source_kind === 'custom'

  useEffect(() => {
    // Do not take focus away from navigation during a delayed response.
    if (status === 'loaded' && document.activeElement === document.body) heading.current?.focus()
  }, [setId, status])

  return (
    <Stack align="start" gap="4">
      <Button asChild variant="ghost" size="xs" h="6" minH="6" fontFamily="body" color="janeq.ink">
        <a href={custom ? mySetsHref : homeHref}><IconArrowLeft size={18} />{custom ? 'Back to My sets' : 'Back to Home'}</a>
      </Button>
      {pending ? <VisuallyHidden role="status">Loading study set…</VisuallyHidden> : null}
      {status === 'error' ? <StudySetLoadError onRetry={onRetry} /> : null}
      <Box w="full" aria-busy={pending || undefined}>
        <div aria-hidden={pending || undefined}>
          <Skeleton name="study-set-overview" loading={pending && showSkeleton} animate="solid" color="var(--chakra-colors-janeq-divider)">
            {status === 'loaded' && set ? (
              <Stack gap="4">
                <Heading as="h1" ref={heading} tabIndex={-1} fontFamily="heading" fontSize={{ base: '4xl', md: '5xl' }} fontWeight="bold"
                  lineHeight={{ base: '1.2', md: '1' }} overflowWrap="anywhere" _focus={{ outline: 'none' }}>
                  {set.title}
                </Heading>
                <HStack gap="3" justify="space-between" minH="8">
                  <Text color="janeq.muted" fontWeight="semibold">
                    {set.status === 'draft' ? 'Draft' : 'Ready'} · {set.question_count} {set.question_count === 1 ? 'question' : 'questions'}
                  </Text>
                  {custom ? (
                    <HStack gap="0" border="1px solid" borderColor="janeq.line" rounded="lg" flexShrink="0">
                      <IconButton asChild variant="ghost" size="sm" w="10" roundedEnd="0" color="janeq.focus"
                        focusVisibleRing="outside" focusRingColor="janeq.focus">
                        <a href={studySetHref(set.id, 'editor')} aria-label="Edit set" title="Edit set"><IconEditCircle size={19} /></a>
                      </IconButton>
                      <SetDeleteMenu key={set.id} id={set.id} title={set.title} revision={set.revision} onDeleted={onDeleted} attached />
                    </HStack>
                  ) : null}
                </HStack>
                {set.description ? <Text>{set.description}</Text> : null}
                {set.status === 'ready' ? <Box mt="6"><StudySetModes key={set.id} setId={set.id} legacyId={set.legacy_id}
                  username={username} onSessionExpired={onSessionExpired} loadPreview={loadPreview} /></Box>
                  : <Text role="status">This set is unavailable for study.</Text>}
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
  const catalogRequest = useRef<AbortController>(null)
  const sets = state.kind === 'loaded' ? state.sets : emptySets
  const { selectedSet, recent, recentCount, editorId, viewingSet, viewingLearn, viewingTest, removeUnavailableRecentSets } =
    useLibraryNavigation(username, sets, route)
  const inMySets = route.kind === 'my-sets' || route.kind === 'create' || editorId !== undefined || selectedSet?.source_kind === 'custom'

  useEffect(() => previewLoader.clear, [previewLoader])

  function prefetchPreview(set: StudySet) {
    if (set.status === 'ready') {
      // The overview handles failures when the user actually opens the set.
      void previewLoader.load(set.id).catch(() => {})
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    catalogRequest.current = controller
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
      setState((current) => current.kind === 'loaded' ? current : { kind: 'error' })
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

  function handleSaved(set: StudySet) {
    catalogRequest.current?.abort()
    previewLoader.clear()
    setState((current) => ({
      kind: 'loaded', sets: [...(current.kind === 'loaded' ? current.sets.filter((item) => item.id !== set.id) : []), set],
    }))
    setAttempt((current) => current + 1)
    navigateLibrary(studySetHref(set.id))
  }

  function handleDeleted(id: string, shouldNavigate: boolean) {
    catalogRequest.current?.abort()
    previewLoader.clear()
    setState((current) => current.kind === 'loaded'
      ? { kind: 'loaded', sets: current.sets.filter((set) => set.id !== id) }
      : current)
    setAttempt((current) => current + 1)
    if (shouldNavigate) navigateLibrary(mySetsHref)
  }

  if (viewingSet && !editorId && state.kind === 'loaded' && !selectedSet) {
    return <Suspense fallback={null}><NotFoundPage studySet /></Suspense>
  }

  function renderLibrary() {
    if (route.kind === 'create' || editorId) return (
      <Suspense fallback={<VisuallyHidden role="status">Opening editor…</VisuallyHidden>}>
        <SetEditor key={editorId ?? 'new'} id={editorId} onSaved={handleSaved} onDeleted={handleDeleted} onSessionExpired={onSessionExpired} />
      </Suspense>
    )
    if (route.kind === 'my-sets') return (
      <Suspense fallback={<VisuallyHidden role="status">Opening My sets…</VisuallyHidden>}>
        <MySets sets={sets} status={state.kind} showSkeleton={showSkeleton} onRetry={retry} />
      </Suspense>
    )
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
        username={username} onSessionExpired={onSessionExpired} loadPreview={previewLoader.load} onDeleted={handleDeleted} />
    }
    if (state.kind === 'error') return <StudySetLoadError onRetry={retry} />

    const pending = state.kind === 'loading'
    const builtInSets = sets.filter((set) => set.source_kind === 'builtin')
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
      </Stack>
    )
  }

  return (
    <UiProvider>
      <LibraryLayout username={username} inMySets={inMySets} signingOut={signingOut} signOutError={signOutError} onSignOut={onSignOut}>
        {renderLibrary()}
      </LibraryLayout>
    </UiProvider>
  )
}
