import { Box, Flex, Grid, Heading, HStack, Link, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowRight } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { isUnauthorized } from '../../http'
import { historyHref, historyResultHref } from '../navigation/app-location'
import type { TestAttemptSummary } from '../test/api'
import { listTestAttempts } from './api'
import { formatAttemptScore, formatAttemptTime } from './attempt-format'
import { AttemptModeBadge } from './AttemptModeBadge'

export function SetHistorySection({
  setId,
  onSessionExpired,
}: {
  setId: string
  onSessionExpired?: () => void
}) {
  const [recentAttempts, setRecentAttempts] = useState<TestAttemptSummary[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    listTestAttempts(controller.signal, { limit: 3, set_id: setId })
      .then((page) => {
        if (!controller.signal.aborted) {
          setRecentAttempts(page.attempts)
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isUnauthorized(error)) {
          onSessionExpired?.()
        }
        setRecentAttempts([])
      })

    return () => controller.abort()
  }, [setId, onSessionExpired])

  if (!recentAttempts || recentAttempts.length === 0) {
    return null
  }

  return (
    <Stack as="section" aria-labelledby="set-history-heading" gridColumn={{ lg: '2' }} gap="2">
      <Flex justify="space-between" align="center" wrap="wrap" columnGap="3" rowGap="1">
        <Heading as="h2" id="set-history-heading" fontFamily="heading" fontSize={{ base: 'md', lg: 'lg' }}>
          Recent test attempts
        </Heading>
        <Link
          href={historyHref}
          fontSize="sm"
          color="janeq.blue"
          py="1"
          focusVisibleRing="outside"
          focusRingColor="janeq.focus"
        >
          View all history <IconArrowRight size={16} aria-hidden="true" />
        </Link>
      </Flex>
      <Grid as="ul" templateColumns={{ base: 'minmax(0, 1fr)', lg: 'repeat(auto-fit, minmax(0, 1fr))' }}
        gap="2" m="0" p="0" listStyleType="none">
        {recentAttempts.map((attempt, index) => (
          <Box as="li" key={attempt.attempt_id} hideBelow={index > 0 ? 'lg' : undefined}>
            <Link
              href={historyResultHref(attempt.attempt_id)}
              display="flex"
              flexDirection="column"
              alignItems="stretch"
              gap="1"
              h="full"
              px="3"
              py="2"
              bg="white"
              rounded="lg"
              borderWidth="1px"
              borderColor="janeq.divider"
              _hover={{ borderColor: 'janeq.focus', bg: 'blue.50', textDecoration: 'none' }}
              focusVisibleRing="outside"
              focusRingColor="janeq.focus"
            >
              <VisuallyHidden>Review attempt</VisuallyHidden>
              <HStack gap="2" rowGap="1" flexWrap="wrap">
                <Text fontSize="sm" fontWeight="semibold" color="janeq.ink">
                  {formatAttemptScore(attempt)}
                </Text>
                <AttemptModeBadge mode={attempt.mode} time_per_question={attempt.time_per_question} />
              </HStack>
              <HStack gap="2" justify="space-between" color="janeq.blue">
                <Text asChild color="janeq.muted" fontSize="xs">
                  <time dateTime={attempt.submitted_at}>{formatAttemptTime(attempt.submitted_at)}</time>
                </Text>
                <IconArrowRight size={16} aria-hidden="true" />
              </HStack>
            </Link>
          </Box>
        ))}
      </Grid>
    </Stack>
  )
}
