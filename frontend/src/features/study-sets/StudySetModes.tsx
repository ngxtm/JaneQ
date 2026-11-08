import { Box, Button, Dialog, Flex, Grid, IconButton, Portal, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import {
  IconArrowsShuffle, IconBrain, IconCards, IconChevronLeft, IconChevronRight, IconClipboardList,
  IconPlayerPause, IconPlayerPlay, IconSettings, IconStar,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { httpErrorMessage, isUnauthorized } from '../../http'
import { getStudyPreview, type StudyCard } from '../learn/api'
import { learnHref } from './library-navigation'

const previewOutline = { variant: 'outline', bg: 'transparent', borderStyle: 'solid', borderColor: 'janeq.line' } as const

function readStars(key: string): string[] {
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function Preview({ cards, starKey }: { cards: StudyCard[]; starKey: string }) {
  const [order, setOrder] = useState(cards)
  const [index, setIndex] = useState(0)
  const [answerFirst, setAnswerFirst] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [settings, setSettings] = useState(false)
  const [stars, setStars] = useState(() => readStars(starKey))
  const card = order[index]
  const showingAnswer = answerFirst !== flipped

  useEffect(() => {
    if (!autoplay || settings) return
    const timer = window.setTimeout(() => {
      if (!flipped) setFlipped(true)
      else if (index + 1 < order.length) {
        setIndex(index + 1)
        setFlipped(false)
      } else setAutoplay(false)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [autoplay, flipped, index, order.length, settings])

  function move(offset: number) {
    setAutoplay(false)
    setIndex((current) => Math.max(0, Math.min(order.length - 1, current + offset)))
    setFlipped(false)
  }

  function shuffleCards() {
    const shuffled = [...cards]
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1))
      const card = shuffled[index]
      shuffled[index] = shuffled[other]
      shuffled[other] = card
    }
    setOrder(shuffled)
    setIndex(0)
    setFlipped(false)
  }

  if (!card) return null

  function toggleStar(id: string) {
    const next = stars.includes(id) ? stars.filter((star) => star !== id) : [...stars, id]
    setStars(next)
    try {
      window.localStorage.setItem(starKey, JSON.stringify(next))
    } catch {
      // Keep stars available in the current preview when storage is blocked.
    }
  }

  return <>
    <Box bg="white" borderRadius="xl" boxShadow="lg" overflow="hidden" minW="0">
      <Box bg="orange.400" h="1" w={`${(index + 1) / order.length * 100}%`} />
      <Stack px={{ base: '4', md: '8' }} pt="5" pb="8" gap="4">
        <Grid templateColumns="1fr auto 1fr" alignItems="center">
          <Text color="janeq.muted" fontWeight="semibold">{showingAnswer ? 'Answer' : 'Question'}</Text>
          <Text fontWeight="bold" aria-live="polite">{index + 1} / {order.length}</Text>
          <IconButton justifySelf="end" variant="ghost" color="janeq.blue" aria-label={stars.includes(card.id) ? 'Unstar question' : 'Star question'}
            aria-pressed={stars.includes(card.id)} onClick={() => toggleStar(card.id)}><IconStar fill={stars.includes(card.id) ? 'currentColor' : 'none'} /></IconButton>
        </Grid>
        <Button variant="ghost" h="auto" minH={{ base: '56', md: '80' }} whiteSpace="pre-wrap" overflowWrap="anywhere"
          fontFamily="heading" fontSize={{ base: 'xl', md: '3xl' }} fontWeight="500" aria-label={`Flip card. ${showingAnswer ? card.answers.join(', ') : card.prompt}`}
          onClick={() => { setAutoplay(false); setFlipped((value) => !value) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              move(event.key === 'ArrowLeft' ? -1 : 1)
            }
          }}>
          {showingAnswer ? card.answers.join('\n') : card.prompt}
        </Button>
        <Grid templateColumns="1fr 1fr" gap="3">
          <IconButton {...previewOutline} aria-label="Previous card" disabled={index === 0} onClick={() => move(-1)}><IconChevronLeft /></IconButton>
          <IconButton {...previewOutline} aria-label="Next card" disabled={index + 1 === order.length} onClick={() => move(1)}><IconChevronRight /></IconButton>
        </Grid>
      </Stack>
    </Box>
    <Flex gap="3" direction={{ base: 'row', lg: 'column' }} wrap="wrap" align="stretch">
      <Button {...previewOutline} flex={{ base: '1', lg: 'none' }} color="janeq.blue" disabled={cards.length < 2} onClick={shuffleCards}><IconArrowsShuffle size={19} /> Shuffle</Button>
      <Button {...previewOutline} flex={{ base: '1', lg: 'none' }} color="janeq.blue" aria-pressed={autoplay} onClick={() => setAutoplay((value) => !value)}>
        {autoplay ? <IconPlayerPause size={19} /> : <IconPlayerPlay size={19} />} {autoplay ? 'Pause' : 'Autoplay'}
      </Button>
      <Button variant="ghost" color="janeq.blue" onClick={() => setSettings(true)}><IconSettings size={19} /> Settings</Button>
    </Flex>
    <Dialog.Root open={settings} onOpenChange={({ open }) => setSettings(open)} placement="center">
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content mx="4">
        <Dialog.Header><Dialog.Title>Flashcard preview settings</Dialog.Title></Dialog.Header>
        <Dialog.Body><label><input type="checkbox" checked={answerFirst} onChange={(event) => {
          setAnswerFirst(event.target.checked)
          setFlipped(false)
        }} /> Show the answer first</label></Dialog.Body>
        <Dialog.Footer><Dialog.ActionTrigger asChild><Button>Done</Button></Dialog.ActionTrigger></Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  </>
}

export function StudySetModes({ setId, username, onSessionExpired }: {
  setId: string
  username: string
  onSessionExpired: () => void
}) {
  const [cards, setCards] = useState<StudyCard[]>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getStudyPreview(setId, controller.signal).then((items) => {
      if (!controller.signal.aborted) setCards(items)
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(failure)) onSessionExpired()
      else setError(httpErrorMessage(failure, 'Could not load the flashcard preview.'))
    })
    return () => controller.abort()
  }, [attempt, onSessionExpired, setId])

  const modeStyle = { h: '14', justifyContent: 'start', borderRadius: 'xl', bg: 'white', color: 'janeq.ink', boxShadow: 'sm', fontWeight: '700', borderStyle: 'solid', borderBottomWidth: '2px', borderColor: 'janeq.divider' }

  return <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: '10rem minmax(0, 1fr) 10rem' }} gap={{ base: '5', lg: '8' }} alignItems="start">
    <Grid as="nav" aria-label="Study modes" templateColumns={{ base: 'repeat(2, minmax(0, 1fr))', lg: '1fr' }} gap="4">
      <Button {...modeStyle} asChild variant="outline"><a href={learnHref(setId)}><IconBrain size={22} color="var(--chakra-colors-janeq-blue)" /> Learn</a></Button>
      <Button {...modeStyle} variant="outline" disabled><IconCards size={22} /> Flashcards</Button>
      <Button {...modeStyle} variant="outline" disabled><IconClipboardList size={22} /> Test</Button>
    </Grid>
    {!cards && !error ? <VisuallyHidden role="status">Loading flashcard preview…</VisuallyHidden> : null}
    {cards ? <Preview cards={cards} starKey={`janeq:preview-stars:v1:${username}:${setId}`} /> : null}
    {error ? <Stack align="start" role="alert"><Text color="red.700">{error}</Text><Button variant="outline" onClick={() => {
      setError('')
      setAttempt((value) => value + 1)
    }}>Try again</Button></Stack> : null}
  </Grid>
}
