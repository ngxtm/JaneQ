import { BProgress } from '@bprogress/core'
import './preview-progress.css'

export function showPreviewProgressIfSlow() {
  let started = false
  const timer = window.setTimeout(() => {
    BProgress.configure({ indeterminate: true, showSpinner: false, trickle: false, speed: 0 }).start()
    started = true
  }, 180)

  return () => {
    window.clearTimeout(timer)
    if (started) {
      started = false
      BProgress.done()
    }
  }
}
