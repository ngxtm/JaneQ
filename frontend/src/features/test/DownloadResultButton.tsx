import { Spinner, Text } from '@chakra-ui/react'
import { IconDownload } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { historyResultHref, navigateLibrary } from '../navigation/app-location'
import { archiveResultPdf, generateResultPdf } from './pdf-download'
import type { ResultReview } from './result-review'

function downloadPdf(file: Blob, title: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  const name = title.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')
  link.download = `${name || 'study-set'}-test-results.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  // Leave the URL available until the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DownloadResultButton({ result, onError, onSessionExpired }: {
  result: ResultReview
  onError: (error: string) => void
  onSessionExpired: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => () => pending.current?.abort(), [])

  async function download() {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setGenerating(true)
    onError('')
    try {
      const reply = await generateResultPdf(result, controller.signal)
      if (controller.signal.aborted) return
      if (reply.kind === 'unsupported-text') {
        onError('The report contains characters the PDF fonts cannot display.')
        return
      }
      if (reply.kind === 'error') throw new Error('Could not generate the PDF.')
      try {
        await archiveResultPdf(result.attempt_id, reply.file, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) return
        if (isUnauthorized(error)) {
          // Resume at the saved attempt, even when the download began on the Test route.
          navigateLibrary(historyResultHref(result.attempt_id))
          onSessionExpired()
          return
        }
        onError('Could not save the repository copy. Select Download PDF to try again.')
        return
      }
      if (!controller.signal.aborted) downloadPdf(reply.file, result.title)
    } catch {
      if (!controller.signal.aborted) onError('Could not create the PDF. Select Download PDF to try again.')
    } finally {
      pending.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }

  return (
    <>
      <PrimaryButton onClick={download} loading={generating} loadingText="Download PDF"
        spinner={<Spinner size="sm" _motionReduce={{ animation: 'none' }} />}>
        <IconDownload size={18} aria-hidden="true" /> Download PDF
      </PrimaryButton>
      {generating ? <Text srOnly role="status">Preparing PDF…</Text> : null}
    </>
  )
}
