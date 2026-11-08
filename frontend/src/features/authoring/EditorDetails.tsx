import { Field, Input, Stack, Text, Textarea, VisuallyHidden } from '@chakra-ui/react'
import { Skeleton } from 'boneyard-js/react'
import type { Ref } from 'react'

export type EditorMetadata = { title: string; description: string }

export function EditorDetails({ metadata, titleRef, questionCount, onChange }: {
  metadata: EditorMetadata
  titleRef: Ref<HTMLInputElement>
  questionCount: string
  onChange: (fields: Partial<EditorMetadata>) => void
}) {
  return (
    <Skeleton name="set-editor-details" loading={false}>
      <Stack gap="6">
        <Field.Root gap="0" required>
          <VisuallyHidden asChild><Field.Label>Title</Field.Label></VisuallyHidden>
          <Input ref={titleRef} value={metadata.title} required placeholder="Set title" h="auto" py="2"
            variant="flushed" borderColor="transparent" fontFamily="heading"
            fontSize={{ base: '2xl', sm: '3xl', md: '5xl' }} fontWeight="bold" color="janeq.ink"
            onChange={(event) => onChange({ title: event.target.value })} />
          <Text color="janeq.muted">{questionCount}</Text>
        </Field.Root>
        <Field.Root>
          <VisuallyHidden asChild><Field.Label>Description (optional)</Field.Label></VisuallyHidden>
          <Textarea value={metadata.description} resize="vertical" minH={{ base: '24', md: '36' }} variant="subtle"
            bg="janeq.divider" rounded="lg" placeholder="Add a description..."
            onChange={(event) => onChange({ description: event.target.value })} />
        </Field.Root>
      </Stack>
    </Skeleton>
  )
}
