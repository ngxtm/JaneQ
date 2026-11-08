import { Button, Heading, HStack, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { isUnauthorized } from '../../http'
import { UiProvider } from '../../ui/UiProvider'
import { getStudySets, type StudySet } from './api'
import { EmptyLibrary } from './EmptyLibrary'
import { LibraryLayout } from './LibraryLayout'
import { useLibraryNavigation } from './library-navigation'
import { StudySetGrid, StudySetGridSkeleton } from './StudySetGrid'

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

function SetSection({ id, title, sets, username }: {
  id: string
  title: string
  sets: StudySet[]
  username: string
}) {
  return (
    <Stack as="section" id={id} aria-labelledby={`${id}-title`} gap="6">
      <Heading as="h2" id={`${id}-title`} fontFamily="heading" fontSize="2xl">{title}</Heading>
      {sets.length ? <StudySetGrid sets={sets} username={username} /> : (
        <Text color="janeq.muted">No study sets are available.</Text>
      )}
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
  const sets = state.kind === 'loaded' ? state.sets : emptySets
  const { selectedSet, recent, viewingSet, rememberCurrentSet } = useLibraryNavigation(username, sets)

  useEffect(() => {
    const controller = new AbortController()
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
    })
    return () => controller.abort()
  }, [attempt, onSessionExpired, rememberCurrentSet])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }

  function renderLibrary() {
    if (state.kind === 'loading') {
      return (
        <Stack gap="6">
          <VisuallyHidden role="status">Loading study sets…</VisuallyHidden>
          <Heading as="h1" fontFamily="heading" fontSize="2xl">Built-in sets</Heading>
          <StudySetGridSkeleton />
        </Stack>
      )
    }
    if (state.kind === 'error') {
      return (
        <HStack flexWrap="wrap" gap="4">
          <Text color="red.700" role="alert">Could not load study sets.</Text>
          <Button variant="outline" fontFamily="body" onClick={retry}>Try again</Button>
        </HStack>
      )
    }
    if (viewingSet) return <StudySetOverview set={selectedSet} />

    const builtInSets = sets.filter((set) => set.source_kind === 'builtin')
    const mySets = sets.filter((set) => set.source_kind === 'custom')

    return (
      <Stack gap="12">
        {recent.length ? (
          <>
            <VisuallyHidden as="h1">Home</VisuallyHidden>
            <SetSection id="recent" title="Recent" sets={recent} username={username} />
          </>
        ) : <EmptyLibrary />}
        <SetSection id="built-in-sets" title="Built-in sets" sets={builtInSets} username={username} />
        {mySets.length ? <SetSection id="my-sets" title="My sets" sets={mySets} username={username} /> : null}
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
