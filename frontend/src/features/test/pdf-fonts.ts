import { Font } from '@react-pdf/renderer'
import boldFont from './fonts/OpenSans-Bold.ttf?inline'
import regularFont from './fonts/OpenSans-Regular.ttf?inline'
import notoFont from './fonts/NotoSansTC-Regular.woff?no-inline'

const primary = 'Open Sans'
const fallback = 'Noto Sans TC'
const control = /^[\n\r\t]$/

Font.register({
  family: primary,
  fonts: [
    { src: regularFont, fontWeight: 400 },
    { src: boldFont, fontWeight: 700 },
  ],
})

export class UnsupportedPdfText extends Error {}

async function glyphCoverage(fontFamily: string, fontWeight: number) {
  const descriptor = { fontFamily, fontWeight }
  await Font.load(descriptor)
  const font = Font.getFont(descriptor).data
  if (!font) throw new Error('Could not load the PDF font.')
  return (character: string) => control.test(character) || font.hasGlyphForCodePoint(character.codePointAt(0) ?? 0)
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export async function preparePdfText(regular: string[], bold: string) {
  const [hasRegular, hasBold] = await Promise.all([glyphCoverage(primary, 400), glyphCoverage(primary, 700)])
  const missing = [
    ...regular.flatMap((text) => Array.from(text).filter((character) => !hasRegular(character))),
    ...Array.from(bold).filter((character) => !hasBold(character)),
  ]
  let hasFallback: (character: string) => boolean = () => false
  if (missing.length) {
    Font.register({ family: fallback, src: new URL(notoFont, self.location.href).href })
    hasFallback = await glyphCoverage(fallback, 400)
    if (!missing.every(hasFallback)) throw new UnsupportedPdfText()
  }

  return (text: string, weight = 400) => {
    const hasPrimary = weight === 700 ? hasBold : hasRegular
    const runs: { text: string; fontFamily: string; fontWeight: number }[] = []
    for (const { segment } of segmenter.segment(text)) {
      const characters = Array.from(segment)
      const fontFamily = characters.every(hasPrimary) ? primary : fallback
      if (fontFamily === fallback && !characters.every(hasFallback)) throw new UnsupportedPdfText()
      const last = runs.at(-1)
      if (last?.fontFamily === fontFamily) last.text += segment
      else runs.push({ text: segment, fontFamily, fontWeight: fontFamily === primary ? weight : 400 })
    }
    return runs
  }
}

export type PdfFonts = Awaited<ReturnType<typeof preparePdfText>>
