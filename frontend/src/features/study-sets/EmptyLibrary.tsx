import { Box, Button, Center, Heading, HStack, Image, Stack, Text } from '@chakra-ui/react'
import { IconArrowDown, IconBooks, IconFolder } from '@tabler/icons-react'
import { domAnimation, LazyMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { useSyncExternalStore } from 'react'
import janeqMark from '../../assets/janeq-mark.svg'

const motionPreference = '(prefers-reduced-motion: reduce)'

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(motionPreference)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readMotionPreference() {
  return window.matchMedia(motionPreference).matches
}

const floatingIcons = [
  { name: 'books', graphic: <IconBooks size={30} />, duration: 4, delay: 0.2, tilt: -25 },
  { name: 'mark', graphic: <Image src={janeqMark} alt="" boxSize="12" />, duration: 5, delay: 0, tilt: 0 },
  { name: 'folder', graphic: <IconFolder size={38} />, duration: 4.5, delay: 0.4, tilt: 20 },
]

function FloatingIllustration() {
  // Read the media query live so an in-flight loop stops when the preference changes.
  const reduceMotion = useSyncExternalStore(subscribeToMotionPreference, readMotionPreference)

  return (
    <HStack aria-hidden="true" pos="relative" gap="4" color="blue.700" opacity="0.55">
      <LazyMotion features={domAnimation} strict>
        {floatingIcons.map(({ name, graphic, duration, delay, tilt }) => reduceMotion ? (
          <span key={name} style={{ display: 'flex' }}>{graphic}</span>
        ) : (
          <m.span
            key={name}
            style={{ display: 'flex' }}
            animate={{ y: [0, -20, 0], rotateZ: [0, tilt, 0] }}
            transition={{ duration, delay, ease: 'backInOut', repeat: Infinity }}
          >
            {graphic}
          </m.span>
        ))}
      </LazyMotion>
    </HStack>
  )
}

export function EmptyLibrary() {
  return (
    <Center p={{ base: '8', md: '12' }} rounded="3xl" bg="white" border="2px solid" borderColor="gray.200" overflow="hidden">
      <Stack align="center" textAlign="center" gap={{ base: '6', md: '10' }} pos="relative">
        <Box
          aria-hidden="true"
          pos="absolute"
          inset="-16"
          bg="radial-gradient(ellipse at center, rgb(126 166 255 / 30%) 5%, transparent 70%)"
          pointerEvents="none"
        />
        <FloatingIllustration />
        <Stack gap="2" pos="relative">
          <Heading as="h1" fontFamily="heading" fontSize={{ base: '2xl', md: '3xl' }}>
            Open your first study set
          </Heading>
          <Text color="janeq.muted">Choose a built-in set to start learning with JaneQ.</Text>
        </Stack>
        <Button
          asChild
          size="xl"
          bg="janeq.blue"
          color="white"
          fontFamily="body"
          rounded="xl"
          shadow="lg"
          _hover={{ bg: 'janeq.blueHover' }}
        >
          <a href="#built-in-sets"><IconArrowDown size={18} /> Browse study sets</a>
        </Button>
      </Stack>
    </Center>
  )
}
