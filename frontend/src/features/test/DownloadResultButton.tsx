import { Spinner, Text } from '@chakra-ui/react'
import { IconDownload } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../ui/PrimaryButton'
import type { TestResult } from './api'

function downloadPdf(file: Blob, setId: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = `${setId.replace(/[^a-zA-Z0-9_-]/g, '-')}-test-results.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  // Leave the URL available until the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DownloadResultButton({ result, onError }: { result: TestResult; onError: (error: string) => void }) {
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
      const [{ pdf }, { ResultPdf }] = await Promise.all([import('@react-pdf/renderer'), import('./ResultPdf')])
      if (controller.signal.aborted) return
      const file = await pdf(<ResultPdf result={result} exportedAt={new Date()} />).toBlob()
      if (!controller.signal.aborted) downloadPdf(file, result.set_id)
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
