import { Avatar, Grid, Heading, HStack, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react'
import { IconProgress } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import janeqMark from '../../assets/janeq-mark.svg'
import type { StudySet } from './api'
import { studySetHref } from './library-navigation'
import './bones/registry'

const columns = 'repeat(auto-fill, minmax(min(100%, 256px), 1fr))'
const cardStyles = {
  h: '156px',
  p: '5',
  bg: 'white',
  rounded: 'lg',
  border: '2px solid',
  borderColor: 'gray.200',
  shadow: 'lg',
} as const

function StudySetCard({ set, username }: { set: StudySet; username: string }) {
  const draft = set.status === 'draft'
  const builtIn = set.source_kind === 'builtin'

  return (
    <LinkBox
      as="article"
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
            <LinkOverlay href={studySetHref(set.id)} _focusVisible={{ outline: 'none' }}>{set.title}</LinkOverlay>
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

export function StudySetGrid({ sets, username }: { sets: StudySet[]; username: string }) {
  return (
    <Grid templateColumns={columns} gap="4">
      {sets.map((set) => <StudySetCard key={set.id} set={set} username={username} />)}
    </Grid>
  )
}

export function BuiltInStudySetGrid({ sets, username, loading }: {
  sets: StudySet[]
  username: string
  loading: boolean
}) {
  return (
    <Skeleton name="built-in-study-sets" loading={loading} select="viewport" animate="solid" color="#e3ebf1">
      <StudySetGrid sets={sets} username={username} />
    </Skeleton>
  )
}
