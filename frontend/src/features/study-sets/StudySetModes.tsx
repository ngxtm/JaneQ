import { Box, Button, Dialog, Flex, Grid, IconButton, Portal, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import {
  IconArrowsShuffle, IconBrain, IconCards, IconChevronLeft, IconChevronRight, IconReport,
  IconPlayerPlay, IconSettings, IconStar, IconStarFilled,
} from '@tabler/icons-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { httpErrorMessage, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { SettingsSwitch } from '../../ui/SettingsSwitch'
import { getStudyPreview, type StudyCard } from '../learn/api'
import { learnHref } from './library-navigation'
import { PreviewCard } from './PreviewCard'

const actionColor = '#0036b4'
const actionHover = '#e0edff'
const modeShadow = '0 4px 6px -1px rgb(0 0 0 / 10%), 0 2px 4px -1px rgb(0 0 0 / 6%)'
const hoverShadow = '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -2px rgb(0 0 0 / 5%)'
const flashcardShadow = '0 20px 25px -5px rgb(0 0 0 / 10%), 0 10px 10px -5px rgb(0 0 0 / 4%)'
const iconSize = { '& svg': { width: '24px', height: '24px', flexShrink: 0 } }
const previewOutline = {
  variant: 'outline', bg: 'transparent', border: '1px solid #cbd5e0', rounded: 'lg',
  _hover: { bg: actionHover }, _disabled: { opacity: 0.4, bg: 'transparent' },
  css: iconSize,
} as const

function ModeCard({ label, icon, href }: { label: string; icon: ReactNode; href?: string }) {
  const content = <>
    <Box aria-hidden="true" position="relative" boxSize="6" flexShrink="0" css={{ '& svg': { display: 'block' } }}>
      <Box className="mode-icon-shadow" position="absolute" top="1" left="-1" color="#1a5fff"
        filter="blur(2px)" opacity="0.3" transition="transform 300ms ease-in-out" _motionReduce={{ transition: 'none' }}>
        {icon}
      </Box>
      <Box className="mode-icon" position="relative" color="#4b83ff"
        transition="transform 300ms ease-in-out" _motionReduce={{ transition: 'none' }}>
        {icon}
      </Box>
    </Box>
    <Text as="span" fontFamily="heading" fontSize="md" fontWeight="bold" lineHeight="1.2">{label}</Text>
  </>

  return <Flex asChild align="center" gap="3" py="4" px="5" rounded="xl" bg="white" color="janeq.ink"
    borderBottom="3px solid #e2e8f0" boxShadow={modeShadow} minW="0" outline="2px solid transparent"
    transition="transform 150ms ease-in-out, border-color 150ms ease-in-out, box-shadow 150ms ease-in-out"
    _motionReduce={{ transition: 'none' }}
    _hover={href ? { boxShadow: hoverShadow, borderBottomColor: '#7ea6ff', transform: 'translateY(-2px)', _motionReduce: { transform: 'none' } } : undefined}
    _focusVisible={{ outlineColor: '#4b83ff', bg: 'janeq.library' }}
    css={{
      '@media (max-width: 359px)': { px: '2.5', gap: '2' },
      ...(href ? {
        '&:is(:hover, :focus-visible) .mode-icon': { transform: 'translateY(-2px)', _motionReduce: { transform: 'none' } },
        '&:is(:hover, :focus-visible) .mode-icon-shadow': { transform: 'translateX(-3px)', _motionReduce: { transform: 'none' } },
      } : {}),
    }}>
    {href ? <a href={href}>{content}</a> : <span role="link" aria-disabled="true">{content}</span>}
  </Flex>
}

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
  const [direction, setDirection] = useState(0)
  const [answerFirst, setAnswerFirst] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [settings, setSettings] = useState(false)
  const [stars, setStars] = useState(() => readStars(starKey))
  const card = order[index]
  const showingAnswer = answerFirst !== flipped
  const changeCard = useCallback((nextIndex: number, nextDirection: number) => {
    setDirection(nextDirection)
    setIndex(nextIndex)
    setFlipped(false)
  }, [])

  useEffect(() => {
    if (!autoplay || settings) return
    const timer = window.setTimeout(() => {
      if (!flipped) setFlipped(true)
      else if (index + 1 < order.length) changeCard(index + 1, 1)
      else setAutoplay(false)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [autoplay, changeCard, flipped, index, order.length, settings])

  function move(offset: -1 | 1) {
    setAutoplay(false)
    const nextIndex = index + offset
    if (nextIndex >= 0 && nextIndex < order.length) changeCard(nextIndex, offset)
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
    changeCard(0, 0)
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

  const starred = stars.includes(card.id)
  return <>
    <Flex data-study-preview direction="column" h="500px" bg="white" rounded="xl" boxShadow={flashcardShadow} overflow="hidden" minW="0" pb="1">
      <Box bg="#ffa54c" h="1" flexShrink="0" w={`${(index + 1) / order.length * 100}%`}
        transition="width 100ms ease-in-out" _motionReduce={{ transition: 'none' }} />
      <Flex direction="column" flex="1" minH="0" p="8">
        <Grid templateColumns="repeat(3, minmax(0, 1fr))" alignItems="center">
          <Text color="#718096" fontWeight="bold">{showingAnswer ? 'Answer' : 'Question'}</Text>
          <Text fontSize="lg" fontWeight="bold" textAlign="center" aria-live="polite">{index + 1} / {order.length}</Text>
          <IconButton justifySelf="end" variant="ghost" size="sm" boxSize="8" minW="8" rounded="full" border="0" color={actionColor}
            css={iconSize} _hover={{ bg: actionHover }} aria-label={starred ? 'Unstar question' : 'Star question'}
            aria-pressed={starred} onClick={() => toggleStar(card.id)}>{starred ? <IconStarFilled /> : <IconStar />}</IconButton>
        </Grid>
        <PreviewCard card={card} flipped={flipped} answerFirst={answerFirst} direction={direction}
          onFlip={() => { setAutoplay(false); setFlipped((value) => !value) }} onMove={move} />
        <Grid templateColumns="1fr 1fr" gap="4">
          <IconButton {...previewOutline} h="12" color="janeq.ink" aria-label="Previous card" disabled={index === 0} onClick={() => move(-1)}><IconChevronLeft /></IconButton>
          <IconButton {...previewOutline} h="12" color="janeq.ink" aria-label="Next card" disabled={index + 1 === order.length} onClick={() => move(1)}><IconChevronRight /></IconButton>
        </Grid>
      </Flex>
    </Flex>
    <Stack gap="4" minW="0">
      <Grid templateColumns={{ base: 'repeat(2, minmax(0, 1fr))', lg: '1fr' }} gap="3">
        <Button {...previewOutline} h="10" color={actionColor} fontFamily="body" fontSize="md" fontWeight="semibold"
          disabled={cards.length < 2} onClick={shuffleCards}><IconArrowsShuffle /> Shuffle</Button>
        <Button {...previewOutline} h="10" color={actionColor} fontFamily="body" fontSize="md" fontWeight="semibold"
          _pressed={{ bg: '#1a5fff', color: 'white', borderColor: '#1a5fff', _hover: { bg: '#4b83ff' } }}
          aria-pressed={autoplay} onClick={() => setAutoplay((value) => !value)}><IconPlayerPlay /> Autoplay</Button>
      </Grid>
      <Button hideBelow="lg" variant="ghost" h="10" rounded="lg" border="0" color={actionColor} fontFamily="body" fontSize="md"
        fontWeight="semibold" css={iconSize} _hover={{ bg: actionHover }} onClick={() => setSettings(true)}><IconSettings /> Settings</Button>
      <IconButton hideFrom="lg" alignSelf="end" variant="ghost" rounded="full" border="0" color="janeq.ink" css={iconSize}
        aria-label="Settings" onClick={() => setSettings(true)}><IconSettings /></IconButton>
    </Stack>
    <Dialog.Root open={settings} onOpenChange={({ open }) => setSettings(open)} placement="center">
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
        <Dialog.Header><Dialog.Title>Flashcard preview settings</Dialog.Title></Dialog.Header>
        <Dialog.Body>
          <SettingsSwitch label="Show the answer first" checked={answerFirst} onCheckedChange={({ checked }) => {
            setAnswerFirst(checked)
            setFlipped(false)
          }} />
        </Dialog.Body>
        <Dialog.Footer><Dialog.ActionTrigger asChild><PrimaryButton>Done</PrimaryButton></Dialog.ActionTrigger></Dialog.Footer>
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

  return <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: '10rem minmax(0, 1fr) 10rem' }} gap="8" alignItems="start">
    <Grid as="nav" aria-label="Study modes" templateColumns={{ base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: '1fr' }} gap="4">
      <ModeCard label="Learn" icon={<IconBrain size={24} stroke={2} />} href={learnHref(setId)} />
      <ModeCard label="Flashcards" icon={<IconCards size={24} stroke={2} />} />
      <ModeCard label="Test" icon={<IconReport size={24} stroke={2} />} />
    </Grid>
    {!cards && !error ? <VisuallyHidden role="status">Loading flashcard preview…</VisuallyHidden> : null}
    {cards ? <Preview cards={cards} starKey={`janeq:preview-stars:v1:${username}:${setId}`} /> : null}
    {error ? <Stack align="start" role="alert"><Text color="red.700">{error}</Text><Button variant="outline" onClick={() => {
      setError('')
      setAttempt((value) => value + 1)
    }}>Try again</Button></Stack> : null}
  </Grid>
}
