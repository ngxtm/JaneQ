import { Button } from '@chakra-ui/react'
import { IconRotateClockwise2 } from '@tabler/icons-react'
import { StudyErrorScreen } from '../../ui/StudyErrorScreen'
import styles from '../../ui/study-error-screen.module.css'

type SessionUnavailableProps = { retrying: boolean; onRetry: () => void }

export default function SessionUnavailable({ retrying, onRetry }: SessionUnavailableProps) {
  return (
    <StudyErrorScreen
      title={<>Could not connect to <span className={styles.accent}>JaneQ</span>.</>}
      description="We couldn’t check your session. Please try again in a moment."
      announce
    >
      <Button type="button" variant="outline" minH="11" px="4" borderRadius="lg"
        fontFamily="body" color="janeq.ink" bg="white" borderColor="janeq.line"
        focusRingColor="janeq.focus" _hover={{ bg: 'blue.50' }} onClick={onRetry}
        aria-busy={retrying || undefined} aria-disabled={retrying || undefined}>
        <span className={retrying ? styles.retryIcon : undefined} aria-hidden="true">
          <IconRotateClockwise2 size={18} />
        </span>
        Try again
      </Button>
    </StudyErrorScreen>
  )
}
