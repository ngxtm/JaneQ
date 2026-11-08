import { Box, Button, chakra, Field, Flex, Heading, HStack, Input, Link, Stack, Text, Textarea, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft, IconNotebook, IconPencil, IconPlus } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode, type SubmitEvent } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { mySetsHref, studySetHref } from '../navigation/app-location'
import type { StudySet } from '../study-sets/api'
import { getEditor, saveEditor, type SetContent, type SetRevision } from './api'
import { DiscardChangesDialog } from './DiscardChangesDialog'
import { QuestionFields, type QuestionField } from './QuestionFields'
import './bones/registry'

type EditorProps = {
  id?: string
  onSaved: (set: StudySet) => void
  onSessionExpired: () => void
}

type EditorFormState = Omit<SetContent, 'questions'> & { questions: QuestionField[] }
type EditorLoad = { kind: 'loading'; showSkeleton: boolean } | { kind: 'error'; missing: boolean } | { kind: 'loaded'; data: SetRevision }

function initialForm(content?: SetRevision): EditorFormState {
  return {
    title: content?.title ?? '',
    description: content?.description ?? '',
    questions: content?.questions.map((question, index) => ({
      ...question,
      key: `saved-${index}`,
      options: question.options.map((option, index) => ({ ...option, key: `saved-${index}` })),
    })) ?? [],
  }
}

function isReady(questions: QuestionField[]) {
  return questions.length > 0 && questions.every(({ prompt, options }) => {
    const filled = options.filter(({ text }) => text.trim())
    return Boolean(prompt.trim()) && filled.length >= 2 && filled.some(({ is_correct }) => is_correct)
  })
}

function EditorTopBar({ editing, action, children }: PropsWithChildren<{ editing: boolean; action?: ReactNode }>) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (document.activeElement === document.body) heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <Stack position="sticky" top="2" zIndex="sticky" bg="white" p={{ base: '3', md: '4' }} rounded="xl"
      border="1px solid" borderColor="janeq.divider" shadow="lg" gap="3">
      <Flex align="center" justify="space-between" gap="3">
        <HStack gap="3" minW="0">
          <Box aria-hidden="true" color="blue.700" display={{ base: 'none', sm: 'block' }}><IconPencil size={22} /></Box>
          <Stack gap="0">
            <Heading as="h1" ref={heading} tabIndex={-1} size="lg" _focus={{ outline: 'none' }}>
              {editing ? 'Edit set' : 'Create set'}
            </Heading>
            <Text fontSize="sm" color="janeq.muted">Private study set</Text>
          </Stack>
        </HStack>
        {action}
      </Flex>
      {children}
    </Stack>
  )
}

function EditorForm({ id, data, onSaved }: Pick<EditorProps, 'id' | 'onSaved'> & { data?: SetRevision }) {
  const [form, setForm] = useState(() => initialForm(data))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [focusKey, setFocusKey] = useState<string>()
  const [issue, setIssue] = useState<{ message: string; status?: number }>({ message: '' })
  const title = useRef<HTMLInputElement>(null)
  const nextKey = useRef(0)
  const savingRequest = useRef(false)
  const [creationKey] = useState(() => id ? undefined : crypto.randomUUID?.())

  function newOption() {
    return { key: `new-${nextKey.current++}`, text: '', is_correct: false }
  }

  function updateForm(fields: Partial<EditorFormState>) {
    setForm((current) => ({ ...current, ...fields }))
    setDirty(true)
  }

  function updateQuestion(question: QuestionField) {
    updateForm({ questions: form.questions.map((current) => current.key === question.key ? question : current) })
  }

  function addQuestion() {
    const question = { key: `new-${nextKey.current++}`, prompt: '', options: [newOption()] }
    updateForm({ questions: [...form.questions, question] })
    setFocusKey(question.key)
  }

  function addOption(question: QuestionField) {
    const option = newOption()
    updateQuestion({ ...question, options: [...question.options, option] })
    setFocusKey(option.key)
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRequest.current) return
    if (!form.title.trim()) {
      setIssue({ message: 'Enter a title for your study set.' })
      title.current?.focus()
      return
    }

    const content = {
      title: form.title,
      description: form.description,
      questions: form.questions.map(({ prompt, options }) => ({
        prompt, options: options.map(({ text, is_correct }) => ({ text, is_correct })),
      })),
    }
    savingRequest.current = true
    setSaving(true)
    setIssue({ message: '' })
    try {
      onSaved(await saveEditor(content, id && data ? { id, revision: data.revision } : { creationKey }))
    } catch (error) {
      const status = httpStatus(error)
      const message = status === 401
        ? 'Your session expired. Sign in again, then retry saving here.'
        : httpErrorMessage(error, 'Could not save your study set. Try again.')
      setIssue({ message, status })
    } finally {
      savingRequest.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Stack asChild gap="6" css={{ '& :is(input, textarea, button)': { scrollMarginTop: '24' } }}>
        <form onSubmit={submit} aria-busy={saving || undefined}>
          <EditorTopBar editing={!!id} action={
            <PrimaryButton type="submit" fontFamily="body" disabled={saving} flexShrink="0">
              {isReady(form.questions) ? 'Save set' : 'Save draft'}
            </PrimaryButton>
          }>
            {issue.message ? (
              <Stack gap="1" role="alert" align="start" fontSize="sm" borderTop="1px solid" borderColor="janeq.divider" pt="3">
                <Text color="red.700">{issue.message}</Text>
                {issue.status === 409 && id ? <Link href={studySetHref(id, 'editor')} target="_blank" rel="noopener">Open latest version in a new tab</Link> : null}
                {issue.status === 409 && !id ? <Link href={mySetsHref} target="_blank" rel="noopener">Review My sets in a new tab</Link> : null}
                {issue.status === 401 ? <Link href={mySetsHref} target="_blank" rel="noopener">Sign in in a new tab</Link> : null}
              </Stack>
            ) : null}
          </EditorTopBar>
          <chakra.fieldset display="flex" flexDirection="column" gap="6" minW="0" border="0" m="0" p="0" disabled={saving}>
            <Skeleton name="set-editor-details" loading={false}>
              <Stack gap="4">
                <Field.Root required>
                  <VisuallyHidden asChild><Field.Label>Title</Field.Label></VisuallyHidden>
                  <Input ref={title} value={form.title} required placeholder="Name your study set" h="auto" py="2"
                    variant="flushed" borderColor="janeq.line" fontFamily="heading"
                    fontSize={{ base: '2xl', md: '4xl' }} fontWeight="bold"
                    onChange={(event) => updateForm({ title: event.target.value })} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Description <Text as="span" color="janeq.muted">(optional)</Text></Field.Label>
                  <Textarea value={form.description} resize="vertical" rows={2} variant="subtle" bg="janeq.canvas"
                    rounded="lg" placeholder="What is this set about?"
                    onChange={(event) => updateForm({ description: event.target.value })} />
                </Field.Root>
              </Stack>
            </Skeleton>
            <Stack gap="1">
              <Heading as="h2" size="lg">Questions</Heading>
              <Text fontSize="sm" color="janeq.muted">Each question needs a prompt, at least two answer options, and one or more correct answers to be ready.</Text>
            </Stack>
            {form.questions.length === 0 ? (
              <HStack align="start" gap="3" bg="white" rounded="xl" border="1px solid" borderColor="janeq.divider" p="5">
                <Box aria-hidden="true" color="blue.700" mt="1"><IconNotebook size={24} /></Box>
                <Stack gap="1"><Heading as="h3" size="md">Add your first question</Heading>
                  <Text color="janeq.muted">Write a prompt, add answer options, then mark every correct choice.</Text></Stack>
              </HStack>
            ) : null}
            {form.questions.map((question, index) => (
              <QuestionFields key={question.key} question={question} number={index + 1} focusKey={focusKey} onChange={updateQuestion}
                onAddOption={() => addOption(question)}
                onRemove={() => updateForm({ questions: form.questions.filter((item) => item.key !== question.key) })} />
            ))}
            <Button type="button" variant="outline" fontFamily="body" h={{ base: '14', md: '24' }} rounded="xl"
              bg="white" borderColor="janeq.line" color="janeq.ink" _hover={{ bg: 'janeq.canvas' }} onClick={addQuestion}>
              <IconPlus size={20} /> Add question
            </Button>
          </chakra.fieldset>
        </form>
      </Stack>
      <DiscardChangesDialog dirty={dirty} saving={saving} />
    </>
  )
}

export default function SetEditor({ id, onSaved, onSessionExpired }: EditorProps) {
  const [load, setLoad] = useState<EditorLoad>({ kind: 'loading', showSkeleton: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => setLoad({ kind: 'loading', showSkeleton: true }), 200)
    getEditor(id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setLoad({ kind: 'loaded', data })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) onSessionExpired()
      else setLoad({ kind: 'error', missing: httpStatus(error) === 404 })
    }).finally(() => window.clearTimeout(timer))
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [id, attempt, onSessionExpired])

  return (
    <Stack maxW="6xl" mx="auto" gap="4">
      <Button asChild variant="ghost" size="sm" fontFamily="body" alignSelf="start"><a href={mySetsHref}><IconArrowLeft size={18} /> Back to My sets</a></Button>
      {!id || load.kind === 'loaded' ? (
        <EditorForm id={id} data={load.kind === 'loaded' ? load.data : undefined} onSaved={onSaved} />
      ) : (
        <Stack aria-busy={load.kind === 'loading' || undefined} gap="6">
          <EditorTopBar editing />
          {load.kind === 'loading' ? (
            <>
              <VisuallyHidden role="status">Loading editor…</VisuallyHidden>
              {load.showSkeleton ? <Box aria-hidden="true"><Skeleton name="set-editor-details" loading animate="solid">{null}</Skeleton></Box> : null}
            </>
          ) : (
            <Stack align="start" gap="3" p="5" bg="white" rounded="xl" border="1px solid" borderColor="janeq.divider">
              <HStack align="start" gap="3"><IconNotebook size={24} aria-hidden="true" />
                <Stack gap="1" role="alert">
                  <Heading as="h2" size="md">{load.missing ? 'This set is unavailable for editing' : 'Could not load the editor'}</Heading>
                  <Text color="janeq.muted">{load.missing ? 'Open one of your own study sets from My sets.' : 'Try loading the study set again.'}</Text>
                </Stack>
              </HStack>
              {!load.missing ? <Button variant="outline" fontFamily="body" onClick={() => {
                setLoad({ kind: 'loading', showSkeleton: false })
                setAttempt((value) => value + 1)
              }}>Try again</Button> : null}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  )
}
