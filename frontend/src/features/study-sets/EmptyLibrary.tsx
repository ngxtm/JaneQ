import { Box, Button, Center, Heading, HStack, Image, Stack, Text } from '@chakra-ui/react'
import { IconArrowDown, IconBooks, IconFolder } from '@tabler/icons-react'
import janeqMark from '../../assets/janeq-mark.svg'
import './home-motion.css'

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
        <HStack aria-hidden="true" pos="relative" gap="4" color="blue.700" opacity="0.55">
          <Box className="library-float library-float-books"><IconBooks size={30} /></Box>
          <Image className="library-float library-float-mark" src={janeqMark} alt="" boxSize="12" />
          <Box className="library-float library-float-folder"><IconFolder size={38} /></Box>
        </HStack>
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
