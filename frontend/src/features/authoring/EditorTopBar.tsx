import { Flex, Heading, HStack, IconButton, Menu, Portal, Stack, Text } from '@chakra-ui/react'
import { IconDotsVertical, IconEditCircle, IconTrash } from '@tabler/icons-react'
import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react'

type EditorTopBarProps = PropsWithChildren<{
  editing: boolean
  status?: string
  action?: ReactNode
  onDelete?: () => void
  busy?: boolean
}>

export function EditorTopBar({ editing, status, action, onDelete, busy, children }: EditorTopBarProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (document.activeElement === document.body) heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <Stack position="sticky" top="2" zIndex="sticky" bg="white" px={{ base: '3', sm: '5' }} py="4" rounded="xl"
      w={{ base: 'calc(100% + 16px)', sm: 'calc(100% + 40px)' }} ml={{ base: '-8px', sm: '-20px' }}
      border="2px solid" borderColor="janeq.divider" shadow="xl" gap="3">
      <Flex align="center" justify="space-between" gap="2">
        <Stack gap="1" minW="0">
          <HStack gap="2">
            <IconEditCircle size={18} aria-hidden="true" />
            <Heading as="h1" ref={heading} tabIndex={-1} size="lg" _focus={{ outline: 'none' }}>
              {editing ? 'Edit set' : 'Create a new set'}
            </Heading>
          </HStack>
          <Text fontSize="sm" color="janeq.muted" minH="5">{status}</Text>
        </Stack>
        <HStack gap="1" flexShrink="0">
          {action}
          {onDelete ? (
            <Menu.Root positioning={{ placement: 'bottom-end' }}>
              <Menu.Trigger asChild>
                <IconButton type="button" variant="ghost" size="sm" aria-label="More actions" disabled={busy}>
                  <IconDotsVertical size={19} />
                </IconButton>
              </Menu.Trigger>
              <Portal><Menu.Positioner><Menu.Content fontFamily="body" minW="36" shadow="lg">
                <Menu.Item value="delete" color="red.700" onSelect={onDelete}><IconTrash size={18} /> Delete set</Menu.Item>
              </Menu.Content></Menu.Positioner></Portal>
            </Menu.Root>
          ) : null}
        </HStack>
      </Flex>
      {children}
    </Stack>
  )
}
