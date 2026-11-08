import { Box, Button, Text } from '@chakra-ui/react'
import { UiProvider } from '../../ui/UiProvider'

export default function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return <UiProvider>
    <Box as="main" maxW="68rem" mx="auto" px="5" py="8">
      <Text color="red.700" role="alert">Could not connect to JaneQ.</Text>
      <Button variant="outline" mt="3" minH="11" color="janeq.focus" borderColor="janeq.line"
        focusRingColor="janeq.focus" _hover={{ bg: 'blue.50' }} onClick={onRetry}>Try again</Button>
    </Box>
  </UiProvider>
}
