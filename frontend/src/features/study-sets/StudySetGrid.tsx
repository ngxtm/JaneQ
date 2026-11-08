import { Avatar, Box, Grid, Heading, HStack, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react'
import { IconProgress } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef } from 'react'
import janeqMark from '../../assets/janeq-mark.svg'
import type { StudySet } from './api'
import { librarySetHref } from './library-navigation'

const gridStyles = {
  templateColumns: 'repeat(auto-fill, minmax(min(100%, 256px), 1fr))',
  gap: '4',
} as const
const cardSkeletonName = 'study-set-card'
const hoverIntentMs = 120
const cardStyles = {
  h: '156px',
  p: '5',
  bg: 'white',
  rounded: 'lg',
  border: '2px solid',
  borderColor: 'gray.200',
  shadow: 'lg',
} as const

function StudySetCard({ set, username, onIntent }: { set: StudySet; username: string; onIntent: (set: StudySet) => void }) {
  const hoverTimer = useRef<number | undefined>(undefined)
  const draft = set.status === 'draft'
  const builtIn = set.source_kind === 'builtin'

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  return (
    <LinkBox
      as="article"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse' || draft) return
        hoverTimer.current = window.setTimeout(() => {
          if (!document.activeElement?.matches('[data-study-set-link]:focus-visible')) onIntent(set)
        }, hoverIntentMs)
      }}
      onPointerLeave={() => window.clearTimeout(hoverTimer.current)}
      {...cardStyles}
      transition="transform 150ms ease-in-out, border-color 150ms ease-in-out"
      _hover={{
        transform: 'translateY(-2px)',
        borderBottomColor: 'blue.400',
        _motionReduce: { transform: 'none' },
      }}
      _motionReduce={{ transition: 'none' }}
      css={{
        '&:has(:focus-visible)': {
          transform: 'translateY(-2px)',
          borderColor: 'janeq.focus',
          _motionReduce: { transform: 'none' },
        },
      }}
    >
      <Stack h="full" justify="space-between" gap="3">
        <Stack gap="2" direction={draft ? 'column-reverse' : 'column'}>
          <Heading as="h3" fontFamily="heading" fontSize="lg" lineHeight="1.25" lineClamp={2} overflowWrap="anywhere">
            <LinkOverlay href={librarySetHref(set)} data-study-set-link onFocus={(event) => {
              if (event.currentTarget.matches(':focus-visible')) onIntent(set)
            }} _focusVisible={{ outline: 'none' }}>{set.title}</LinkOverlay>
          </Heading>
          <HStack color="janeq.muted" gap="1.5" fontSize="sm">
            {draft ? <IconProgress size={16} aria-hidden="true" /> : null}
            <Text>{draft ? 'Draft' : 'Ready'}</Text>
            <Text aria-hidden="true">·</Text>
            <Text>{set.question_count} {set.question_count === 1 ? 'question' : 'questions'}</Text>
          </HStack>
        </Stack>
        <HStack gap="2" fontSize="sm" fontWeight="600">
          <Avatar.Root size="xs">
            <Avatar.Fallback name={builtIn ? 'JaneQ' : username} />
            {builtIn ? <Avatar.Image src={janeqMark} alt="" /> : null}
          </Avatar.Root>
          <Text truncate>{builtIn ? 'JaneQ' : username}</Text>
        </HStack>
      </Stack>
    </LinkBox>
  )
}

export function StudySetGrid({ sets, username, onIntent, captureCard = false }: {
  sets: StudySet[]
  username: string
  onIntent: (set: StudySet) => void
  captureCard?: boolean
}) {
  return (
    <Grid {...gridStyles}>
      {sets.map((set, index) => captureCard && index === 0 ? (
        <Skeleton key={set.id} name={cardSkeletonName} loading={false}>
          <StudySetCard set={set} username={username} onIntent={onIntent} />
        </Skeleton>
      ) : <StudySetCard key={set.id} set={set} username={username} onIntent={onIntent} />)}
    </Grid>
  )
}

export function StudySetGridPlaceholder({ count, visible }: { count: number; visible: boolean }) {
  return (
    <Grid {...gridStyles} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Box key={index} h={cardStyles.h}>
          {/* The grid owns responsive rows. Boneyard only paints inside one fixed-height card. */}
          {visible ? (
            <Skeleton name={cardSkeletonName} loading animate="solid" color="var(--chakra-colors-janeq-divider)">
              {null}
            </Skeleton>
          ) : null}
        </Box>
      ))}
    </Grid>
  )
}
