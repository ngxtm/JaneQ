import { Box, Button, chakra, createToaster, Heading, HStack, Link, Stack, Text, VisuallyHidden } from '@chakra-ui/react'
import { IconNotebook, IconPlus } from '@tabler/icons-react'
import { Skeleton } from 'boneyard-js/react'
import { useEffect, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { mySetsHref, studySetHref } from '../navigation/app-location'
import type { StudySet } from '../study-sets/api'
import { getEditor, saveEditor, type SetRevision } from './api'
import { DiscardChangesDialog } from './DiscardChangesDialog'
import { EditorDetails, type EditorMetadata } from './EditorDetails'
import { EditorToolbar } from './EditorToolbar'
import { EditorTopBar } from './EditorTopBar'
import { EditorToast } from './EditorToast'
import { QuestionFields, type QuestionField } from './QuestionFields'
import { SetDeleteMenu, type OnSetDeleted } from './SetDeleteMenu'
import { questionErrors } from './validation'
import './bones/registry'

type EditorProps = {
  id?: string
  onSaved: (set: StudySet) => void
  onDeleted: OnSetDeleted
  onSessionExpired: () => void
}

type EditorFormState = EditorMetadata & { questions: QuestionField[] }
type EditorLoad = { kind: 'loading'; showSkeleton: boolean } | { kind: 'error'; missing: boolean } | { kind: 'loaded'; data: SetRevision }
type EditorIssue = { message: string; status?: number }
type ValidationFocus = { kind: 'title' | 'add-question' } | { kind: 'question'; key: string }
const validationToastId = 'editor-validation'

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
  const [busy, setBusy] = useState(false)
  const [focusKey, setFocusKey] = useState<string>()
  const [validationFocus, setValidationFocus] = useState<ValidationFocus | null>(null)
  const [issue, setIssue] = useState<EditorIssue>({ message: '' })
  const [toaster] = useState(() => createToaster({ placement: 'top-end', max: 1 }))
  const editor = useRef<HTMLFormElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const addQuestionButton = useRef<HTMLButtonElement>(null)
  const shake = useRef<Animation | null>(null)
  const nextKey = useRef(0)
  const mutationPending = useRef(false)
  const [creationKey] = useState(() => id ? undefined : crypto.randomUUID?.())

  useEffect(() => () => { toaster.remove() }, [toaster])

  useLayoutEffect(() => {
    if (!validationFocus) return
    let target: HTMLElement | null
    if (validationFocus.kind === 'question') {
      const card = document.getElementById(`question-${validationFocus.key}-card`)
      target = card?.querySelector<HTMLElement>('textarea[aria-invalid="true"], input:not([type="checkbox"])[aria-invalid="true"]')
        ?? card?.querySelector<HTMLElement>('[data-validation-focus]') ?? null
    } else {
      target = validationFocus.kind === 'title' ? title.current : addQuestionButton.current
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' })
    if (!reducedMotion) {
      shake.current = editor.current?.animate(
        [0, -6, 5, -3, 2, 0].map((offset) => ({ transform: `translateX(${offset}px)` })),
        { duration: 280, easing: 'ease-out' },
      ) ?? null
    }
    return () => { shake.current?.cancel() }
  }, [validationFocus])

  function setMutationPending(pending: boolean) {
    mutationPending.current = pending
    setBusy(pending)
  }

  function newOption() {
    return { key: `new-${nextKey.current++}`, text: '', is_correct: false }
  }

  function updateForm(fields: Partial<EditorFormState>) {
    toaster.dismiss(validationToastId)
    setForm((current) => ({ ...current, ...fields }))
    setDirty(true)
  }

  function updateQuestion(question: QuestionField) {
    updateForm({ questions: form.questions.map((current) => current.key === question.key ? question : current) })
  }

  function addQuestion() {
    const question = { key: `new-${nextKey.current++}`, prompt: '', options: [newOption(), newOption()] }
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
    setIssue({ message: '' })

    function reject(focus: ValidationFocus, description: string) {
      setValidationFocus(focus)
      toaster.create({ id: validationToastId, type: 'error', title: 'Could not save set', description, closable: true })
    }

    if (!form.title.trim()) {
      reject({ kind: 'title' }, 'Enter a title for your study set.')
      return
    }
    if (!form.questions.length) {
      reject({ kind: 'add-question' }, 'Add at least one question before saving.')
      return
    }
    const invalidQuestions = form.questions.flatMap((question, index) => {
      const errors = questionErrors(question)
      return errors ? [{ key: question.key, number: index + 1, errors }] : []
    })
    const firstInvalid = invalidQuestions[0]
    if (firstInvalid) {
      const { errors, key, number } = firstInvalid
      const onlyMissingAnswer = errors.missingAnswer && !errors.missingPrompt && !errors.missingOptions && !errors.optionIssues.size
      const description = invalidQuestions.length > 1 ? `${invalidQuestions.length} questions need attention.`
        : onlyMissingAnswer ? `Question ${number} needs at least one correct answer.` : `Review the fields in question ${number}.`
      reject({ kind: 'question', key }, description)
      return
    }

    toaster.dismiss(validationToastId)
    setValidationFocus(null)
    const content = {
      title: form.title,
      description: form.description,
      questions: form.questions.map(({ prompt, options }) => ({
        prompt, options: options.map(({ text, is_correct }) => ({ text, is_correct })),
      })),
    }
    setMutationPending(true)
    try {
      onSaved(await saveEditor(content, id && data ? { id, revision: data.revision } : { creationKey }))
    } catch (error) {
      const status = httpStatus(error)
      const message = status === 401
        ? 'Your session expired. Sign in again, then retry saving here.'
        : httpErrorMessage(error, 'Could not save your study set. Try again.')
      setIssue({ message, status })
    } finally {
      setMutationPending(false)
    }
  }

  return (
    <>
      <Stack asChild gap={{ base: '6', md: '8' }} css={{ '& :is(input, textarea, button)': { scrollMarginTop: '24' } }}>
        <form ref={editor} noValidate onSubmit={submit} aria-busy={busy || undefined} onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)
            && event.target instanceof Node && event.currentTarget.contains(event.target)) {
            event.preventDefault()
            event.currentTarget.requestSubmit()
          }
        }}>
          <EditorTopBar editing={!!id} status={dirty ? 'Unsaved changes' : data ? savedStatus(data) : 'Private study set'}
            action={<>
              <PrimaryButton type="submit" fontFamily="body" fontWeight="bold" disabled={busy} flexShrink="0">
                {id ? 'Done' : 'Save set'}
              </PrimaryButton>
              {id && data ? <SetDeleteMenu id={id} title={data.title} revision={data.revision} disabled={busy}
                onDeleted={onDeleted} onPendingChange={setMutationPending} /> : null}
            </>
          }>
            {issue.message ? (
              <Stack gap="1" role="alert" align="start" fontSize="sm" borderTop="1px solid" borderColor="janeq.divider" pt="3">
                <Text color="red.700">{issue.message}</Text>
                {issue.status === 409 && id ? <Link href={studySetHref(id, 'editor')} target="_blank" rel="noopener">Open latest version in a new tab</Link> : null}
                {(issue.status === 409 || issue.status === 410) && !id ? <Link href={mySetsHref} target="_blank" rel="noopener">Open My sets in a new tab</Link> : null}
                {issue.status === 401 ? <Link href={mySetsHref} target="_blank" rel="noopener">Sign in in a new tab</Link> : null}
              </Stack>
            ) : null}
          </EditorTopBar>
          <chakra.fieldset display="flex" flexDirection="column" gap={{ base: '6', md: '8' }} minW="0" border="0" m="0" p="0" disabled={busy}>
            <EditorDetails metadata={form} titleRef={title} titleInvalid={!!validationFocus && !form.title.trim()}
              questionCount={questionCountLabel(form.questions.length)} onChange={updateForm} />
            <EditorToolbar count={form.questions.length} onReverse={() => updateForm({ questions: form.questions.toReversed() })} />
            <Stack gap="4">
              <VisuallyHidden as="h2">Questions</VisuallyHidden>
              {form.questions.length === 0 ? (
                <HStack align="start" gap="3" bg="white" rounded="xl" border="1px solid"
                  borderColor={validationFocus ? 'red.600' : 'janeq.divider'} p="5">
                  <Box aria-hidden="true" color="blue.700" mt="1"><IconNotebook size={24} /></Box>
                  <Stack gap="1"><Heading as="h3" size="md">Add your first question</Heading>
                    <Text id="editor-empty-questions" color={validationFocus ? 'red.700' : 'janeq.muted'}>
                      {validationFocus ? 'Add at least one question before saving.' : 'Write a prompt, enter at least two options, then mark every correct choice.'}
                    </Text></Stack>
                </HStack>
              ) : null}
              {form.questions.map((question, index) => (
                <QuestionFields key={question.key} question={question} number={index + 1} focusKey={focusKey} onChange={updateQuestion}
                  errors={validationFocus ? questionErrors(question) : undefined}
                  count={form.questions.length} onMove={moveQuestion}
                  onAddOption={() => addOption(question)}
                  onRemove={() => updateForm({ questions: form.questions.filter((item) => item.key !== question.key) })} />
              ))}
            </Stack>
            <Button ref={addQuestionButton} type="button" variant="outline" fontFamily="body" h={{ base: '14', md: '24' }} rounded="xl"
              aria-describedby={form.questions.length === 0 ? 'editor-empty-questions' : undefined}
              bg="white" borderColor="janeq.line" color="janeq.ink" _hover={{ bg: 'janeq.canvas' }} onClick={addQuestion}>
              <IconPlus size={20} /> Add question
            </Button>
          </chakra.fieldset>
        </form>
      </Stack>
      <EditorToast toaster={toaster} />
      <DiscardChangesDialog dirty={dirty} saving={busy} />
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
