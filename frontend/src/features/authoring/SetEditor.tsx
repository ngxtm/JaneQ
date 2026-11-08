import { Box, Button, chakra, Heading, HStack, Link, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconNotebook, IconPlus } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { mySetsHref, studySetHref } from '../navigation/app-location'
import type { StudySet } from '../study-sets/api'
import { deleteEditorSet, getEditor, saveEditor, type SetRevision } from './api'
import { DeleteSetDialog } from './DeleteSetDialog'
import { DiscardChangesDialog } from './DiscardChangesDialog'
import { EditorDetails, type EditorMetadata } from './EditorDetails'
import { EditorToolbar } from './EditorToolbar'
import { EditorTopBar } from './EditorTopBar'
import { QuestionFields, type QuestionField } from './QuestionFields'
import './bones/registry'

type EditorProps = {
  id?: string
  onSaved: (set: StudySet) => void
  onDeleted: (id: string) => void
  onSessionExpired: () => void
}

type EditorFormState = EditorMetadata & { questions: QuestionField[] }
type EditorLoad = { kind: 'loading'; showSkeleton: boolean } | { kind: 'error'; missing: boolean } | { kind: 'loaded'; data: SetRevision }
type EditorIssue = { message: string; status?: number }

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

function questionCountLabel(count: number) {
  return `${count} ${count === 1 ? 'question' : 'questions'}`
}

function savedStatus(data: SetRevision) {
  const count = `${questionCountLabel(data.questions.length)} saved`
  if (!data.saved_at) return count
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(data.saved_at)) / 60_000))
  if (!minutes) return `${count} just now`
  const relative = new Intl.RelativeTimeFormat('en')
  if (minutes < 60) return `${count} ${relative.format(-minutes, 'minute')}`
  if (minutes < 1440) return `${count} ${relative.format(-Math.floor(minutes / 60), 'hour')}`
  return `${count} ${relative.format(-Math.floor(minutes / 1440), 'day')}`
}

function EditorForm({ id, data, onSaved, onDeleted }: Pick<EditorProps, 'id' | 'onSaved' | 'onDeleted'> & { data?: SetRevision }) {
  const [form, setForm] = useState(() => initialForm(data))
  const [dirty, setDirty] = useState(false)
  const [operation, setOperation] = useState<'save' | 'delete' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [focusKey, setFocusKey] = useState<string>()
  const [issue, setIssue] = useState<EditorIssue>({ message: '' })
  const [deleteIssue, setDeleteIssue] = useState<EditorIssue>({ message: '' })
  const title = useRef<HTMLInputElement>(null)
  const nextKey = useRef(0)
  const mutationPending = useRef(false)
  const [creationKey] = useState(() => id ? undefined : crypto.randomUUID?.())
  const busy = operation !== null

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

  function moveQuestion(key: string, destination: number) {
    const source = form.questions.findIndex((question) => question.key === key)
    if (source < 0 || source === destination || destination < 0 || destination >= form.questions.length) return
    const questions = form.questions.slice()
    const [question] = questions.splice(source, 1)
    questions.splice(destination, 0, question)
    updateForm({ questions })
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutationPending.current) return
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
    mutationPending.current = true
    setOperation('save')
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
      mutationPending.current = false
      setOperation(null)
    }
  }

  async function removeSet() {
    if (!id || !data || mutationPending.current) return
    mutationPending.current = true
    setOperation('delete')
    setDeleteIssue({ message: '' })
    try {
      await deleteEditorSet(id, data.revision)
      onDeleted(id)
    } catch (error) {
      const status = httpStatus(error)
      if (status === 404) {
        onDeleted(id)
      } else {
        const message = status === 401
          ? 'Your session expired. Sign in again, then retry deleting here.'
          : httpErrorMessage(error, 'Could not delete this set. Try again.')
        setDeleteIssue({ message, status })
      }
    } finally {
      mutationPending.current = false
      setOperation(null)
    }
  }

  return (
    <>
      <Stack asChild gap={{ base: '6', md: '8' }} css={{ '& :is(input, textarea, button)': { scrollMarginTop: '24' } }}>
        <form onSubmit={submit} aria-busy={busy || undefined} onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)
            && event.target instanceof Node && event.currentTarget.contains(event.target)) {
            event.preventDefault()
            event.currentTarget.requestSubmit()
          }
        }}>
          <EditorTopBar editing={!!id} status={dirty ? 'Unsaved changes' : data ? savedStatus(data) : 'Private study set'}
            busy={busy} onDelete={id ? () => { setDeleteIssue({ message: '' }); setDeleteOpen(true) } : undefined} action={
            <PrimaryButton type="submit" fontFamily="body" fontWeight="bold" disabled={busy} flexShrink="0">
              {id ? 'Done' : isReady(form.questions) ? 'Save set' : 'Save draft'}
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
          <chakra.fieldset display="flex" flexDirection="column" gap={{ base: '6', md: '8' }} minW="0" border="0" m="0" p="0" disabled={busy}>
            <EditorDetails metadata={form} titleRef={title} questionCount={questionCountLabel(form.questions.length)} onChange={updateForm} />
            <EditorToolbar count={form.questions.length} onReverse={() => updateForm({ questions: form.questions.toReversed() })} />
            <Stack gap="4">
              <VisuallyHidden as="h2">Questions</VisuallyHidden>
              {form.questions.length === 0 ? (
                <HStack align="start" gap="3" bg="white" rounded="xl" border="1px solid" borderColor="janeq.divider" p="5">
                  <Box aria-hidden="true" color="blue.700" mt="1"><IconNotebook size={24} /></Box>
                  <Stack gap="1"><Heading as="h3" size="md">Add your first question</Heading>
                    <Text color="janeq.muted">Write a prompt, add answer options, then mark every correct choice.</Text></Stack>
                </HStack>
              ) : null}
              {form.questions.map((question, index) => (
                <QuestionFields key={question.key} question={question} number={index + 1} focusKey={focusKey} onChange={updateQuestion}
                  count={form.questions.length} onMove={moveQuestion}
                  onAddOption={() => addOption(question)}
                  onRemove={() => updateForm({ questions: form.questions.filter((item) => item.key !== question.key) })} />
              ))}
            </Stack>
            <Button type="button" variant="outline" fontFamily="body" h={{ base: '14', md: '24' }} rounded="xl"
              bg="white" borderColor="janeq.line" color="janeq.ink" _hover={{ bg: 'janeq.canvas' }} onClick={addQuestion}>
              <IconPlus size={20} /> Add question
            </Button>
          </chakra.fieldset>
        </form>
      </Stack>
      <DiscardChangesDialog dirty={dirty} saving={busy} />
      {id && data ? <DeleteSetDialog id={id} title={data.title} open={deleteOpen} busy={operation === 'delete'} issue={deleteIssue}
        onClose={() => setDeleteOpen(false)} onConfirm={() => void removeSet()} /> : null}
    </>
  )
}

export default function SetEditor({ id, onSaved, onDeleted, onSessionExpired }: EditorProps) {
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
    <Stack w="full" px={{ base: '2', sm: '0' }}>
      {!id || load.kind === 'loaded' ? (
        <EditorForm id={id} data={load.kind === 'loaded' ? load.data : undefined} onSaved={onSaved} onDeleted={onDeleted} />
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
              {load.missing ? <Button asChild variant="outline" fontFamily="body"><a href={mySetsHref}>Back to My sets</a></Button> : <Button variant="outline" fontFamily="body" onClick={() => {
                setLoad({ kind: 'loading', showSkeleton: false })
                setAttempt((value) => value + 1)
              }}>Try again</Button>}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  )
}
