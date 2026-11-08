import { Flex, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import { IconEditCircle } from '@tabler/icons-react'
import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react'

type EditorTopBarProps = PropsWithChildren<{
  editing: boolean
  status?: string
  action?: ReactNode
}>

export function EditorTopBar({ editing, status, action, children }: EditorTopBarProps) {
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
        </HStack>
      </Flex>
      {children}
    </Stack>
  )
}
