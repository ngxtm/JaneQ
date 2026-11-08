import { Badge, Box, Button, Flex, Grid, Heading, HStack, Stack, Text, VisuallyHidden, chakra } from '@chakra-ui/react'
import { IconArrowLeft, IconCircleCheck } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { httpErrorMessage, httpStatus, isUnauthorized } from '../../http'
import { getAnswerKey, saveAnswerKey, type AnswerKey, type AnswerKeyQuestion, type AnswerSelections } from './answer-key-api'
import type { StudySet } from './api'
import { studySetHref } from './library-navigation'

function savedSelections(key: AnswerKey): AnswerSelections {
  return Object.fromEntries(key.questions.map((question) => [
    question.id, question.options.filter((option) => option.is_correct).map((option) => option.id),
  ]))
}

function QuestionCard({ question, index, selected, saving, onToggle }: {
  question: AnswerKeyQuestion
  index: number
  selected: string[]
  saving: boolean
  onToggle: (option: string) => void
}) {
  const titleId = `answer-key-${question.id}`
  return (
    <Grid as="section" aria-labelledby={titleId} templateColumns={{ base: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(0, 3fr)' }}
      gap={{ base: '4', md: '8' }} p={{ base: '4', md: '6' }} bg="white" border="1px solid"
      borderColor="janeq.divider" rounded="xl" shadow="sm">
      <Stack gap="2">
        <Text fontSize="sm" fontWeight="semibold" color="janeq.muted">Question {index + 1}</Text>
        <Heading as="h2" id={titleId} size="md" whiteSpace="pre-wrap" overflowWrap="anywhere">
          {question.prompt}
        </Heading>
      </Stack>
      <Stack role="group" aria-label={`Correct answers for question ${index + 1}`} gap="2">
        {question.options.length === 0 ? <Text color="janeq.muted">This question has no available options.</Text> : null}
        {question.options.map((option) => {
          const checked = selected.includes(option.id)
          return (
            <Flex as="label" key={option.id} align="flex-start" gap="3" px="3" py="2.5" rounded="lg"
              border="1px solid" borderColor={checked ? 'janeq.blue' : 'janeq.divider'}
              bg={checked ? 'blue.50' : 'white'} cursor={saving ? 'default' : 'pointer'}
              _focusWithin={{ outline: '2px solid', outlineColor: 'janeq.focus', outlineOffset: '2px' }}>
              <chakra.input type="checkbox" checked={checked} disabled={saving} onChange={() => onToggle(option.id)}
                accentColor="janeq.blue" boxSize="4" mt="1" flexShrink="0" scrollMarginTop="36" />
              <Text as="span" whiteSpace="pre-wrap" overflowWrap="anywhere">{option.text}</Text>
            </Flex>
          )
        })}
      </Stack>
    </Grid>
  )
}

export default function AnswerKeyEditor({ set, onUpdated, onSessionExpired }: {
  set: StudySet
  onUpdated: (id: string, key: AnswerKey) => void
  onSessionExpired: () => void
}) {
  const [key, setKey] = useState<AnswerKey>()
  const [selected, setSelected] = useState<AnswerSelections>({})
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const request = useRef<AbortController>(null)
  const savingRef = useRef(false)
  const setId = set.id

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    getAnswerKey(setId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setKey(result)
      setSelected(savedSelections(result))
      onUpdated(setId, result)
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(failure)) onSessionExpired()
      else setError(httpErrorMessage(failure, 'Could not load the answer key.'))
    })
    return () => controller.abort()
  }, [attempt, onSessionExpired, onUpdated, setId])

  useEffect(() => {
    if (document.activeElement === document.body) heading.current?.focus()
  }, [])

  const dirty = key?.questions.some((question) => {
    const ids = selected[question.id] ?? []
    return question.options.some((option) => ids.includes(option.id) !== option.is_correct)
  }) ?? false

  function reload() {
    setKey(undefined)
    setError('')
    setConflict(false)
    setSaved(false)
    setAttempt((current) => current + 1)
  }

  function toggle(questionId: string, optionId: string) {
    setSaved(false)
    setSelected((current) => {
      const ids = current[questionId]
      const next = ids.includes(optionId) ? ids.filter((id) => id !== optionId) : [...ids, optionId]
      return { ...current, [questionId]: next }
    })
  }

  async function save() {
    const controller = request.current
    if (!key || !controller || !dirty || conflict || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const result = await saveAnswerKey(setId, key.revision, selected, controller.signal)
      if (controller.signal.aborted) return
      setKey(result)
      setSelected(savedSelections(result))
      setSaved(true)
      onUpdated(setId, result)
    } catch (failure) {
      if (controller.signal.aborted) return
      if (isUnauthorized(failure)) onSessionExpired()
      else {
        setConflict(httpStatus(failure) === 409)
        setError(httpErrorMessage(failure, 'Could not save the answer key. Try again.'))
      }
    } finally {
      savingRef.current = false
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  const ready = (key?.status ?? set.status) === 'ready'
  return (
    <Stack gap="6" w="full">
      <Box>
        <Button asChild variant="ghost"><a href={ready ? studySetHref(setId) : '#home'}>
          <IconArrowLeft size={18} /> {ready ? 'Back to study set' : 'Back to Home'}
        </a></Button>
      </Box>
      <form onSubmit={(event) => { event.preventDefault(); void save() }}>
        <Stack gap="6">
          <Flex as="header" position="sticky" top="2" zIndex="1" bg="white" p={{ base: '3', md: '5' }}
            rounded="xl" shadow="sm" border="1px solid" borderColor="janeq.divider"
            justify="space-between" align={{ base: 'start', md: 'center' }} gap={{ base: '2', md: '4' }}
            direction={{ base: 'column', md: 'row' }}>
            <Stack gap="2">
              <Heading ref={heading} tabIndex={-1} as="h1" fontSize={{ base: 'xl', md: '3xl' }} _focus={{ outline: 'none' }}>Set answer key</Heading>
              <HStack gap="3" flexWrap="wrap">
                <Text fontWeight="semibold">{key?.title ?? set.title}</Text>
                <Badge colorPalette={ready ? 'green' : 'gray'}>{ready ? 'Ready' : 'Draft'}</Badge>
              </HStack>
            </Stack>
            {key ? (
              <HStack gap="3" flexWrap="wrap">
                {ready && !dirty ? <Button asChild variant="outline" bg="transparent" borderStyle="solid">
                  <a href={studySetHref(setId)}>Open study set</a>
                </Button> : null}
                <Button type="submit" disabled={!dirty || saving || conflict} bg="janeq.blue" color="white" _hover={{ bg: 'janeq.blueHover' }}>
                  Save answer key
                </Button>
              </HStack>
            ) : null}
          </Flex>
          {!key && !error ? <VisuallyHidden role="status">Loading answer key…</VisuallyHidden> : null}
          {error ? <Stack role="alert" align="start" gap="2">
            <Text color="red.700">{error}</Text>
            {conflict ? <>
              <Text color="janeq.muted">Reloading discards unsaved selections.</Text>
              <Button type="button" variant="outline" onClick={reload}>Reload saved key</Button>
            </> : !key ? <Button type="button" variant="outline" onClick={reload}>Try again</Button> : null}
          </Stack> : null}
          {key ? <>
            <Stack gap="1">
              <Text color="janeq.muted">Select every correct option. Questions without a saved answer keep the set in Draft.</Text>
              <Text role="status">{key.configured_count} of {key.questions.length} answer keys set{dirty ? ' · Unsaved changes' : ''}</Text>
              {saved ? <HStack role="status" color="green.700"><IconCircleCheck size={18} /> <Text>Answer key saved.</Text></HStack> : null}
            </Stack>
            {key.questions.length === 0 ? <Text color="janeq.muted">This set has no questions.</Text> : null}
            {key.questions.map((question, index) => (
              <QuestionCard key={question.id} question={question} index={index} selected={selected[question.id] ?? []}
                saving={saving} onToggle={(optionId) => toggle(question.id, optionId)} />
            ))}
          </> : null}
        </Stack>
      </form>
    </Stack>
  )
}
