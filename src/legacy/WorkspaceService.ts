import * as vscode from "vscode";
import type { ApprovedConfigPaths } from "../ApprovedConfigPaths";
import { ancestorDirsContainConfigFile, discoverWorkspaceConfigFiles } from "../configFile";
import type { EditorInfo } from "../executable/DprintExecutable";
import { Logger } from "../logger";
import { ObjectDisposedError } from "../utils";
import { addOrUncommentPlugin, findOrCreateConfigFile } from "./dprintConfigEditor";
import { FolderService } from "./FolderService";
import {
  ALL_DPRINT_SUPPORTABLE_LANGUAGE_IDS,
  getSupportedLanguageIds,
  LANGUAGE_ID_TO_PLUGIN_SUGGESTION,
} from "./supportedLanguages";

export type FolderInfos = ReadonlyArray<Readonly<FolderInfo>>;

export interface FolderInfo {
  uri: vscode.Uri;
  editorInfo: EditorInfo;
}

export interface WorkspaceServiceOptions {
  approvedPaths: ApprovedConfigPaths;
  logger: Logger;
}

/** Handles creating dprint instances for each workspace folder. */
export class WorkspaceService implements vscode.DocumentFormattingEditProvider {
  readonly #approvedPaths: ApprovedConfigPaths;
  readonly #logger: Logger;
  readonly #folders: FolderService[] = [];
  /** Keys: `${folderUri}:${languageId}` — avoid spamming plugin suggestion. */
  readonly #pluginSuggestionShown = new Set<string>();
  /** Workspace folder URIs we already offered "Create dprint.jsonc" for. */
  readonly #createConfigOfferShown = new Set<string>();

  #disposed = false;

  constructor(opts: WorkspaceServiceOptions) {
    this.#approvedPaths = opts.approvedPaths;
    this.#logger = opts.logger;
  }

  dispose() {
    this.#clearFolders();
    this.#disposed = true;
  }

  #assertNotDisposed() {
    if (this.#disposed) {
      throw new ObjectDisposedError();
    }
  }

  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ) {
    const folder = this.#getFolderForUri(document.uri);
    const result = await folder?.provideDocumentFormattingEdits(document, options, token);
    if (result === undefined) {
      if (folder != null) {
        this.#maybeSuggestPlugin(document, folder);
      } else {
        this.#maybeOfferCreateConfig(document);
      }
    }
    return result;
  }

  #maybeSuggestPlugin(document: vscode.TextDocument, folder: FolderService) {
    const langId = document.languageId;
    if (!ALL_DPRINT_SUPPORTABLE_LANGUAGE_IDS.has(langId)) {
      return;
    }
    const editorInfo = folder.getEditorInfo();
    if (editorInfo == null) {
      return;
    }
    const supported = getSupportedLanguageIds(editorInfo.plugins);
    if (supported.includes(langId)) {
      return;
    }
    const key = `${folder.uri.toString()}:${langId}`;
    if (this.#pluginSuggestionShown.has(key)) {
      return;
    }
    this.#pluginSuggestionShown.add(key);
    const suggestion = LANGUAGE_ID_TO_PLUGIN_SUGGESTION[langId];
    if (suggestion == null) {
      return;
    }
    const addToConfig = "Add to config";
    const openDocs = "Open plugin docs";
    this.#logger.logInfo(
      `dprint could format this ${langId} file with the ${suggestion.name} plugin. Add it to your dprint config.`,
    );
    vscode.window.showInformationMessage(
      `dprint could format this file with the ${suggestion.name} plugin. Add it to your dprint config.`,
      addToConfig,
      openDocs,
    ).then(async (choice) => {
      if (choice === openDocs) {
        vscode.env.openExternal(vscode.Uri.parse(suggestion.helpUrl));
        return;
      }
      if (choice === addToConfig) {
        try {
          const { configUri, created } = await findOrCreateConfigFile(folder.uri, this.#logger);
          await addOrUncommentPlugin(configUri, suggestion.pluginUrl, this.#logger, {
            openInEditor: true,
          });
          if (created) {
            this.#logger.logInfo("Restart dprint (Dprint: Restart) or change config to load the new file.");
          }
        } catch (err) {
          this.#logger.logError("Failed to add plugin to config.", err);
          vscode.window.showErrorMessage(`Failed to update dprint config: ${err}`);
        }
      }
    });
  }

  #maybeOfferCreateConfig(document: vscode.TextDocument) {
    const wf = vscode.workspace.getWorkspaceFolder(document.uri);
    if (wf == null) return;
    const key = wf.uri.toString();
    if (this.#createConfigOfferShown.has(key)) return;
    if (!this.#isDprintSetAsFormatter(document.uri)) return;
    this.#createConfigOfferShown.add(key);
    const create = "Create dprint.jsonc";
    this.#logger.logInfo("No dprint config found; dprint is set as formatter. Offering to create dprint.jsonc.");
    vscode.window.showInformationMessage(
      "No dprint config file found. Create a starter dprint.jsonc with commented plugin options?",
      create,
    ).then(async (choice) => {
      if (choice !== create) return;
      try {
        const { createBarebonesConfigAndOpen } = await import("./dprintConfigEditor");
        await createBarebonesConfigAndOpen(wf.uri, this.#logger);
        this.#logger.logInfo("Created dprint.jsonc. Uncomment the plugins you need, then run Dprint: Restart.");
      } catch (err) {
        this.#logger.logError("Failed to create dprint config.", err);
        vscode.window.showErrorMessage(`Failed to create dprint config: ${err}`);
      }
    });
  }

  /** Whether dprint is set as default formatter (workspace or user settings). */
  #isDprintSetAsFormatter(uri: vscode.Uri): boolean {
    const formatter = vscode.workspace.getConfiguration("editor", uri).get<string>("defaultFormatter");
    return formatter === "dprint.dprint";
  }

  #getFolderForUri(uri: vscode.Uri) {
    let bestMatch: FolderService | undefined;
    for (const folder of this.#folders) {
      if (uri.fsPath.startsWith(folder.uri.fsPath)) {
        if (bestMatch == null || folder.uri.fsPath.startsWith(bestMatch.uri.fsPath)) {
          bestMatch = folder;
        }
      }
    }
    return bestMatch;
  }

  #clearFolders() {
    for (const folder of this.#folders) {
      folder.dispose();
    }
    this.#folders.length = 0; // clear
  }

  async initializeFolders(): Promise<FolderInfos> {
    this.#assertNotDisposed();

    this.#clearFolders();
    if (vscode.workspace.workspaceFolders == null) {
      return [];
    }

    const configFiles = await discoverWorkspaceConfigFiles({
      logger: this.#logger,
    });

    // Initialize the workspace folders with each sub configuration that's found.
    for (const folder of vscode.workspace.workspaceFolders) {
      const stringFolderUri = folder.uri.toString();
      const subConfigUris = configFiles.filter(c => c.toString().startsWith(stringFolderUri));
      for (const subConfigUri of subConfigUris) {
        this.#folders.push(
          new FolderService({
            approvedPaths: this.#approvedPaths,
            workspaceFolder: folder,
            configUri: subConfigUri,
            logger: this.#logger,
          }),
        );
      }

      // if the current workspace folder hasn't been added, then ensure
      // it's added to the list of folders in order to allow someone
      // formatting when the current open workspace is in a sub directory
      // of a workspace
      if (
        !this.#folders.some(f => areDirectoryUrisEqual(f.uri, folder.uri))
        && ancestorDirsContainConfigFile(folder.uri)
      ) {
        this.#folders.push(
          new FolderService({
            approvedPaths: this.#approvedPaths,
            workspaceFolder: folder,
            configUri: undefined,
            logger: this.#logger,
          }),
        );
      }
    }

    // now initialize in parallel
    const initializedFolders = await Promise.all(this.#folders.map(async f => {
      if (await f.initialize()) {
        return f;
      } else {
        return undefined;
      }
    }));

    this.#assertNotDisposed();

    const allEditorInfos: FolderInfo[] = [];
    for (const folder of initializedFolders) {
      if (folder != null) {
        const editorInfo = folder.getEditorInfo();
        if (editorInfo != null) {
          allEditorInfos.push({ uri: folder.uri, editorInfo: editorInfo });
        }
      }
    }
    // add a global fallback folder
    const rootParams = {
        uri: vscode.Uri.file(process.platform === "win32" ? "C:\\" : "/"),
        name: "Global",
        index: -1
    } as vscode.WorkspaceFolder;
    const globalFolderService = new FolderService({
        approvedPaths: this.#approvedPaths,
        workspaceFolder: rootParams,
        configUri: undefined,
        logger: this.#logger,
    });
    if (await globalFolderService.initialize()) {
        const editorInfo = globalFolderService.getEditorInfo();
        if (editorInfo != null) {
            allEditorInfos.push({ uri: globalFolderService.uri, editorInfo });
            this.#folders.push(globalFolderService);
        } else {
            globalFolderService.dispose();
        }
    } else {
        globalFolderService.dispose();
    }

    return allEditorInfos;
  }
}

function areDirectoryUrisEqual(a: vscode.Uri, b: vscode.Uri) {
  function standarizeUri(uri: vscode.Uri) {
    const text = uri.toString();
    if (text.endsWith("/")) {
      return text;
    } else {
      // for some reason, vscode workspace directory uris don't have a trailing slash
      return `${text}/`;
    }
  }

  return standarizeUri(a) === standarizeUri(b);
}
