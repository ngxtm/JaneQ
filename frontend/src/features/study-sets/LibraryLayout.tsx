import { Box, Button, Container, Flex, HStack, Image, Link, Text } from '@chakra-ui/react'
import type { PropsWithChildren } from 'react'
import janeqMark from '../../assets/janeq-mark.svg'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { createSetHref, followLibraryLink, homeHref, mySetsHref } from '../navigation/app-location'
import { AccountMenu } from './AccountMenu'

type LibraryLayoutProps = PropsWithChildren<{
  username: string
  inMySets: boolean
  signingOut: boolean
  signOutError: string
  onSignOut: () => void
  showFooter?: boolean
  compactContent?: boolean
}>

function Brand({ size }: { size: 'sm' | 'lg' }) {
  const compact = size === 'sm'
  return (
    <Link href={homeHref} gap="2" color="janeq.ink" _hover={{ textDecoration: 'none' }}>
      <Image src={janeqMark} alt="" boxSize={compact ? '5' : { base: '5', sm: '6' }} />
      <Text fontFamily="heading" fontSize={compact ? 'lg' : { base: 'lg', sm: '2xl' }} fontWeight="700">
        JaneQ
      </Text>
    </Link>
  )
}

type NavigationProps = Pick<LibraryLayoutProps, 'username' | 'inMySets' | 'signingOut' | 'onSignOut'>

function LibraryNavigation({ username, inMySets, signingOut, onSignOut }: NavigationProps) {
  return (
    <Flex as="header" h="20" px={{ base: '4', md: '8' }} align="center" justify="space-between" gap="2">
      <HStack as="nav" aria-label="Main navigation" gap={{ base: '1', md: '4' }} flexShrink="0">
        <Brand size="lg" />
        <Button asChild variant="ghost" fontFamily="body" fontSize="sm" fontWeight="700" hideBelow="md">
          <a href={homeHref}>Home</a>
        </Button>
        <Button asChild variant={inMySets ? 'subtle' : 'ghost'} px={{ base: '2', sm: '4' }} fontFamily="body" fontSize="sm" fontWeight="700">
          <a href={mySetsHref} aria-current={inMySets ? 'location' : undefined}>My sets</a>
        </Button>
        <PrimaryButton asChild px={{ base: '2.5', sm: '4' }} rounded="lg" fontFamily="body" fontSize="sm" fontWeight="700">
          <a href={createSetHref}>Create</a>
        </PrimaryButton>
      </HStack>
      <AccountMenu username={username} signingOut={signingOut} onSignOut={onSignOut} />
    </Flex>
  )
}

export function LibraryLayout({
  children, username, inMySets, signingOut, signOutError, onSignOut, showFooter = true, compactContent = false,
}: LibraryLayoutProps) {
  return (
    <Flex onClick={followLibraryLink} direction="column" minH="100svh" bg="janeq.library" color="janeq.ink" fontFamily="body">
      <LibraryNavigation username={username} inMySets={inMySets} signingOut={signingOut} onSignOut={onSignOut} />
      <Container as="main" maxW="7xl" mt={compactContent ? '4' : '10'}
        pb={compactContent ? '8' : { base: '20', md: '30' }} px={{ base: '4', sm: '8' }} flex="1">
        {signOutError ? <Text role="alert" color="red.700" mb="4">{signOutError}</Text> : null}
        {children}
      </Container>
      {showFooter ? <Box as="footer" bg="white" borderTop="1px solid" borderColor="gray.200">
        <Container maxW="7xl" px={{ base: '4', sm: '8' }} py="10">
          <HStack justify="space-between">
            <Brand size="sm" />
            <Link href={homeHref} fontSize="sm" color="janeq.muted">Home</Link>
          </HStack>
        </Container>
      </Box> : null}
    </Flex>
  )
}
