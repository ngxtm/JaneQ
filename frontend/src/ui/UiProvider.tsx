import { ChakraProvider } from '@chakra-ui/react'
import '@fontsource-variable/open-sans'
import '@fontsource-variable/outfit'
import type { PropsWithChildren } from 'react'
import { uiSystem } from './theme'

export function UiProvider({ children }: PropsWithChildren) {
  return <ChakraProvider value={uiSystem}>{children}</ChakraProvider>
}
