import { Box, Button, Flex, Heading, HStack, LinkBox, LinkOverlay, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef } from 'react'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { createSetHref, studySetHref } from '../navigation/app-location'
import type { StudySet } from '../study-sets/api'
import { librarySetHref } from '../study-sets/library-navigation'
import './bones/registry'

function SetRow({ set }: { set: StudySet }) {
  return (
    <LinkBox display="flex" alignItems="center" justifyContent="space-between" gap="4" p="5" bg="white"
      border="1px solid" borderColor="janeq.divider" rounded="xl" _hover={{ borderColor: 'blue.400' }}>
      <Stack minW="0" gap="1">
        <Heading as="h2" fontFamily="heading" fontSize="lg" overflowWrap="anywhere">
          <LinkOverlay href={librarySetHref(set)} cursor="pointer" _focusVisible={{
            outline: 'none',
            _before: { outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '2px', rounded: 'xl' },
          }}>{set.title}</LinkOverlay>
        </Heading>
        <HStack gap="2" flexWrap="wrap" color="janeq.muted" fontSize="sm">
          <Text fontWeight="semibold">{set.status === 'draft' ? 'Draft' : 'Ready'}</Text>
          <Text aria-hidden="true">·</Text>
          <Text>{set.question_count} {set.question_count === 1 ? 'question' : 'questions'}</Text>
        </HStack>
      </Stack>
      <Button asChild variant="outline" size="sm" fontFamily="body" flexShrink="0" aria-label={`Edit ${set.title}`}>
        <a href={studySetHref(set.id, 'editor')}>Edit</a>
      </Button>
    </LinkBox>
  )
}

export default function MySets({ sets, status, showSkeleton, onRetry }: {
  sets: StudySet[]
  status: 'loading' | 'loaded' | 'error'
  showSkeleton: boolean
  onRetry: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  const ownSets = sets.filter((set) => set.source_kind === 'custom')
  const empty = status === 'loaded' && ownSets.length === 0
  return (
    <Stack gap="6" maxW="4xl" mx="auto">
      <Flex gap="4" wrap="wrap" align="center" justify="space-between">
        <Stack gap="1">
          <Heading as="h1" ref={heading} tabIndex={-1} size="3xl" _focus={{ outline: 'none' }}>My sets</Heading>
          <Text color="janeq.muted">Create and manage your study sets.</Text>
        </Stack>
        {!empty ? <PrimaryButton asChild fontFamily="body"><a href={createSetHref}><IconPlus size={18} /> Create set</a></PrimaryButton> : null}
      </Flex>
      {status === 'loading' ? (
        <Box aria-busy="true">
          <VisuallyHidden role="status">Loading your sets…</VisuallyHidden>
          {showSkeleton ? <Box aria-hidden="true"><Skeleton name="my-set-row" loading animate="solid">{null}</Skeleton></Box> : null}
        </Box>
      ) : null}
      {status === 'error' ? (
        <Stack align="start" gap="3" p="5" bg="white" rounded="xl" border="1px solid" borderColor="janeq.divider">
          <HStack align="start" gap="3">
            <IconFolder size={24} aria-hidden="true" />
            <Stack gap="1" role="alert">
              <Heading as="h2" size="md">Could not load your study sets</Heading>
              <Text color="janeq.muted">Try loading My sets again to see your saved sets and drafts.</Text>
            </Stack>
          </HStack>
          <Button variant="outline" fontFamily="body" onClick={onRetry}>Try again</Button>
        </Stack>
      ) : null}
      {empty ? (
        <Stack align="center" textAlign="center" gap="4" bg="white" rounded="2xl" border="1px solid"
          borderColor="janeq.divider" p={{ base: '8', md: '12' }}>
          <Flex aria-hidden="true" align="center" justify="center" boxSize="16" rounded="2xl" bg="blue.50" color="blue.700">
            <IconFolder size={32} />
          </Flex>
          <Heading as="h2" size="xl">Create your first study set</Heading>
          <Text color="janeq.muted" maxW="sm">Add your own questions and save a draft to finish whenever you’re ready.</Text>
          <PrimaryButton asChild fontFamily="body"><a href={createSetHref}><IconPlus size={18} /> Create set</a></PrimaryButton>
        </Stack>
      ) : null}
      {ownSets.length ? (
        <Stack as="ul" gap="3" listStyleType="none">
          {ownSets.map((set, index) => (
            <Box as="li" key={set.id}>
              {index === 0 ? <Skeleton name="my-set-row" loading={false}><SetRow set={set} /></Skeleton> : <SetRow set={set} />}
            </Box>
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}
