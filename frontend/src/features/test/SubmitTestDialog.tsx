import { Box, Button, Dialog, Portal, Stack, Text } from '@chakra-ui/react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useRef, type ComponentPropsWithRef } from 'react'

export function SubmitTestButton(props: ComponentPropsWithRef<typeof Button>) {
  return <Button colorPalette="green" bg="green.100" color="green.800" borderColor="green.200"
    _hover={{ bg: 'green.700', color: 'white', borderColor: 'green.700' }} _motionReduce={{ transition: 'none' }}
    fontFamily="body" rounded="lg" focusVisibleRing="outside" focusRingColor="green.700" {...props} />
}

export function SubmitTestDialog({ open, unanswered, waiting, saveIssue, onClose, onConfirm }: {
  open: boolean
  unanswered: number[]
  waiting: boolean
  saveIssue?: string
  onClose: () => void
  onConfirm: () => void
}) {
  const keepWorking = useRef<HTMLButtonElement>(null)
  const count = unanswered.length

  return (
    <Dialog.Root open={open} onOpenChange={({ open }) => { if (!open) onClose() }}
      role="alertdialog" placement="center" initialFocusEl={() => keepWorking.current} scrollBehavior="inside" lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="md" rounded="2xl" bg="white" color="janeq.ink" fontFamily="body">
            <Dialog.Header alignItems="center" gap="3" px={{ base: '4', sm: '6' }}>
              <Box display="grid" placeItems="center" boxSize="9" rounded="lg" bg="orange.50" color="orange.800" flexShrink="0">
                <IconAlertTriangle size={21} aria-hidden="true" />
              </Box>
              <Dialog.Title fontSize="xl">Submit with unanswered questions?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px={{ base: '4', sm: '6' }} pt="0">
              <Stack gap="3">
                <Dialog.Description fontSize="sm" color="janeq.muted">
                  {count === 1 ? '1 question is unanswered.' : `${count} questions are unanswered.`}
                  {' '}Each unanswered question will score zero points.
                </Dialog.Description>
                <Box rounded="lg" border="1px solid" borderColor="janeq.divider" bg="janeq.library" p="3">
                  <Text fontSize="sm" fontWeight="semibold">{count === 1 ? 'Unanswered question' : 'Unanswered questions'}</Text>
                  <Text mt="1" maxH="24" overflowY="auto" color="janeq.muted" fontSize="sm" fontVariantNumeric="tabular-nums">
                    {unanswered.join(', ')}
                  </Text>
                </Box>
                {waiting ? <Text role="status" fontSize="sm" color={saveIssue ? 'red.700' : 'janeq.muted'}>
                  {saveIssue ?? 'Saving your answers…'}
                </Text> : null}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer px={{ base: '4', sm: '6' }} gap="2" flexWrap="wrap">
              <Dialog.ActionTrigger asChild>
                <Button ref={keepWorking} variant="outline" bg="white" color="janeq.ink" borderColor="janeq.line"
                  rounded="lg" fontFamily="body" focusRingColor="janeq.focus">Keep working</Button>
              </Dialog.ActionTrigger>
              <SubmitTestButton disabled={waiting} onClick={onConfirm}>Submit anyway</SubmitTestButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
