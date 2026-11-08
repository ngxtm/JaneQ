import { readPdfMark, type PdfMark } from './pdf-mark'
import type { ResultReview } from './result-review'

export type PdfRequest = { result: ResultReview; mark: PdfMark; exportedAt: Date }
export type PdfReply =
  | { kind: 'success'; file: Blob }
  | { kind: 'unsupported-text' }
  | { kind: 'error' }

export async function generateResultPdf(result: ResultReview, signal: AbortSignal): Promise<PdfReply> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
  deadline.throwIfAborted()
  // A fresh worker can load its scripts again after a failed request.
  const worker = new Worker(new URL('./result-pdf.worker.tsx', import.meta.url), { type: 'module' })
  let abort: (() => void) | undefined
  try {
    return await new Promise<PdfReply>((resolve, reject) => {
      abort = () => reject(deadline.reason)
      deadline.addEventListener('abort', abort, { once: true })
      worker.onmessage = ({ data }: MessageEvent<PdfReply>) => resolve(data)
      worker.onerror = (event) => {
        event.preventDefault()
        reject(new Error('Could not start the PDF worker.'))
      }
      worker.onmessageerror = () => reject(new Error('Could not read the PDF worker response.'))
      const request: PdfRequest = { result, mark: readPdfMark(), exportedAt: new Date() }
      worker.postMessage(request)
    })
  } finally {
    if (abort) deadline.removeEventListener('abort', abort)
    worker.terminate()
  }
}
