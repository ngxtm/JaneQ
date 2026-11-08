import { Button, Dialog, Link, Portal, Text } from '@chakra-ui/react'
import { useRef } from 'react'
import { mySetsHref, studySetHref } from '../navigation/app-location'

export function DeleteSetDialog({ id, title, open, busy, issue, onClose, onConfirm }: {
  id: string
  title: string
  open: boolean
  busy: boolean
  issue: { message: string; status?: number }
  onClose: () => void
  onConfirm: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)

  return (
    <Dialog.Root role="alertdialog" open={open} placement="center" initialFocusEl={() => cancel.current}
      closeOnEscape={!busy} closeOnInteractOutside={!busy} onOpenChange={({ open }) => { if (!open) onClose() }}>
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content fontFamily="body">
        <Dialog.Header><Dialog.Title>Delete this set?</Dialog.Title></Dialog.Header>
        <Dialog.Body overflowWrap="anywhere">
          <Dialog.Description>This permanently deletes <strong>{title}</strong>, its questions, and its saved Learn progress.</Dialog.Description>
          {issue.message ? <Text role="alert" color="red.700" mt="3">{issue.message}</Text> : null}
          {issue.status === 409 ? <Link href={studySetHref(id, 'editor')} target="_blank" rel="noopener">Open latest version in a new tab</Link> : null}
          {issue.status === 401 ? <Link href={mySetsHref} target="_blank" rel="noopener">Sign in in a new tab</Link> : null}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.ActionTrigger asChild><Button ref={cancel} variant="outline" fontFamily="body" disabled={busy}>Cancel</Button></Dialog.ActionTrigger>
          <Button colorPalette="red" fontFamily="body" loading={busy} loadingText="Deleting…" onClick={onConfirm}>Delete set</Button>
        </Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  )
}
