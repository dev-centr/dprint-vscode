import type { PluginInfo } from "../executable/DprintExecutable";

/**
 * Maps dprint plugin file extensions and file names to VS Code language IDs.
 * Used so we only register as a formatter for languages we actually have a plugin for,
 * and so VS Code shows dprint in the formatter list for those languages (glob-only
 * selectors are not reliably associated with language IDs like jsonc).
 *
 * See https://code.visualstudio.com/docs/languages/identifiers and
 * https://dprint.dev/plugins/
 */
const EXTENSION_AND_FILENAME_TO_LANGUAGE_ID: Readonly<Record<string, string | string[]>> = {
  // JSON plugin
  ".json": ["json", "jsonc"],
  ".jsonc": "jsonc",
  // TypeScript / JavaScript
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mts": "typescript",
  ".cts": "typescript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  // Markdown
  ".md": "markdown",
  ".mdx": "markdown",
  // TOML
  ".toml": "toml",
  // Dockerfile
  "dockerfile": "dockerfile",
  // Malva (CSS/SCSS/Sass/Less)
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  // Pretty GraphQL
  ".graphql": "graphql",
  ".gql": "graphql",
  // Pretty YAML
  ".yaml": "yaml",
  ".yml": "yaml",
  // Markup_fmt (HTML and templating)
  ".html": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".jinja": "jinja",
  ".jinja2": "jinja",
  ".twig": "twig",
  ".njk": "nunjucks",
  ".vento": "vento",
  // Ruff (Python)
  ".py": "python",
  ".pyi": "python",
  // Jupyter
  ".ipynb": "jupyter",
  // PHP (Mago)
  ".php": "php",
  // C# / VB (Roslyn process plugin)
  ".cs": "csharp",
  ".vb": "vb",
  // Code-workspace (VS Code uses jsonc)
  ".code-workspace": "jsonc",
};

/**
 * Returns the set of VS Code language IDs that the given plugins support,
 * so the extension can register document formatter selectors only for those languages.
 */
export function getSupportedLanguageIds(plugins: ReadonlyArray<PluginInfo>): string[] {
  const ids = new Set<string>();
  for (const plugin of plugins) {
    for (const ext of plugin.fileExtensions) {
      const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      const mapped = EXTENSION_AND_FILENAME_TO_LANGUAGE_ID[normalized];
      if (mapped != null) {
        if (typeof mapped === "string") {
          ids.add(mapped);
        } else {
          for (const id of mapped) {
            ids.add(id);
          }
        }
      }
    }
    for (const name of plugin.fileNames) {
      const normalized = name.toLowerCase();
      const mapped = EXTENSION_AND_FILENAME_TO_LANGUAGE_ID[normalized];
      if (mapped != null) {
        if (typeof mapped === "string") {
          ids.add(mapped);
        } else {
          for (const id of mapped) {
            ids.add(id);
          }
        }
      }
    }
  }
  return [...ids];
}

/** Language IDs that some dprint plugin can format (for "offer to add plugin" suggestions). */
export const ALL_DPRINT_SUPPORTABLE_LANGUAGE_IDS = new Set<string>(
  Object.values(EXTENSION_AND_FILENAME_TO_LANGUAGE_ID).flatMap(m => (typeof m === "string" ? [m] : m)),
);

/** Plugin suggestion when user has no plugin for a supportable language. */
export interface PluginSuggestion {
  name: string;
  helpUrl: string;
  /** Exact plugin URL to add to dprint config (for one-click install). */
  pluginUrl: string;
}

/** Map of VS Code language ID to suggested dprint plugin (name, docs URL, plugin URL). */
export const LANGUAGE_ID_TO_PLUGIN_SUGGESTION: Readonly<Record<string, PluginSuggestion>> = {
  json: { name: "JSON", helpUrl: "https://dprint.dev/plugins/json", pluginUrl: "https://plugins.dprint.dev/json-0.21.1.wasm" },
  jsonc: { name: "JSON", helpUrl: "https://dprint.dev/plugins/json", pluginUrl: "https://plugins.dprint.dev/json-0.21.1.wasm" },
  typescript: { name: "TypeScript", helpUrl: "https://dprint.dev/plugins/typescript", pluginUrl: "https://plugins.dprint.dev/typescript-0.95.15.wasm" },
  typescriptreact: { name: "TypeScript", helpUrl: "https://dprint.dev/plugins/typescript", pluginUrl: "https://plugins.dprint.dev/typescript-0.95.15.wasm" },
  javascript: { name: "TypeScript", helpUrl: "https://dprint.dev/plugins/typescript", pluginUrl: "https://plugins.dprint.dev/typescript-0.95.15.wasm" },
  javascriptreact: { name: "TypeScript", helpUrl: "https://dprint.dev/plugins/typescript", pluginUrl: "https://plugins.dprint.dev/typescript-0.95.15.wasm" },
  markdown: { name: "Markdown", helpUrl: "https://dprint.dev/plugins/markdown", pluginUrl: "https://plugins.dprint.dev/markdown-0.20.0.wasm" },
  toml: { name: "TOML", helpUrl: "https://dprint.dev/plugins/toml", pluginUrl: "https://plugins.dprint.dev/toml-0.7.0.wasm" },
  dockerfile: { name: "Dockerfile", helpUrl: "https://dprint.dev/plugins/dockerfile", pluginUrl: "https://plugins.dprint.dev/dockerfile-0.3.3.wasm" },
  css: { name: "Malva (CSS/SCSS/Sass/Less)", helpUrl: "https://dprint.dev/plugins/malva", pluginUrl: "https://plugins.dprint.dev/g-plane/malva-v0.15.2.wasm" },
  scss: { name: "Malva (CSS/SCSS/Sass/Less)", helpUrl: "https://dprint.dev/plugins/malva", pluginUrl: "https://plugins.dprint.dev/g-plane/malva-v0.15.2.wasm" },
  sass: { name: "Malva (CSS/SCSS/Sass/Less)", helpUrl: "https://dprint.dev/plugins/malva", pluginUrl: "https://plugins.dprint.dev/g-plane/malva-v0.15.2.wasm" },
  less: { name: "Malva (CSS/SCSS/Sass/Less)", helpUrl: "https://dprint.dev/plugins/malva", pluginUrl: "https://plugins.dprint.dev/g-plane/malva-v0.15.2.wasm" },
  graphql: { name: "Pretty GraphQL", helpUrl: "https://dprint.dev/plugins/pretty_graphql", pluginUrl: "https://plugins.dprint.dev/pretty_graphql-0.0.0.wasm" },
  yaml: { name: "Pretty YAML", helpUrl: "https://dprint.dev/plugins/pretty_yaml", pluginUrl: "https://plugins.dprint.dev/pretty_yaml-0.0.0.wasm" },
  html: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  vue: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  svelte: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  python: { name: "Ruff (Python)", helpUrl: "https://dprint.dev/plugins/ruff", pluginUrl: "https://plugins.dprint.dev/ruff-0.0.0.wasm" },
  php: { name: "Mago (PHP)", helpUrl: "https://dprint.dev/plugins/mago", pluginUrl: "https://plugins.dprint.dev/mago-0.0.0.wasm" },
  csharp: { name: "Roslyn (C#/VB)", helpUrl: "https://dprint.dev/plugins/roslyn", pluginUrl: "https://plugins.dprint.dev/roslyn" },
  vb: { name: "Roslyn (C#/VB)", helpUrl: "https://dprint.dev/plugins/roslyn", pluginUrl: "https://plugins.dprint.dev/roslyn" },
  astro: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  jinja: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  twig: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  nunjucks: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  vento: { name: "Markup_fmt", helpUrl: "https://dprint.dev/plugins/markup_fmt", pluginUrl: "https://plugins.dprint.dev/markup_fmt-0.0.0.wasm" },
  jupyter: { name: "Jupyter", helpUrl: "https://dprint.dev/plugins/jupyter", pluginUrl: "https://plugins.dprint.dev/jupyter-0.0.0.wasm" },
  mdx: { name: "Markdown", helpUrl: "https://dprint.dev/plugins/markdown", pluginUrl: "https://plugins.dprint.dev/markdown-0.20.0.wasm" },
};

/** Barebones dprint.jsonc with commented plugin lines; uncomment to enable. */
export const BAREBOONES_DPRINT_JSONC = `{
  "indentWidth": 2,
  "lineWidth": 120,
  "excludes": [
    "**/node_modules",
    "**/*-lock.json",
    "**/dist",
    "**/.git"
  ],
  "plugins": [
    // TypeScript / JavaScript
    // "https://plugins.dprint.dev/typescript-0.95.15.wasm",
    // JSON
    // "https://plugins.dprint.dev/json-0.21.1.wasm",
    // Markdown
    // "https://plugins.dprint.dev/markdown-0.20.0.wasm",
    // TOML
    // "https://plugins.dprint.dev/toml-0.7.0.wasm",
    // Dockerfile
    // "https://plugins.dprint.dev/dockerfile-0.3.3.wasm",
    // CSS/SCSS/Sass/Less (Malva)
    // "https://plugins.dprint.dev/g-plane/malva-v0.15.2.wasm",
    // YAML (run: dprint config add g-plane/pretty_yaml)
    // "https://plugins.dprint.dev/g-plane/pretty_yaml-v0.2.0.wasm",
    // GraphQL (run: dprint config add g-plane/pretty_graphql)
    // "https://plugins.dprint.dev/g-plane/pretty_graphql-v0.2.0.wasm",
    // HTML/Vue/Svelte/Astro etc (run: dprint config add g-plane/markup_fmt)
    // "https://plugins.dprint.dev/g-plane/markup_fmt-v0.10.0.wasm",
    // Python (run: dprint config add ruff)
    // "https://plugins.dprint.dev/ruff-0.1.0.wasm"
  ]
}
`;
