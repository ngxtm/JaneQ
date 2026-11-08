import {
  Box, Button, Center, Field, Heading, Image, Input,
  Separator, Stack, Text, VisuallyHidden,
} from '@chakra-ui/react'
import { domAnimation, LazyMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { type PropsWithChildren, type SubmitEvent, useState } from 'react'
import janeqMark from '../../assets/janeq-mark.svg'
import { isUnauthorized } from '../../http'
import { UiProvider } from '../../ui/UiProvider'
import { signIn, type User } from './api'

type LoginProps = { onSignIn: (user: User) => void }

function LoginEntrance({ children }: PropsWithChildren) {
  return (
    <LazyMotion features={domAnimation} strict>
      <Center
        as="main"
        pos="relative"
        minH="100svh"
        px="6"
        py="10"
        bg="janeq.canvas"
        color="janeq.ink"
        fontFamily="body"
      >
        <Box
          asChild
          pos="absolute"
          inset="0"
          pointerEvents="none"
          bg="linear-gradient(180deg, #cddbf8 0%, var(--chakra-colors-janeq-canvas) 52%)"
          _motionReduce={{ opacity: '1 !important' }}
        >
          <m.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 1.5, ease: 'easeOut' }}
          />
        </Box>
        <Stack
          asChild
          pos="relative"
          w="full"
          maxW="20rem"
          gap="8"
          _motionReduce={{ opacity: '1 !important', transform: 'none !important' }}
          _focusWithin={{ opacity: '1 !important', transform: 'none !important' }}
        >
          <m.section
            aria-labelledby="login-title"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
          >
            {children}
          </m.section>
        </Stack>
      </Center>
    </LazyMotion>
  )
}

export default function Login({ onSignIn }: LoginProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const user = await signIn(String(fields.get('username')), String(fields.get('password')))
      onSignIn(user)
    } catch (error) {
      setError(isUnauthorized(error)
        ? 'Incorrect username or password.'
        : 'Could not sign in. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <UiProvider>
      <LoginEntrance>
        <Stack align="center" gap="6">
          <Image src={janeqMark} alt="JaneQ" boxSize="24" />
          <Heading as="h1" id="login-title" fontFamily="heading" fontSize="2xl" fontWeight="700">
            Welcome back
          </Heading>
        </Stack>

        <Stack gap="3" asChild>
          <form onSubmit={handleSubmit}>
            <Field.Root>
              <VisuallyHidden asChild>
                <Field.Label>Username</Field.Label>
              </VisuallyHidden>
              <Input name="username" autoComplete="username" placeholder="Enter your username" required />
            </Field.Root>
            <Field.Root>
              <VisuallyHidden asChild>
                <Field.Label>Password</Field.Label>
              </VisuallyHidden>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </Field.Root>
            {error ? <Text fontSize="sm" color="red.700" role="alert">{error}</Text> : null}
            <Button
              type="submit"
              h="12"
              mt="1"
              borderRadius="lg"
              bg="janeq.blue"
              color="white"
              fontFamily="body"
              fontSize="sm"
              fontWeight="600"
              shadow="sm"
              focusRingColor="janeq.focus"
              _hover={{ bg: 'janeq.blueHover' }}
              disabled={pending}
              aria-busy={pending}
            >
              Sign in
            </Button>
          </form>
        </Stack>

        <Stack gap="4">
          <Separator borderColor="janeq.divider" borderBottomWidth="2px" />
          <Box fontSize="sm">
            <Text fontWeight="700">Demo account</Text>
            <Text mt="1" color="janeq.muted">Use the demo credentials provided for this JaneQ instance.</Text>
          </Box>
        </Stack>
      </LoginEntrance>
    </UiProvider>
  )
}
