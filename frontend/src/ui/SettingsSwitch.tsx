import { Switch, type SwitchRootProps } from '@chakra-ui/react'

type SettingsSwitchProps = Pick<SwitchRootProps, 'checked' | 'disabled' | 'onCheckedChange'> & {
  label: string
}

export function SettingsSwitch({ label, ...props }: SettingsSwitchProps) {
  return <Switch.Root minH="10" gap="3" {...props}>
    <Switch.HiddenInput role="switch" />
    <Switch.Control focusRingColor="janeq.focus" _checked={{ bg: 'janeq.blue' }} _motionReduce={{ transition: 'none' }}>
      <Switch.Thumb _checked={{ bg: 'white' }} _motionReduce={{ transition: 'none' }} />
    </Switch.Control>
    <Switch.Label lineHeight="short">{label}</Switch.Label>
  </Switch.Root>
}
