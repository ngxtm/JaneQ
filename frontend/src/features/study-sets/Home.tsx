import { Button, Heading, HStack, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft } from '@tabler/icons-react'
import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { isUnauthorized } from '../../http'
import { UiProvider } from '../../ui/UiProvider'
import { getStudySets, type StudySet } from './api'
import { EmptyLibrary } from './EmptyLibrary'
import { LibraryLayout } from './LibraryLayout'
import { useLibraryNavigation } from './library-navigation'
import { BuiltInStudySetGrid, StudySetGrid } from './StudySetGrid'

type StudySetsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; sets: StudySet[] }

type HomeProps = {
  username: string
  signingOut: boolean
  signOutError: string
  onSignOut: () => void
  onSessionExpired: () => void
}

const emptySets: StudySet[] = []
const placeholderDelayMs = 200

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

function StudySetOverview({ set }: { set: StudySet | undefined }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const setId = set?.id

  useEffect(() => {
    heading.current?.focus()
  }, [setId])

  return (
    <Stack align="start" gap="4">
      <Button asChild variant="ghost" fontFamily="body" color="janeq.ink">
        <a href="#home"><IconArrowLeft size={18} /> Back to Home</a>
      </Button>
      <Heading as="h1" ref={heading} tabIndex={-1} fontFamily="heading" fontSize="3xl">
        {set?.title ?? 'Study set not found'}
      </Heading>
      {set ? (
        <>
          <Text color="janeq.muted">
            {set.status === 'draft' ? 'Draft' : 'Ready'} · {set.question_count} {set.question_count === 1 ? 'question' : 'questions'}
          </Text>
          {set.description ? <Text>{set.description}</Text> : null}
          <Text color="janeq.muted">{set.configured_count} of {set.question_count} answer keys set</Text>
        </>
      ) : <Text color="janeq.muted">Choose an available study set from Home.</Text>}
    </Stack>
  )
}

export default function Home({ username, signingOut, signOutError, onSignOut, onSessionExpired }: HomeProps) {
  const [state, setState] = useState<StudySetsState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const sets = state.kind === 'loaded' ? state.sets : emptySets
  const { selectedSet, recent, hasRecentHistory, viewingSet, rememberCurrentSet } = useLibraryNavigation(username, sets)

  useEffect(() => {
    const controller = new AbortController()
    // Brief waits leave the card region quiet to avoid flashing the placeholder.
    const timer = window.setTimeout(() => setShowSkeleton(true), placeholderDelayMs)
    getStudySets(controller.signal).then((sets) => {
      if (controller.signal.aborted) return
      rememberCurrentSet(sets)
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
  }, [attempt, onSessionExpired, rememberCurrentSet])

  function retry() {
    setShowSkeleton(false)
    setState({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }

  function renderLibrary() {
    if (state.kind === 'error') {
      return (
        <HStack flexWrap="wrap" gap="4">
          <Text color="red.700" role="alert">Could not load study sets.</Text>
          <Button variant="outline" fontFamily="body" onClick={retry}>Try again</Button>
        </HStack>
      )
    }
    const pending = state.kind === 'loading'
    if (viewingSet) {
      return pending ? <VisuallyHidden role="status">Loading study set…</VisuallyHidden> : (
        <StudySetOverview set={selectedSet} />
      )
    }

    const builtInSets = sets.filter((set) => set.source_kind === 'builtin')
    const mySets = sets.filter((set) => set.source_kind === 'custom')
    const showWelcome = pending ? !hasRecentHistory : recent.length === 0

    return (
      <Stack gap="12">
        {pending ? <VisuallyHidden role="status">Loading study sets…</VisuallyHidden> : null}
        {showWelcome ? <EmptyLibrary /> : <VisuallyHidden as="h1">Home</VisuallyHidden>}
        {recent.length ? (
          <SetSection id="recent" title="Recent"><StudySetGrid sets={recent} username={username} /></SetSection>
        ) : null}
        <SetSection id="built-in-sets" title="Built-in sets" busy={pending}>
          {pending && showSkeleton ? (
            <div aria-hidden="true"><BuiltInStudySetGrid sets={emptySets} username={username} loading /></div>
          ) : null}
          {builtInSets.length ? <BuiltInStudySetGrid sets={builtInSets} username={username} loading={false} /> : null}
          {!pending && !builtInSets.length ? <Text color="janeq.muted">No study sets are available.</Text> : null}
        </SetSection>
        {mySets.length ? (
          <SetSection id="my-sets" title="My sets"><StudySetGrid sets={mySets} username={username} /></SetSection>
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
