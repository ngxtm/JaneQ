import { createSystem, defaultConfig, defineConfig, defineRecipe, defineSlotRecipe } from '@chakra-ui/react'

const textField = defineRecipe({
  base: {
    borderStyle: 'solid',
    fontFamily: 'body',
    _placeholder: { color: 'janeq.muted' },
    '--focus-color': 'colors.janeq.focus',
  },
  variants: {
    variant: {
      outline: {
        borderColor: 'janeq.line',
        borderRadius: 'lg',
        px: '3.5',
        // Chakra colors the border and the adjacent ring as one focus indicator.
        focusRingWidth: '1px',
      },
      flushed: {
        borderTopWidth: '0',
        borderInlineWidth: '0',
      },
    },
  },
})

const janeqTheme = defineConfig({
  theme: {
    tokens: {
      colors: {
        janeq: {
          ink: { value: '#1a202c' },
          muted: { value: '#4c5f77' },
          line: { value: '#c5d1df' },
          divider: { value: '#e3ebf1' },
          canvas: { value: '#f4f7f9' },
          library: { value: '#f7fafc' },
          blue: { value: '#1858f5' },
          blueHover: { value: '#144bd2' },
          focus: { value: '#0042da' },
        },
      },
      fonts: {
        heading: { value: '"Outfit Variable", system-ui, sans-serif' },
        body: { value: '"Open Sans Variable", system-ui, sans-serif' },
      },
    },
    recipes: {
      button: defineRecipe({ base: { borderStyle: 'solid' } }),
      input: textField,
      textarea: textField,
    },
    slotRecipes: {
      dialog: defineSlotRecipe({
        slots: ['backdrop', 'positioner', 'content', 'title'],
        base: {
          backdrop: {
            _open: { _motionReduce: { animationName: 'none' } },
            _closed: { _motionReduce: { animationName: 'none' } },
          },
          positioner: { paddingInline: '4' },
          content: {
            _open: { _motionReduce: { animationName: 'none' } },
            _closed: { _motionReduce: { animationName: 'none' } },
          },
          title: { fontFamily: 'heading' },
        },
      }),
    },
  },
})

// Component recipes supply the styling while the app shell owns its global reset.
export const uiSystem = createSystem(
  { ...defaultConfig, preflight: false, globalCss: {} },
  janeqTheme,
)
