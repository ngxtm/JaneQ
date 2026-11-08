import { Button, Dialog, IconButton, Link, Menu, Portal, Text } from '@chakra-ui/react'
import { IconDotsVertical, IconTrash } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { httpErrorMessage, httpStatus } from '../../http'
import { mySetsHref, studySetHref } from '../navigation/app-location'
import { deleteEditorSet } from './api'

export function SetDeleteMenu({ id, title, revision, onDeleted, onPendingChange, disabled, attached }: {
  id: string
  title: string
  revision: number
  onDeleted: (id: string) => void
  onPendingChange?: (pending: boolean) => void
  disabled?: boolean
  attached?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<{ message: string; status?: number }>({ message: '' })
  const pending = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  async function remove() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    onPendingChange?.(true)
    setIssue({ message: '' })
    try {
      await deleteEditorSet(id, revision)
      onDeleted(id)
    } catch (error) {
      const status = httpStatus(error)
      if (status === 404) {
        onDeleted(id)
      } else {
        const message = status === 401
          ? 'Your session expired. Sign in again, then retry deleting here.'
          : httpErrorMessage(error, 'Could not delete this set. Try again.')
        setIssue({ message, status })
      }
    } finally {
      pending.current = false
      setBusy(false)
      onPendingChange?.(false)
    }
  }

  return (
    <>
      <Menu.Root positioning={{ placement: 'bottom-end' }}>
        <Menu.Trigger asChild>
          <IconButton ref={trigger} type="button" variant="ghost" size="sm" aria-label="More actions"
            disabled={disabled || busy} color={attached ? 'janeq.focus' : undefined} w={attached ? '10' : undefined}
            borderInlineStart={attached ? '1px solid' : undefined} borderColor="janeq.line" roundedStart={attached ? '0' : undefined}
            focusVisibleRing="outside" focusRingColor="janeq.focus">
            <IconDotsVertical size={19} />
          </IconButton>
        </Menu.Trigger>
        <Portal><Menu.Positioner><Menu.Content fontFamily="body" minW="36" shadow="lg">
          <Menu.Item value="delete" color="red.700" onSelect={() => {
            setIssue({ message: '' })
            setOpen(true)
          }}><IconTrash size={18} /> Delete set</Menu.Item>
        </Menu.Content></Menu.Positioner></Portal>
      </Menu.Root>
      <Dialog.Root role="alertdialog" open={open} placement="center" initialFocusEl={() => cancel.current} finalFocusEl={() => trigger.current}
        closeOnEscape={!busy} closeOnInteractOutside={!busy} onOpenChange={({ open }) => setOpen(open)}>
        <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content fontFamily="body">
          <Dialog.Header><Dialog.Title>Delete this set?</Dialog.Title></Dialog.Header>
          <Dialog.Body overflowWrap="anywhere">
            <Dialog.Description>This permanently deletes <strong>{title}</strong>, its questions, and its saved Learn progress.</Dialog.Description>
            {issue.message ? <Text role="alert" color="red.700" mt="3">{issue.message}</Text> : null}
            {issue.status === 409 ? <Link href={studySetHref(id, 'editor')} target="_blank" rel="noopener">Open latest version in a new tab</Link> : null}
            {issue.status === 401 ? <Link href={mySetsHref} target="_blank" rel="noopener">Sign in in a new tab</Link> : null}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.ActionTrigger asChild><Button ref={cancel} type="button" variant="outline" fontFamily="body" disabled={busy}>Cancel</Button></Dialog.ActionTrigger>
            <Button type="button" colorPalette="red" fontFamily="body" loading={busy} loadingText="Deleting…" onClick={() => void remove()}>Delete set</Button>
          </Dialog.Footer>
        </Dialog.Content></Dialog.Positioner></Portal>
      </Dialog.Root>
    </>
  )
}
