import { IconHome } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { StudyErrorScreen } from '../../ui/StudyErrorScreen'
import styles from '../../ui/study-error-screen.module.css'

export default function NotFoundPage({ studySet = false }: { studySet?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const title = studySet ? 'Study set not found' : 'Page not found'
  const description = studySet
    ? 'This study set may have moved or been removed. Head home to choose an available set.'
    : 'This link may be outdated or mistyped. Head home to get back to your study sets.'

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} | JaneQ`
    if (document.activeElement === document.body) heading.current?.focus()
    return () => { document.title = previousTitle }
  }, [title])

  return (
    <StudyErrorScreen
      title={<><span className={`${styles.accent} ${styles.statusCode}`}>404</span>{' '}{title}</>}
      description={description}
      headingRef={heading}
    >
      <PrimaryButton asChild minH="11" px="4" borderRadius="lg" fontFamily="body">
        <a href={studySet ? '#home' : import.meta.env.BASE_URL}>
          <IconHome size={18} aria-hidden="true" /> Back to Home
        </a>
      </PrimaryButton>
    </StudyErrorScreen>
  )
}
