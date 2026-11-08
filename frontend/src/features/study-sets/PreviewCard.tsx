import { Box, chakra } from '@chakra-ui/react'
import { AnimatePresence, domAnimation, LazyMotion, useReducedMotion, type Variants } from 'motion/react'
import * as m from 'motion/react-m'
import { useRef, type PointerEvent } from 'react'
import type { StudyCard } from '../learn/api'

const swipeDistance = 48
const tapSlop = 10
const slide: Variants = {
  enter: (direction: number) => ({ x: direction * 120, opacity: direction ? 0 : 1 }),
  visible: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -120, opacity: direction ? 0 : 1 }),
}
const faceStyles = {
  position: 'absolute', inset: '0', display: 'grid', placeItems: 'safe center',
  px: '3', py: '3', overflowY: 'auto', touchAction: 'pan-y', backfaceVisibility: 'hidden',
} as const

export function PreviewCard({ card, flipped, answerFirst, direction, onFlip, onMove }: {
  card: StudyCard
  flipped: boolean
  answerFirst: boolean
  direction: number
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
  }

  function endPointer(event: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current
    if (!start || start.id !== event.pointerId) return
    pointer.current = null
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    // A pointer gesture can also emit a click. Only a tap should flip the card.
    suppressClick.current = Math.max(Math.abs(dx), Math.abs(dy)) > tapSlop
    if (Math.abs(dx) >= swipeDistance && Math.abs(dx) > Math.abs(dy)) onMove(dx < 0 ? 1 : -1)
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
      onPointerUp={endPointer}
      onPointerCancel={() => { pointer.current = null }}
      onClick={(event) => {
        if (event.detail === 0 || !suppressClick.current) onFlip()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          if (!event.repeat) onMove(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}>
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence initial={false} custom={slideDirection}>
          <m.span key={card.id} aria-hidden="true" custom={slideDirection} variants={slide}
            initial="enter" animate="visible" exit="exit"
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, perspective: 1200 }}>
            <m.span initial={false} animate={{ rotateX: flipped ? 180 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeInOut' }}
              style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
              <Box as="span" {...faceStyles} pointerEvents={flipped ? 'none' : 'auto'}>
                {answerFirst ? answer : card.prompt}
              </Box>
              <Box as="span" {...faceStyles} transform="rotateX(180deg)" pointerEvents={flipped ? 'auto' : 'none'}>
                {answerFirst ? card.prompt : answer}
              </Box>
            </m.span>
          </m.span>
        </AnimatePresence>
      </LazyMotion>
    </chakra.button>
  )
}
