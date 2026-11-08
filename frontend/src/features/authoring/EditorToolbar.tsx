import { Button, Dialog, HStack, IconButton, Portal, Stack, Text } from '@chakra-ui/react'
import { IconChevronDown, IconKeyboard, IconLock, IconSwitchHorizontal } from '@tabler/icons-react'
import { useState } from 'react'

export function EditorToolbar({ count, onReverse }: { count: number; onReverse: () => void }) {
  const [panel, setPanel] = useState<'privacy' | 'shortcuts' | null>(null)

  return (
    <>
      <HStack justify={{ base: 'space-between', sm: 'end' }} gap={{ base: '2', md: '4' }}>
        <Button type="button" variant="ghost" color="janeq.blue" fontFamily="body" onClick={() => setPanel('privacy')}>
          <IconLock size={18} /> Private <IconChevronDown size={16} />
        </Button>
        <HStack gap={{ base: '2', md: '4' }}>
          <IconButton type="button" rounded="full" bg="janeq.blue" color="white" _hover={{ bg: 'janeq.blueHover' }}
            aria-label="Reverse question order" title="Reverse question order" disabled={count < 2} onClick={onReverse}>
            <IconSwitchHorizontal size={20} />
          </IconButton>
          <IconButton type="button" rounded="full" bg="janeq.blue" color="white" _hover={{ bg: 'janeq.blueHover' }}
            aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setPanel('shortcuts')}>
            <IconKeyboard size={20} />
          </IconButton>
        </HStack>
      </HStack>
      <Dialog.Root open={panel !== null} onOpenChange={({ open }) => { if (!open) setPanel(null) }} placement="center">
        <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content fontFamily="body">
          <Dialog.Header><Dialog.Title>{panel === 'privacy' ? 'Set visibility' : 'Keyboard shortcuts'}</Dialog.Title></Dialog.Header>
          <Dialog.Body>
            {panel === 'privacy' ? (
              <Dialog.Description>This is a private set. Your account can edit and study it from My sets.</Dialog.Description>
            ) : (
              <Stack as="ul" gap="2">
                <Text as="li">Tab or Shift+Tab to move between controls.</Text>
                <Text as="li">Space to toggle the focused correct answer.</Text>
                <Text as="li">Ctrl+Enter or ⌘+Enter to save.</Text>
                <Text as="li">Escape to close a menu or dialog.</Text>
              </Stack>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.ActionTrigger asChild><Button type="button" variant="outline" fontFamily="body">Close</Button></Dialog.ActionTrigger>
          </Dialog.Footer>
        </Dialog.Content></Dialog.Positioner></Portal>
      </Dialog.Root>
    </>
  )
}
