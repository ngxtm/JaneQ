import { Box, HStack, Text } from '@chakra-ui/react'
import { IconClock } from '@tabler/icons-react'
import { useEffect, useEffectEvent, useState } from 'react'

export type TimedTestTimerProps = {
  clientDeadline: number
  onExpire: () => void
  isSubmitting: boolean
}

function remainingAt(clientDeadline: number): number {
  return Math.max(0, Math.ceil((clientDeadline - performance.now()) / 1000))
}

export function TimedTestTimer({ clientDeadline, onExpire, isSubmitting }: TimedTestTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => remainingAt(clientDeadline))

  const expire = useEffectEvent(() => {
    if (isSubmitting) return false
    onExpire()
    return true
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const remaining = remainingAt(clientDeadline)
      setRemainingSeconds(remaining)
      if (remaining === 0 && expire()) window.clearInterval(intervalId)
    }, 100)

    return () => window.clearInterval(intervalId)
  }, [clientDeadline])

  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor(remainingSeconds / 60) % 60
  const seconds = remainingSeconds % 60
  const formattedTime = hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`

  const isCritical = remainingSeconds <= 5
  const isWarning = remainingSeconds <= 15 && !isCritical

  const colorScheme = isCritical
    ? { color: 'red.600', bg: 'red.50', borderColor: 'red.300' }
    : isWarning
      ? { color: 'orange.600', bg: 'orange.50', borderColor: 'orange.300' }
      : { color: 'blue.600', bg: 'blue.50', borderColor: 'blue.200' }

  return (
    <HStack
      role="timer"
      aria-label={`Time remaining: ${formattedTime}`}
      aria-atomic="true"
      gap="2"
      px="3.5"
      py="1.5"
      rounded="full"
      borderWidth="2px"
      borderStyle="solid"
      borderColor={colorScheme.borderColor}
      bg={colorScheme.bg}
      color={colorScheme.color}
      fontWeight="semibold"
      fontSize="sm"
      userSelect="none"
      transition="background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease"
      css={isCritical ? {
        '@keyframes timer-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: 1 },
          '50%': { transform: 'scale(1.05)', opacity: 0.85 },
        },
        animation: 'timer-pulse 0.9s ease-in-out infinite',
      } : undefined}
      _motionReduce={{ animation: 'none', transform: 'none' }}
    >
      <Box flexShrink={0} display="flex" alignItems="center">
        <IconClock size={18} aria-hidden="true" />
      </Box>
      <Text
        fontFamily="mono"
        fontVariantNumeric="tabular-nums"
        letterSpacing="wider"
        lineHeight="1"
      >
        {formattedTime}
      </Text>
    </HStack>
  )
}
