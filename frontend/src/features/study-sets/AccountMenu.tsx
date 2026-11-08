import { Avatar, Box, Button, Menu, Text } from '@chakra-ui/react'
import { IconChevronDown, IconHome, IconLogout } from '@tabler/icons-react'
import { homeHref, navigateLibrary, requestLibraryNavigation } from '../navigation/app-location'

type AccountMenuProps = {
  username: string
  signingOut: boolean
  onSignOut: () => void
}

const itemStyle = {
  px: '3',
  py: '2',
  gap: '3',
  textStyle: 'md',
  fontWeight: '600',
  _highlighted: { bg: 'janeq.canvas' },
} as const

export function AccountMenu({ username, signingOut, onSignOut }: AccountMenuProps) {
  return (
    <Menu.Root positioning={{ placement: 'bottom-end', gutter: 8 }} navigate={({ node, modifiers }) => {
      if (modifiers?.metaKey || modifiers?.ctrlKey || modifiers?.shiftKey || modifiers?.altKey) {
        node.dispatchEvent(new MouseEvent('click', { ...modifiers, bubbles: true, cancelable: true }))
        return
      }
      // The menu's keyboard navigation bypasses the layout's click handler.
      requestLibraryNavigation(() => navigateLibrary(homeHref))
    }}>
      <Menu.Trigger asChild>
        <Button
          aria-label="Account menu"
          className="group"
          variant="ghost"
          h="10"
          minW="0"
          flexShrink="1"
          px="2"
          gap={{ base: '2', md: '3' }}
          rounded="lg"
          color="janeq.ink"
          fontFamily="body"
          focusVisibleRing="outside"
          focusRingColor="janeq.focus"
        >
          <Avatar.Root aria-hidden="true" boxSize="8" flexShrink="0" bg="blue.100" color="blue.800">
            <Avatar.Fallback name={username} />
            <Box
              pos="absolute"
              bottom="-0.5"
              right="-0.5"
              boxSize="3"
              rounded="full"
              border="2px solid"
              borderColor="janeq.library"
              bg="green.500"
            />
          </Avatar.Root>
          <Text truncate minW="0" maxW={{ base: '32', md: '48' }} fontSize="md" fontWeight="700">
            {username}
          </Text>
          <Box
            as="span"
            display="flex"
            flexShrink="0"
            aria-hidden="true"
            transition="transform 200ms ease-in-out"
            _groupExpanded={{ transform: 'rotate(180deg)' }}
            _motionReduce={{ transition: 'none' }}
          >
            <IconChevronDown size={24} />
          </Box>
        </Button>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content
          w="14rem"
          maxW="calc(100vw - 2rem)"
          p="0"
          bg="white"
          color="janeq.ink"
          fontFamily="body"
          borderWidth="1px"
          borderColor="janeq.divider"
          rounded="lg"
          shadow="lg"
          _motionReduce={{ animation: 'none' }}
        >
          <Menu.Item value="home" asChild {...itemStyle}>
            <a href={homeHref}><IconHome size={18} aria-hidden="true" /> Home</a>
          </Menu.Item>
          <Menu.Separator mx="0" borderWidth="0" bg="janeq.divider" />
          <Menu.Item value="sign-out" disabled={signingOut} onSelect={() => requestLibraryNavigation(onSignOut)} {...itemStyle}>
            <IconLogout size={18} aria-hidden="true" /> Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}
