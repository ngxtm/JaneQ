import { Box, Button, Dialog, Flex, Grid, IconButton, Portal, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import {
  IconArrowsShuffle, IconBrain, IconChevronLeft, IconChevronRight, IconReport,
  IconPlayerPlay, IconSettings, IconStar, IconStarFilled,
} from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { httpErrorMessage, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { SettingsSwitch } from '../../ui/SettingsSwitch'
import type { StudyCard } from '../learn/api'
import { navigateLibrary, studySetHref } from '../navigation/app-location'
import { SetHistorySection } from '../test-history/SetHistorySection'
import { TestModeDialog } from '../test/TestModeDialog'
import { saveTestMode, type TestMode } from '../test/test-mode'
import { PreviewCard } from './PreviewCard'
import { showPreviewProgressIfSlow } from './preview-progress'

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
const previewHeight = { base: 'clamp(17.5rem, 42svh, 27rem)', lg: 'clamp(20rem, 50svh, 31.25rem)' }
const previewSkeletonName = 'flashcard-preview'
const previewSkeletonDelayMs = 200

function ModeCard({ label, icon, href, onClick }: { label: string; icon: ReactNode; href?: string; onClick?: () => void }) {
  const content = (
    <>
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
  )

  const cardStyle = {
    align: 'center' as const, gap: '3', py: '4', px: '5', rounded: 'xl', bg: 'white', color: 'janeq.ink',
    border: '1px solid', borderColor: 'janeq.divider', borderBottomWidth: '3px',
    boxShadow: modeShadow, minW: '0', outline: '2px solid transparent', outlineOffset: '2px',
    transition: 'transform 150ms ease-in-out, border-color 150ms ease-in-out, box-shadow 150ms ease-in-out',
    _motionReduce: { transition: 'none' },
    _hover: { boxShadow: hoverShadow, borderBottomColor: '#7ea6ff', transform: 'translateY(-2px)', _motionReduce: { transform: 'none' } },
    _focusVisible: { outlineColor: 'janeq.focus', bg: 'janeq.library' },
    css: {
      '@media (max-width: 359px)': { px: '2.5', gap: '2' },
      '&:is(:hover, :focus-visible) .mode-icon': { transform: 'translateY(-2px)', _motionReduce: { transform: 'none' } },
      '&:is(:hover, :focus-visible) .mode-icon-shadow': { transform: 'translateX(-3px)', _motionReduce: { transform: 'none' } },
    },
  }

  if (onClick) {
    return (
      <Button {...cardStyle} variant="plain" fontFamily="body" justifyContent="start" cursor="pointer"
        textAlign="left" h="auto" w="full" onClick={onClick}>
        {content}
      </Button>
    )
  }

  return (
    <Flex asChild {...cardStyle}>
      <a href={href}>{content}</a>
    </Flex>
  )
}

function readStars(key: string, legacyKey?: string): string[] {
  try {
    const stored = window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null)
    const data: unknown = JSON.parse(stored ?? '[]')
    return Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function Preview({ cards, starKey, legacyStarKey }: { cards: StudyCard[]; starKey: string; legacyStarKey?: string }) {
  const [order, setOrder] = useState(cards)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [answerFirst, setAnswerFirst] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [settings, setSettings] = useState(false)
  const [stars, setStars] = useState(() => readStars(starKey, legacyStarKey))
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
  const previewCard = (
    <Flex data-study-preview direction="column" h={previewHeight} bg="white" rounded="xl" boxShadow={flashcardShadow} overflow="hidden" minW="0" pb="1">
      <Box bg="#ffa54c" h="1" flexShrink="0" w={`${(index + 1) / order.length * 100}%`}
        transition="width 100ms ease-in-out" _motionReduce={{ transition: 'none' }} />
      <Flex direction="column" flex="1" minH="0" p={{ base: '5', lg: '8' }}>
        <Grid templateColumns="repeat(3, minmax(0, 1fr))" alignItems="center">
          <Text color="#718096" fontWeight="bold">{showingAnswer ? 'Answer' : 'Question'}</Text>
          <Text fontSize="lg" fontWeight="bold" textAlign="center" aria-live="polite">{index + 1} / {order.length}</Text>
          <IconButton justifySelf="end" variant="ghost" size="sm" boxSize="8" minW="8" rounded="full" border="0" color={actionColor}
            css={iconSize} _hover={{ bg: actionHover }} aria-label={starred ? 'Unstar question' : 'Star question'}
            aria-pressed={starred} onClick={() => toggleStar(card.id)}>{starred ? <IconStarFilled /> : <IconStar />}</IconButton>
        </Grid>
        <PreviewCard card={card} flipped={flipped} answerFirst={answerFirst} direction={direction}
          onPointerStart={() => setAutoplay(false)}
          onFlip={() => { setAutoplay(false); setFlipped((value) => !value) }} onMove={move} />
        <Grid templateColumns="1fr 1fr" gap="4">
          <IconButton {...previewOutline} h="12" color="janeq.ink" aria-label="Previous card" disabled={index === 0} onClick={() => move(-1)}><IconChevronLeft /></IconButton>
          <IconButton {...previewOutline} h="12" color="janeq.ink" aria-label="Next card" disabled={index + 1 === order.length} onClick={() => move(1)}><IconChevronRight /></IconButton>
        </Grid>
      </Flex>
    </Flex>
  )
  return <>
    <Skeleton name={previewSkeletonName} loading={false}>{previewCard}</Skeleton>
    <Grid templateColumns={{ base: 'repeat(2, minmax(0, 1fr)) auto', lg: '1fr' }} gap={{ base: '2', lg: '3' }} minW="0">
      <Button {...previewOutline} h="10" px="2" color={actionColor} fontFamily="body" fontSize="md" fontWeight="semibold"
        disabled={cards.length < 2} onClick={shuffleCards}><IconArrowsShuffle /> Shuffle</Button>
      <Button {...previewOutline} h="10" px="2" color={actionColor} fontFamily="body" fontSize="md" fontWeight="semibold"
        _pressed={{ bg: '#1a5fff', color: 'white', borderColor: '#1a5fff', _hover: { bg: '#4b83ff' } }}
        aria-pressed={autoplay} onClick={() => setAutoplay((value) => !value)}><IconPlayerPlay /> Autoplay</Button>
      <Button hideBelow="lg" mt="1" variant="ghost" h="10" rounded="lg" border="0" color={actionColor} fontFamily="body" fontSize="md"
        fontWeight="semibold" css={iconSize} _hover={{ bg: actionHover }} onClick={() => setSettings(true)}><IconSettings /> Settings</Button>
      <IconButton hideFrom="lg" variant="ghost" rounded="full" border="0" color="janeq.ink" css={iconSize}
        aria-label="Settings" onClick={() => setSettings(true)}><IconSettings /></IconButton>
    </Grid>
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

export function StudySetModes({ setId, legacyId, username, onSessionExpired, loadPreview }: {
  setId: string
  legacyId: string | null
  username: string
  onSessionExpired: () => void
  loadPreview: (id: string) => Promise<StudyCard[]>
}) {
  const [cards, setCards] = useState<StudyCard[]>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const pending = !cards && !error

  useEffect(() => {
    let active = true
    const stopProgress = showPreviewProgressIfSlow()
    const skeletonTimer = window.setTimeout(() => setShowSkeleton(true), previewSkeletonDelayMs)
    function stopLoading() {
      window.clearTimeout(skeletonTimer)
      stopProgress()
    }
    loadPreview(setId).then((items) => {
      if (active) setCards(items)
    }).catch((failure: unknown) => {
      if (!active) return
      if (isUnauthorized(failure)) onSessionExpired()
      else setError(httpErrorMessage(failure, 'Could not load the flashcard preview.'))
    }).finally(stopLoading)
    return () => {
      active = false
      stopLoading()
    }
  }, [attempt, loadPreview, onSessionExpired, setId])

  const [showTestMode, setShowTestMode] = useState(false)

  function handleSelectMode(mode: TestMode) {
    saveTestMode(setId, mode)
    setShowTestMode(false)
    navigateLibrary(studySetHref(setId, 'test'))
  }

  return (
    <>
      <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: '10rem minmax(0, 1fr) 10rem' }}
        columnGap="8" rowGap={{ base: '4', lg: '5' }} alignItems="start">
        <Grid as="nav" aria-label="Study modes" templateColumns={{ base: 'repeat(2, minmax(0, 1fr))', lg: '1fr' }} gap="4">
          <ModeCard label="Learn" icon={<IconBrain size={24} stroke={2} />} href={studySetHref(setId, 'learn')} />
          <ModeCard label="Test" icon={<IconReport size={24} stroke={2} />} onClick={() => setShowTestMode(true)} />
        </Grid>
        {pending ? <>
          <VisuallyHidden role="status">Loading flashcard preview…</VisuallyHidden>
          <Box aria-busy="true" h={previewHeight} minW="0">
            {showSkeleton ? <Box aria-hidden="true" h="full"
              css={{
                // The reserved panel sets the height when the viewport shrinks during loading.
                '& > .preview-skeleton': { height: '100%', minHeight: '0 !important' },
              }}>
              <Skeleton name={previewSkeletonName} className="preview-skeleton" select="viewport"
                loading animate="solid" color="var(--chakra-colors-janeq-divider)">{null}</Skeleton>
            </Box> : null}
          </Box>
        </> : null}
        {cards ? <Preview cards={cards} starKey={`janeq:preview-stars:v1:${username}:${setId}`}
          legacyStarKey={legacyId ? `janeq:preview-stars:v1:${username}:${legacyId}` : undefined} /> : null}
        {error ? <Stack align="start" role="alert"><Text color="red.700">{error}</Text><Button variant="outline" onClick={() => {
          setError('')
          setShowSkeleton(false)
          setAttempt((value) => value + 1)
        }}>Try again</Button></Stack> : null}
        <SetHistorySection setId={setId} onSessionExpired={onSessionExpired} />
      </Grid>
      <TestModeDialog open={showTestMode} onOpenChange={setShowTestMode} onSelectMode={handleSelectMode} />
    </>
  )
}
