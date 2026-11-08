import { Box, chakra } from '@chakra-ui/react'
import { AnimatePresence, domAnimation, LazyMotion, type Variants } from 'motion/react'
import * as m from 'motion/react-m'
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { StudyCard } from '../learn/api'
import { useReducedMotion } from './use-reduced-motion'

const swipeDistance = 48
const tapSlop = 10
const scrollLine = 40
const slide: Variants = {
  enter: (direction: number) => ({ x: direction * 120, opacity: direction ? 0 : 1 }),
  visible: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -120, opacity: direction ? 0 : 1 }),
}
const faceStyles = {
  position: 'absolute', inset: '0', display: 'grid', placeItems: 'safe center',
  px: '3', py: '3', overflowY: 'auto', touchAction: 'pan-y', backfaceVisibility: 'hidden',
} as const

export function PreviewCard({ card, flipped, answerFirst, direction, onPointerStart, onFlip, onMove }: {
  card: StudyCard
  flipped: boolean
  answerFirst: boolean
  direction: number
  onPointerStart: () => void
  onFlip: () => void
  onMove: (offset: -1 | 1) => void
}) {
  const reduceMotion = useReducedMotion()
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const answer = card.answers.join('\n')
  const showingAnswer = answerFirst !== flipped
  const slideDirection = reduceMotion ? 0 : direction

  function startPointer(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    suppressClick.current = false
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    onPointerStart()
  }

  function trackPointer(event: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    // Returning to the start cancels a drag without turning it back into a tap.
    if (Math.max(Math.abs(dx), Math.abs(dy)) > tapSlop) suppressClick.current = true
    return { dx, dy }
  }

  function endPointer(event: PointerEvent<HTMLButtonElement>) {
    const offset = trackPointer(event)
    if (!offset) return
    pointer.current = null
    const { dx, dy } = offset
    if (Math.abs(dx) >= swipeDistance && Math.abs(dx) > Math.abs(dy)) onMove(dx < 0 ? 1 : -1)
  }

  function cancelPointer(event: PointerEvent<HTMLButtonElement>) {
    if (pointer.current?.id !== event.pointerId) return
    pointer.current = null
    suppressClick.current = true
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (!event.repeat) onMove(event.key === 'ArrowLeft' ? -1 : 1)
      return
    }

    // The flip button keeps focus while the active face scrolls.
    const face = event.currentTarget.querySelector<HTMLElement>(
      `[data-preview-card="${CSS.escape(card.id)}"] [data-active-face="true"]`,
    )
    if (!face || face.scrollHeight <= face.clientHeight) return
    const page = face.clientHeight - scrollLine
    switch (event.key) {
      case 'ArrowUp': face.scrollTop -= scrollLine; break
      case 'ArrowDown': face.scrollTop += scrollLine; break
      case 'PageUp': face.scrollTop -= page; break
      case 'PageDown': face.scrollTop += page; break
      case 'Home': face.scrollTop = 0; break
      case 'End': face.scrollTop = face.scrollHeight; break
      default: return
    }
    event.preventDefault()
  }

  return (
    <chakra.button type="button" position="relative" flex="1" minH="0" bg="transparent"
      border="0" rounded="lg" color="inherit" cursor="pointer" textAlign="center"
      whiteSpace="pre-wrap" overflowWrap="anywhere" overflow="hidden"
      fontFamily="heading" fontSize="36px" lineHeight="1.2" fontWeight="400"
      touchAction="pan-y" userSelect="none"
      _focusVisible={{ outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '-2px' }}
      aria-label={`Flip card. ${showingAnswer ? card.answers.join(', ') : card.prompt}`}
      onPointerDown={startPointer}
      onPointerMove={trackPointer}
      onPointerUp={endPointer}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
      onClick={(event) => {
        if (event.detail === 0 || !suppressClick.current) onFlip()
      }}
      onKeyDown={handleKeyDown}>
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence initial={false} custom={slideDirection}>
          <m.span key={card.id} data-preview-card={card.id} aria-hidden="true" custom={slideDirection} variants={slide}
            initial="enter" animate="visible" exit="exit"
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, perspective: 1200 }}>
            <m.span initial={false} animate={{ rotateX: flipped ? 180 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeInOut' }}
              style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
              <Box as="span" {...faceStyles} tabIndex={-1} data-active-face={!flipped} pointerEvents={flipped ? 'none' : 'auto'}>
                {answerFirst ? answer : card.prompt}
              </Box>
              <Box as="span" {...faceStyles} tabIndex={-1} data-active-face={flipped}
                transform="rotateX(180deg)" pointerEvents={flipped ? 'auto' : 'none'}>
                {answerFirst ? card.prompt : answer}
              </Box>
            </m.span>
          </m.span>
        </AnimatePresence>
      </LazyMotion>
    </chakra.button>
  )
}
