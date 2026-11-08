import { Box, Button, Center, Heading, Text, VStack } from '@chakra-ui/react'
import { IconBook2, IconBooks, IconMathPi, IconRotateClockwise2, IconSquareRoot2 } from '@tabler/icons-react'
import janeqMark from '../../assets/janeq-mark.svg?no-inline'
import { UiProvider } from '../../ui/UiProvider'
import styles from './session-unavailable.module.css'

type SessionUnavailableProps = { retrying: boolean; onRetry: () => void }

function StudyBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <svg className={styles.orbits} viewBox="0 0 1280 720" preserveAspectRatio="none" focusable="false">
        <ellipse cx="640" cy="360" rx="418" ry="215" vectorEffect="non-scaling-stroke" />
        <ellipse cx="640" cy="360" rx="506" ry="269" vectorEffect="non-scaling-stroke" />
        <ellipse cx="640" cy="360" rx="595" ry="324" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={`${styles.symbol} ${styles.book}`}><IconBook2 stroke={1.5} /></span>
      <span className={`${styles.symbol} ${styles.pi}`}><IconMathPi stroke={1.5} /></span>
      <span className={`${styles.symbol} ${styles.root}`}><IconSquareRoot2 stroke={1.5} /></span>
      <span className={`${styles.symbol} ${styles.books}`}><IconBooks stroke={1.5} /></span>
    </div>
  )
}

export default function SessionUnavailable({ retrying, onRetry }: SessionUnavailableProps) {
  return (
    <UiProvider>
      <Center as="main" minH="100svh" px="6" py="10" textAlign="center" pos="relative"
        bg="janeq.library" color="janeq.ink" fontFamily="body">
        <StudyBackdrop />
        <VStack gap={{ base: '6', md: '8' }} pos="relative">
          <Box className={styles.mark} boxSize={{ base: '32', md: '52' }} opacity="0.24"
            css={{ maskImage: 'linear-gradient(black 15%, transparent 94%)' }} aria-hidden="true">
            <svg viewBox="0 0 100 100" width="100%" height="100%" focusable="false">
              <use href={`${janeqMark}#janeq-mark-body`} />
              <use href={`${janeqMark}#janeq-mark-tassel`} className={styles.tassel} />
            </svg>
          </Box>
          <VStack role="alert" gap={{ base: '4', md: '5' }} maxW="36rem">
            <Heading as="h1" fontFamily="heading" fontSize={{ base: '4xl', md: '6xl' }}
              fontWeight="700" lineHeight="1.05" textWrap="balance">
              Could not connect to JaneQ.
            </Heading>
            <Text color="janeq.muted" fontSize={{ base: 'md', md: 'lg' }} textWrap="balance">
              We couldn’t check your session. Please try again in a moment.
            </Text>
          </VStack>
          <Button type="button" variant="outline" minH="11" px="4" borderRadius="lg"
            fontFamily="body" color="janeq.ink" bg="white" borderColor="janeq.line"
            focusRingColor="janeq.focus" _hover={{ bg: 'blue.50' }} onClick={onRetry}
            aria-busy={retrying || undefined} aria-disabled={retrying || undefined}>
            <span className={retrying ? styles.retryIcon : undefined} aria-hidden="true">
              <IconRotateClockwise2 size={18} />
            </span>
            Try again
          </Button>
        </VStack>
      </Center>
    </UiProvider>
  )
}
