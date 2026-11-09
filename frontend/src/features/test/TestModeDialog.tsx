import { Box, Button, Dialog, HStack, Input, NumberInput, Portal, RadioGroup, SimpleGrid, Slider, Stack, Text } from '@chakra-ui/react'
import { IconClock, IconInfinity } from '@tabler/icons-react'
import { useState } from 'react'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { describeDuration, type TestMode } from './test-mode'

type TestModeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectMode: (mode: TestMode) => void
}

const modes = [
  { value: 'standard', title: 'No time limit', description: 'Practice at your own pace.', icon: IconInfinity },
  { value: 'timed', title: 'Timed test', description: 'Set one countdown for the whole test.', icon: IconClock },
] as const

const durationFieldStyle = {
  focusVisibleRing: 'outside', focusRingColor: 'janeq.focus',
} as const

export function TestModeDialog({ open, onOpenChange, onSelectMode }: TestModeDialogProps) {
  const [timed, setTimed] = useState(false)
  const [sliderMinutes, setSliderMinutes] = useState(30)
  const [custom, setCustom] = useState(false)
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('30')
  const duration = custom ? Number(hours) * 60 + Number(minutes) : sliderMinutes
  const valid = Number.isInteger(duration) && duration >= 1 && duration <= 1440
    && (!custom || (Number.isInteger(Number(hours)) && Number(hours) >= 0
      && Number.isInteger(Number(minutes)) && Number(minutes) >= 0 && Number(minutes) < 60))

  function handleStart() {
    if (timed && !valid) return
    onSelectMode(timed ? { kind: 'timed', duration, startId: crypto.randomUUID() } : { kind: 'standard' })
  }

  function toggleCustom() {
    if (!custom) {
      setHours(String(Math.floor(sliderMinutes / 60)))
      setMinutes(String(sliderMinutes % 60))
    } else if (valid) {
      setSliderMinutes(Math.min(duration, 120))
    }
    setCustom(!custom)
  }

  return (
    <Dialog.Root open={open} onOpenChange={({ open }) => onOpenChange(open)} placement="center" scrollBehavior="inside">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content fontFamily="body" maxW="lg" rounded="2xl" bg="white" color="janeq.ink" shadow="lg">
            <Dialog.Header px={{ base: '4', sm: '6' }} pt="5" pb="3">
              <Stack gap="1">
                <Dialog.Title fontSize="2xl" lineHeight="short">Set up your test</Dialog.Title>
                <Dialog.Description color="janeq.muted" fontSize="sm">
                  Choose a mode. You can jump between questions in either mode.
                </Dialog.Description>
              </Stack>
            </Dialog.Header>
            <Dialog.Body px={{ base: '4', sm: '6' }} py="2">
              <RadioGroup.Root aria-label="Test mode" value={timed ? 'timed' : 'standard'}
                onValueChange={({ value }) => setTimed(value === 'timed')} colorPalette="blue">
                <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
                  {modes.map(({ value, title, description, icon: Icon }) => (
                    <RadioGroup.Item key={value} value={value} alignItems="start" minW="0" cursor="pointer"
                      border="1px solid" borderColor="janeq.line" rounded="xl" bg="white" p="3"
                      _hover={{ bg: 'janeq.library' }} _checked={{ borderColor: 'janeq.focus', bg: 'blue.50' }}
                      css={{ '&:has(input:focus-visible)': { outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '2px' } }}>
                      <RadioGroup.ItemHiddenInput />
                      <RadioGroup.ItemIndicator mt="0.5" borderStyle="solid" flexShrink="0" />
                      <RadioGroup.ItemText asChild>
                        <Stack as="span" gap="1" fontWeight="normal">
                          <HStack as="span" gap="1.5" color="janeq.ink" fontFamily="heading" fontWeight="semibold">
                            <Box as="span" color="janeq.focus"><Icon size={18} aria-hidden="true" /></Box>{title}
                          </HStack>
                          <Text as="span" color="janeq.muted" fontSize="sm">{description}</Text>
                        </Stack>
                      </RadioGroup.ItemText>
                    </RadioGroup.Item>
                  ))}
                </SimpleGrid>
              </RadioGroup.Root>
              {timed ? (
                <Stack bg="janeq.library" border="1px solid" borderColor="janeq.divider" rounded="xl" p="4" mt="4" gap="3">
                  {custom ? (
                    <>
                      <Text fontWeight="semibold" fontSize="sm">Custom time limit</Text>
                      <SimpleGrid columns={2} gap="3">
                        <NumberInput.Root value={hours} onValueChange={({ value }) => setHours(value)}
                          min={0} max={24} allowOverflow clampValueOnBlur={false} invalid={!valid}>
                          <NumberInput.Label color="janeq.muted" fontSize="sm">Hours</NumberInput.Label>
                          <NumberInput.Input asChild {...durationFieldStyle}><Input bg="white" /></NumberInput.Input>
                        </NumberInput.Root>
                        <NumberInput.Root value={minutes} onValueChange={({ value }) => setMinutes(value)}
                          min={0} max={59} allowOverflow clampValueOnBlur={false} invalid={!valid}>
                          <NumberInput.Label color="janeq.muted" fontSize="sm">Minutes</NumberInput.Label>
                          <NumberInput.Input asChild {...durationFieldStyle}><Input bg="white" /></NumberInput.Input>
                        </NumberInput.Root>
                      </SimpleGrid>
                      <Text fontSize="sm" color={valid ? 'janeq.muted' : 'red.700'} aria-live="polite">
                        {valid ? describeDuration(duration) + ' total' : 'Enter a time from 1 minute to 24 hours, using 0–59 in the minutes field.'}
                      </Text>
                    </>
                  ) : (
                    <Slider.Root min={1} max={120} step={1} value={[sliderMinutes]} colorPalette="blue"
                      onValueChange={({ value }) => setSliderMinutes(value[0])}>
                      <HStack justify="space-between" gap="2">
                        <Slider.Label fontWeight="semibold">Time limit</Slider.Label>
                        <Text fontSize="sm" color="janeq.focus" fontWeight="semibold">{describeDuration(sliderMinutes)}</Text>
                      </HStack>
                      <Slider.Control>
                        <Slider.Track bg="janeq.divider"><Slider.Range bg="janeq.blue" /></Slider.Track>
                        <Slider.Thumb index={0} border="2px solid" borderColor="janeq.blue" focusVisibleRing="outside" focusRingColor="janeq.focus">
                          <Slider.HiddenInput />
                        </Slider.Thumb>
                      </Slider.Control>
                      <HStack justify="space-between" color="janeq.muted" fontSize="xs" aria-hidden="true">
                        <Text>1 min</Text><Text>120 min</Text>
                      </HStack>
                    </Slider.Root>
                  )}
                  <Button variant="ghost" size="sm" alignSelf="start" color="janeq.focus" fontFamily="body" px="2" onClick={toggleCustom}
                    focusVisibleRing="outside" focusRingColor="janeq.focus">
                    {custom ? 'Use time slider' : 'Enter hours and minutes'}
                  </Button>
                  <Text fontSize="sm" color="janeq.muted">The test submits your saved answers when time runs out.</Text>
                </Stack>
              ) : null}
            </Dialog.Body>
            <Dialog.Footer px={{ base: '4', sm: '6' }} pb="5" pt="4" gap="3">
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" bg="white" borderColor="janeq.line" color="janeq.ink" fontFamily="body" rounded="lg"
                  _hover={{ bg: 'janeq.library' }}
                  focusVisibleRing="outside" focusRingColor="janeq.focus">Cancel</Button>
              </Dialog.ActionTrigger>
              <PrimaryButton disabled={timed && !valid} fontFamily="body" rounded="lg"
                focusVisibleRing="outside" onClick={handleStart}>Start test</PrimaryButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
