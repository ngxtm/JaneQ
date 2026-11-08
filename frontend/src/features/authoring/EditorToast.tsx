import { Portal, Stack, Toast, Toaster, type CreateToasterReturn } from '@chakra-ui/react'

export function EditorToast({ toaster }: { toaster: CreateToasterReturn }) {
  return (
    <Portal>
      <Toaster toaster={toaster}>
        {(toast) => (
          <Toast.Root fontFamily="body" w="min(22rem, calc(100vw - 32px))" _motionReduce={{ transition: 'none' }}>
            <Toast.Indicator />
            <Stack gap="1" flex="1" minW="0">
              <Toast.Title>{toast.title}</Toast.Title>
              <Toast.Description>{toast.description}</Toast.Description>
            </Stack>
            <Toast.CloseTrigger aria-label="Dismiss notification" bg="transparent" color="white" border="0" rounded="md"
              _hover={{ bg: 'whiteAlpha.300' }} focusVisibleRing="inside" focusRingColor="white" />
          </Toast.Root>
        )}
      </Toaster>
    </Portal>
  )
}
