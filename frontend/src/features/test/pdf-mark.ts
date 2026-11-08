import janeqMark from '../../assets/janeq-mark.svg?raw'

type Paint = {
  fill?: string
  stroke?: string
  strokeWidth?: string
  strokeLinecap?: 'round'
}

export type MarkShape = (
  | { kind: 'group'; children: MarkShape[] }
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: string; cy: string; r: string }
) & { paint: Paint }

function readShapes(elements: HTMLCollection): MarkShape[] {
  return Array.from(elements).flatMap((element): MarkShape[] => {
    const paint: Paint = {
      fill: element.getAttribute('fill') ?? undefined,
      stroke: element.getAttribute('stroke') ?? undefined,
      strokeWidth: element.getAttribute('stroke-width') ?? undefined,
      strokeLinecap: element.getAttribute('stroke-linecap') === 'round' ? 'round' : undefined,
    }
    switch (element.localName) {
      case 'g':
        return [{ kind: 'group', paint, children: readShapes(element.children) }]
      case 'path':
        return [{ kind: 'path', paint, d: element.getAttribute('d') ?? '' }]
      case 'circle':
        return [{
          kind: 'circle', paint, cx: element.getAttribute('cx') ?? '0',
          cy: element.getAttribute('cy') ?? '0', r: element.getAttribute('r') ?? '0',
        }]
      default:
        return []
    }
  })
}

export function readPdfMark() {
  // Parse the shared SVG in the window. The worker receives only drawing data.
  const svg = new DOMParser().parseFromString(janeqMark, 'image/svg+xml').documentElement
  return { viewBox: svg.getAttribute('viewBox') ?? undefined, shapes: readShapes(svg.children) }
}

export type PdfMark = ReturnType<typeof readPdfMark>
