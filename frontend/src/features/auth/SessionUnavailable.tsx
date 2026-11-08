import { Button, Center, Heading, Image, Text, VStack } from '@chakra-ui/react'
import { IconRotateClockwise2 } from '@tabler/icons-react'
import janeqMark from '../../assets/janeq-mark.svg'
import { UiProvider } from '../../ui/UiProvider'

export default function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <UiProvider>
      <Center as="main" minH="100svh" px="6" py="10" textAlign="center"
        bg="janeq.library" color="janeq.ink" fontFamily="body">
        <VStack gap={{ base: '6', md: '8' }}>
          <Image src={janeqMark} alt="" boxSize={{ base: '32', md: '52' }} opacity="0.24"
            css={{ maskImage: 'linear-gradient(black 15%, transparent 94%)' }} />
          <VStack role="alert" gap={{ base: '4', md: '5' }} maxW="36rem">
            <Heading as="h1" fontFamily="heading" fontSize={{ base: '4xl', md: '6xl' }}
              fontWeight="700" lineHeight="1.05" textWrap="balance">
              Could not connect to JaneQ.
            </Heading>
            <Text color="janeq.muted" fontSize={{ base: 'md', md: 'lg' }} textWrap="balance">
              We couldn’t check your session. Please try again in a moment.
            </Text>
          </VStack>
          <Button type="button" variant="outline" minH="11" px="4" borderRadius="lg"
            fontFamily="body" color="janeq.ink" bg="white" borderColor="janeq.line"
            focusRingColor="janeq.focus" _hover={{ bg: 'blue.50' }} onClick={onRetry}>
            <IconRotateClockwise2 size={18} aria-hidden="true" />
            Try again
          </Button>
        </VStack>
      </Center>
    </UiProvider>
  )
}
