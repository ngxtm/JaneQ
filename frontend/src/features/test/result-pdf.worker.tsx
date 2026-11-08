/* oxlint-disable react/only-export-components -- The PDF worker owns its React components. */
import { Circle, Document, G, Page, Path, pdf, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import type { PdfReply, PdfRequest } from './pdf-download'
import { preparePdfText, type PdfFonts, UnsupportedPdfText } from './pdf-fonts'
import type { MarkShape, PdfMark } from './pdf-mark'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Open Sans', fontSize: 11, lineHeight: 1.4, color: '#1a202c',
    paddingTop: 87, paddingBottom: 62, paddingHorizontal: 46,
  },
  header: {
    position: 'absolute', top: 32, left: 46, right: 46, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', borderBottom: '1pt solid #dbe3ed', paddingBottom: 11,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandName: { fontSize: 13, fontWeight: 700 },
  eyebrow: { fontSize: 9, letterSpacing: 1, fontWeight: 700, color: '#0036b4' },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: '#f3f7fd',
    borderLeft: '3pt solid #1858f5', borderRadius: 4, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 23,
  },
  score: { fontSize: 16, fontWeight: 700, color: '#0036b4', marginBottom: 4 },
  scoreDetails: { fontSize: 10.5, color: '#4c5f77' },
  submission: { flex: 1, borderLeft: '1pt solid #dbe3ed', paddingLeft: 16, gap: 4 },
  metadata: { fontSize: 10.5 },
  label: { fontWeight: 700 },
  reviewTitle: { fontSize: 13, fontWeight: 700, paddingBottom: 7, borderBottom: '1pt solid #dbe3ed' },
  question: { paddingTop: 9 },
  questionDivider: { paddingBottom: 11, borderBottom: '1pt solid #dbe3ed' },
  questionHeading: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  questionNumber: { fontSize: 9, color: '#4c5f77', fontWeight: 700 },
  correct: { fontSize: 9, fontWeight: 700, color: '#186345' },
  incorrect: { fontSize: 9, fontWeight: 700, color: '#a12532' },
  prompt: { marginBottom: 5 },
  answer: { flexDirection: 'row', gap: 10, fontSize: 10.5, marginTop: 3 },
  answerLabel: { width: 95, fontWeight: 700, color: '#4c5f77' },
  answerValues: { flex: 1 },
  footer: {
    position: 'absolute', top: 790, left: 46, right: 46, flexDirection: 'row', justifyContent: 'space-between',
    borderTop: '1pt solid #dbe3ed', paddingTop: 8, color: '#4c5f77', fontSize: 9,
  },
})

function renderMark(shape: MarkShape, index: number): ReactNode {
  switch (shape.kind) {
    case 'group':
      return <G key={index} {...shape.paint}>{shape.children.map(renderMark)}</G>
    case 'path':
      return <Path key={index} {...shape.paint} d={shape.d} />
    case 'circle':
      return <Circle key={index} {...shape.paint} cx={shape.cx} cy={shape.cy} r={shape.r} />
  }
}

function JaneQMark({ mark }: { mark: PdfMark }) {
  return <Svg width={24} height={24} viewBox={mark.viewBox}>{mark.shapes.map(renderMark)}</Svg>
}

function fontRuns(fonts: PdfFonts, text: string, weight?: number) {
  return fonts(text, weight).map(({ text, fontFamily, fontWeight }, index) => (
    <Text key={index} style={{ fontFamily, fontWeight }}>{text}</Text>
  ))
}

function AnswerLine({ label, answers, fonts }: { label: string; answers: string[]; fonts: PdfFonts }) {
  return (
    <View style={styles.answer}>
      <Text style={styles.answerLabel}>{label}</Text>
      <Text style={styles.answerValues}>{fontRuns(fonts, answers.join('\n'))}</Text>
    </View>
  )
}

function fitsWithReview(prompt: string, selected: string[], correct: string[]) {
  // Keep ordinary reviews together while allowing unusually long content to span pages.
  const lines = [prompt, ...selected, ...correct].flatMap((text) => text.split('\n'))
  return lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 32)), 0) <= 24
}

const submissionDate = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset',
})
const exportDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

function ResultPdf({ result, exportedAt, mark, fonts }: PdfRequest & { fonts: PdfFonts }) {
  const submittedAt = submissionDate.format(new Date(result.submitted_at))

  return (
    <Document title={`${result.title} - JaneQ test results`} author="JaneQ" language="en">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            <JaneQMark mark={mark} />
            <Text style={styles.brandName}>JaneQ</Text>
          </View>
          <Text style={styles.eyebrow}>TEST RESULTS</Text>
        </View>
        <Text style={styles.title} minPresenceAhead={55}>{fontRuns(fonts, result.title, 700)}</Text>
        <View style={styles.summary} wrap={false}>
          <View>
            <Text style={styles.score}>{result.score} / {result.total} ({result.percent}%)</Text>
            <Text style={styles.scoreDetails}>{result.score} correct / {result.total - result.score} incorrect</Text>
          </View>
          <View style={styles.submission}>
            <Text style={styles.metadata}><Text style={styles.label}>Submitted by</Text>  {fontRuns(fonts, result.submitted_by)}</Text>
            <Text style={styles.metadata}><Text style={styles.label}>Submitted at</Text>  {submittedAt}</Text>
          </View>
        </View>
        <Text style={styles.reviewTitle} minPresenceAhead={55}>Question review</Text>
        {result.questions.map((question, index) => {
          const selected = question.options.filter((option) => option.selected).map((option) => option.text)
          const correct = question.options.filter((option) => option.correct).map((option) => option.text)
          const style = index === result.questions.length - 1 ? styles.question : [styles.question, styles.questionDivider]
          return (
            <View style={style} key={question.id} wrap={!fitsWithReview(question.prompt, selected, correct)}>
              <View style={styles.questionHeading} minPresenceAhead={32}>
                <Text style={styles.questionNumber}>Question {index + 1}</Text>
                <Text style={question.correct ? styles.correct : styles.incorrect}>
                  {question.correct ? 'Correct' : 'Incorrect'}
                </Text>
              </View>
              <Text style={styles.prompt}>{fontRuns(fonts, question.prompt)}</Text>
              <AnswerLine label="Your answer" answers={selected} fonts={fonts} />
              <AnswerLine label="Correct answer" answers={correct} fonts={fonts} />
            </View>
          )
        })}
        <View style={styles.footer} fixed>
          <Text>JaneQ  |  Exported {exportDate.format(exportedAt)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

self.onmessage = async ({ data }: MessageEvent<PdfRequest>) => {
  const { result } = data
  let reply: PdfReply
  try {
    const regular = [
      result.submitted_by,
      ...result.questions.flatMap((question) => [
        question.prompt,
        ...question.options.filter((option) => option.selected || option.correct).map((option) => option.text),
      ]),
    ]
    const fonts = await preparePdfText(regular, result.title)
    const file = await pdf(<ResultPdf {...data} fonts={fonts} />).toBlob()
    reply = { kind: 'success', file }
  } catch (error) {
    reply = error instanceof UnsupportedPdfText ? { kind: 'unsupported-text' } : { kind: 'error' }
  }
  self.postMessage(reply)
}
