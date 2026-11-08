import { Button } from '@chakra-ui/react'
import type { ComponentPropsWithRef } from 'react'

export function PrimaryButton(props: ComponentPropsWithRef<typeof Button>) {
  return <Button bg="janeq.blue" color="white" focusRingColor="janeq.focus"
    _hover={{ bg: 'janeq.blueHover' }} {...props} />
}
