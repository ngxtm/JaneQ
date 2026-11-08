import { Button, Dialog, Portal } from '@chakra-ui/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { guardLibraryNavigation } from '../navigation/app-location'

export function DiscardChangesDialog({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const [destination, setDestination] = useState<{ proceed: () => void } | null>(null)
  const keepEditing = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!dirty && !saving) return
    const release = guardLibraryNavigation((proceed) => {
      if (!saving) setDestination({ proceed })
    })
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => {
      release()
      window.removeEventListener('beforeunload', warnBeforeUnload)
    }
  }, [dirty, saving])

  return (
    <Dialog.Root role="alertdialog" open={destination !== null} placement="center"
      initialFocusEl={() => keepEditing.current} onOpenChange={({ open }) => { if (!open) setDestination(null) }}>
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content fontFamily="body">
        <Dialog.Header><Dialog.Title>Discard unsaved changes?</Dialog.Title></Dialog.Header>
        <Dialog.Body>Your changes to this study set will be lost if you leave.</Dialog.Body>
        <Dialog.Footer>
          <Dialog.ActionTrigger asChild><Button ref={keepEditing} variant="outline" fontFamily="body">Keep editing</Button></Dialog.ActionTrigger>
          <Button colorPalette="red" fontFamily="body" onClick={() => {
            setDestination(null)
            destination?.proceed()
          }}>Discard changes</Button>
        </Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  )
}
