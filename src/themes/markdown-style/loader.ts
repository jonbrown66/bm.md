const cache = new Map<string, string>()

let resetCssPromise: Promise<string> | null = null

function loadResetCss(): Promise<string> {
  return resetCssPromise ??= import('./reset.css?raw').then(m => m.default)
}

const themeModules: Record<string, () => Promise<{ default: string }>> = {
  botanical: () => import('./botanical.css?raw'),
  kiko: async () => {
    const [blueprint, kiko] = await Promise.all([
      import('./blueprint.css?raw'),
      import('./kiko.css?raw'),
    ])

    return { default: `${blueprint.default}\n${kiko.default}` }
  },
  professional: () => import('./professional.css?raw'),
}

export async function loadMarkdownStyleCss(id: string): Promise<string | undefined> {
  if (cache.has(id)) {
    return cache.get(id)
  }

  const loader = themeModules[id]
  if (!loader) {
    return undefined
  }

  const [resetCss, themeMod] = await Promise.all([
    loadResetCss(),
    loader(),
  ])

  const css = resetCss + themeMod.default
  cache.set(id, css)

  return css
}
