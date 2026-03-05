import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { DPRINT_CONFIG_FILE_NAMES } from "../constants";
import { Logger } from "../logger";
import { BAREBOONES_DPRINT_JSONC } from "./supportedLanguages";

/**
 * Extract a short plugin key from a plugin URL for matching commented lines.
 * e.g. "https://plugins.dprint.dev/json-0.21.1.wasm" -> "json"
 *      "https://plugins.dprint.dev/g-plane/malva-v0.15.2.wasm" -> "malva"
 */
export function pluginSlugFromUrl(pluginUrl: string): string {
  try {
    const pathPart = new URL(pluginUrl).pathname.replace(/^\//, "");
    const lastSegment = pathPart.split("/").pop() || "";
    const withoutExt = lastSegment.replace(/\.wasm$/i, "");
    const withoutVersion = withoutExt.replace(/-[vV]?\d+\.\d+.*$/, "");
    return withoutVersion || withoutExt;
  } catch {
    return "";
  }
}

/**
 * Find an existing dprint config file in the given folder or its ancestors.
 */
export async function findConfigInFolderOrAncestors(folderUri: vscode.Uri): Promise<vscode.Uri | undefined> {
  let dir = folderUri.fsPath;
  for (let i = 0; i < 20; i++) {
    for (const name of DPRINT_CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return vscode.Uri.file(candidate);
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Create a barebones dprint.jsonc at the given folder root with commented plugin lines,
 * then open it in the editor. Returns the config file URI.
 */
export async function createBarebonesConfigAndOpen(
  folderUri: vscode.Uri,
  logger: Logger,
): Promise<vscode.Uri> {
  const configUri = vscode.Uri.joinPath(folderUri, "dprint.jsonc");
  const encoder = new TextEncoder();
  await vscode.workspace.fs.writeFile(
    configUri,
    encoder.encode(BAREBOONES_DPRINT_JSONC),
  );
  logger.logInfo(`Created ${configUri.fsPath}`);
  const doc = await vscode.workspace.openTextDocument(configUri);
  await vscode.window.showTextDocument(doc);
  return configUri;
}

/**
 * Ensure a dprint config exists for the folder: use existing or create barebones.
 * Returns the config URI and whether we created it.
 */
export async function findOrCreateConfigFile(
  folderUri: vscode.Uri,
  logger: Logger,
): Promise<{ configUri: vscode.Uri; created: boolean }> {
  const existing = await findConfigInFolderOrAncestors(folderUri);
  if (existing) {
    return { configUri: existing, created: false };
  }
  const configUri = await createBarebonesConfigAndOpen(folderUri, logger);
  return { configUri, created: true };
}

/**
 * Check if a line is a commented-out plugin URL that matches the given plugin.
 */
function isCommentedPluginLine(line: string, pluginUrl: string, slug: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("//")) return false;
  const afterComment = trimmed.slice(2).trim();
  if (!afterComment.startsWith('"') || !afterComment.includes("plugins.dprint.dev")) return false;
  return afterComment.includes(slug) || afterComment.includes(pluginUrl);
}

/**
 * Uncomment a line: remove leading // and trim.
 */
function uncommentLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("//")) {
    return trimmed.slice(2).trimStart();
  }
  return line;
}

/**
 * Add the plugin to the config or uncomment an existing commented plugin line.
 * Reads the file as text, applies the edit, writes back, and optionally opens the doc.
 */
export async function addOrUncommentPlugin(
  configUri: vscode.Uri,
  pluginUrl: string,
  logger: Logger,
  options: { openInEditor?: boolean } = {},
): Promise<void> {
  const slug = pluginSlugFromUrl(pluginUrl);
  const doc = await vscode.workspace.openTextDocument(configUri);
  let content = doc.getText();

  const lines = content.split(/\r?\n/);
  let modified = false;
  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentedPluginLine(line, pluginUrl, slug)) {
      newLines.push(uncommentLine(line));
      modified = true;
      logger.logInfo(`Uncommented plugin line for ${slug} in ${configUri.fsPath}`);
    } else {
      newLines.push(line);
    }
  }

  if (!modified) {
    const alreadyPresent = newLines.some(
      (l) => l.includes(pluginUrl) && !l.trim().startsWith("//"),
    );
    if (!alreadyPresent) {
      const fullContent = newLines.join("\n");
      const inserted = addPluginToPluginsArray(fullContent, pluginUrl);
      if (inserted != null) {
        content = inserted;
        modified = true;
        logger.logInfo(`Added plugin ${pluginUrl} to ${configUri.fsPath}`);
      } else {
        content = fullContent;
      }
    } else {
      content = newLines.join("\n");
    }
  } else {
    content = newLines.join("\n");
  }

  if (modified) {
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(configUri, encoder.encode(content));
  }

  if (options.openInEditor !== false) {
    const d = await vscode.workspace.openTextDocument(configUri);
    await vscode.window.showTextDocument(d);
  }
}

/**
 * Insert plugin URL into the "plugins" array. Handles JSON/JSONC with trailing commas.
 * Does not add if the URL is already present (uncommented). Returns new content or null if insertion point not found.
 */
function addPluginToPluginsArray(content: string, pluginUrl: string): string | null {
  const pluginsArrayMatch = content.match(/"plugins"\s*:\s*\[/);
  if (!pluginsArrayMatch) return null;
  const openStart = pluginsArrayMatch.index ?? 0;
  const openEnd = openStart + pluginsArrayMatch[0].length;
  const afterOpen = content.slice(openEnd);
  let depth = 1;
  let i = 0;
  for (; i < afterOpen.length && depth > 0; i++) {
    const c = afterOpen[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
  }
  const pluginsContent = afterOpen.slice(0, i - 1);
  const afterArray = afterOpen.slice(i - 1);
  const trimmed = pluginsContent.trimEnd();
  const needsComma = trimmed.length > 0 && !trimmed.endsWith(",");
  const newEntry = (needsComma ? "," : "") + `\n    "${pluginUrl}"`;
  return content.slice(0, openEnd) + pluginsContent + newEntry + afterArray;
}
