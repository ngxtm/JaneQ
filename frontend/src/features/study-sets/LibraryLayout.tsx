import {
  Avatar, Box, Button, Container, Flex, HStack, Image, Link, Menu, Text,
} from '@chakra-ui/react'
import { IconChevronDown, IconHome, IconLogout, IconMenu2 } from '@tabler/icons-react'
import { useState, type PropsWithChildren } from 'react'
import janeqMark from '../../assets/janeq-mark.svg'

type LibraryLayoutProps = PropsWithChildren<{
  username: string
  signingOut: boolean
  signOutError: string
  onSignOut: () => void
}>

function Brand({ size }: { size: 'sm' | 'lg' }) {
  const compact = size === 'sm'
  return (
    <Link href="#home" gap="2" color="janeq.ink" _hover={{ textDecoration: 'none' }}>
      <Image src={janeqMark} alt="" boxSize={compact ? '5' : '6'} />
      <Text fontFamily="heading" fontSize={compact ? 'lg' : '2xl'} fontWeight="700">
        JaneQ
      </Text>
    </Link>
  )
}

type NavigationProps = Pick<LibraryLayoutProps, 'username' | 'signingOut' | 'onSignOut'>

function LibraryNavigation({ username, signingOut, onSignOut }: NavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <Flex as="header" h="20" px={{ base: '6', md: '8' }} align="center" justify="space-between" gap="4">
      <HStack as="nav" aria-label="Main navigation" gap="4">
        <Brand size="lg" />
        <Button asChild variant="ghost" fontFamily="body" fontSize="sm" fontWeight="700" hideBelow="md">
          <a href="#home">Home</a>
        </Button>
      </HStack>
      <Menu.Root onOpenChange={({ open }) => setMenuOpen(open)} positioning={{ placement: 'bottom-end', gutter: 8 }}>
        <Menu.Trigger asChild>
          <Button
            aria-label="Account menu"
            variant="ghost"
            size="md"
            color="janeq.ink"
            fontFamily="body"
            gap="3"
            px="2"
          >
            <Avatar.Root size="sm" position="relative" bg="blue.100" color="blue.800">
              <Avatar.Fallback name={username} />
              <Box
                aria-hidden="true"
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
            <Text truncate maxW="28" fontSize="sm" fontWeight="700" hideBelow="md">{username}</Text>
            <Box
              as="span"
              display={{ base: 'none', md: 'flex' }}
              transform={menuOpen ? 'rotate(180deg)' : 'rotate(0)'}
              transition="transform 200ms ease-in-out"
              _motionReduce={{ transition: 'none' }}
            >
              <IconChevronDown size={18} />
            </Box>
            <Box as="span" display={{ base: 'flex', md: 'none' }}><IconMenu2 size={20} /></Box>
          </Button>
        </Menu.Trigger>
        <Menu.Positioner>
          <Menu.Content minW="36" py="1" bg="white" color="janeq.ink" fontFamily="body" shadow="lg">
            <Menu.Item value="home" asChild>
              <a href="#home"><IconHome size={18} /> Home</a>
            </Menu.Item>
            <Menu.Item value="sign-out" disabled={signingOut} onSelect={onSignOut}>
              <IconLogout size={18} /> Sign out
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </Flex>
  )
}

export function LibraryLayout({
  children, username, signingOut, signOutError, onSignOut,
}: LibraryLayoutProps) {
  return (
    <Flex direction="column" minH="100svh" bg="janeq.library" color="janeq.ink" fontFamily="body">
      <LibraryNavigation username={username} signingOut={signingOut} onSignOut={onSignOut} />
      <Container id="home" as="main" maxW="7xl" mt="10" pb={{ base: '20', md: '30' }} px={{ base: '4', sm: '8' }} flex="1">
        {signOutError ? <Text role="alert" color="red.700" mb="4">{signOutError}</Text> : null}
        {children}
      </Container>
      <Box as="footer" bg="white" borderTop="1px solid" borderColor="gray.200">
        <Container maxW="7xl" px={{ base: '4', sm: '8' }} py="10">
          <HStack justify="space-between">
            <Brand size="sm" />
            <Link href="#home" fontSize="sm" color="janeq.muted">Home</Link>
          </HStack>
        </Container>
      </Box>
    </Flex>
  )
}
