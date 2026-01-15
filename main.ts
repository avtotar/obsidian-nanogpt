import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { Decoration, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { NanoGPTClient } from './src/api/NanoGPTClient';
import { ChatHistoryManager } from './src/storage/ChatHistoryManager';
import { ImageManager } from './src/storage/ImageManager';
import { PluginSettings, DEFAULT_SETTINGS } from './src/api/types';
import { ChatView, VIEW_TYPE_CHAT } from './src/ui/ChatView';

type GhostTextState = { text: string; pos: number };

const setGhostTextEffect = StateEffect.define<GhostTextState>();
const clearGhostTextEffect = StateEffect.define<null>();

class GhostTextWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'nanogpt-ghost-text';
    span.textContent = this.text;
    return span;
  }
}

const ghostTextStateField = StateField.define<GhostTextState>({
  create: () => ({ text: '', pos: 0 }),
  update: (value, transaction) => {
    let next = value;

    for (const effect of transaction.effects) {
      if (effect.is(setGhostTextEffect)) {
        next = effect.value;
      }
      if (effect.is(clearGhostTextEffect)) {
        next = { text: '', pos: 0 };
      }
    }

    if (transaction.docChanged && next.text) {
      next = { ...next, pos: transaction.changes.mapPos(next.pos) };
    }

    return next;
  },
});

const ghostTextDecorations = EditorView.decorations.compute([ghostTextStateField], (state) => {
  const ghost = state.field(ghostTextStateField);
  if (!ghost.text) {
    return Decoration.none;
  }

  return Decoration.set([
    Decoration.widget({
      widget: new GhostTextWidget(ghost.text),
      side: 1,
    }).range(ghost.pos),
  ]);
});

const ghostTextClearer = ViewPlugin.fromClass(
  class {
    update(update: { state: EditorView['state']; view: EditorView; docChanged: boolean; selectionSet: boolean; transactions: any[] }) {
      const hasSetEffect = update.transactions.some((transaction) =>
        transaction.effects.some((effect: StateEffect<GhostTextState | null>) =>
          effect.is(setGhostTextEffect)
        )
      );

      if (hasSetEffect) return;

      const ghost = update.state.field(ghostTextStateField);
      if (!ghost.text) return;

      if (update.docChanged || update.selectionSet) {
        update.view.dispatch({ effects: clearGhostTextEffect.of(null) });
      }
    }
  }
);

const acceptGhostText = (view: EditorView) => {
  const ghost = view.state.field(ghostTextStateField);
  if (!ghost.text) return false;

  view.dispatch({
    changes: { from: ghost.pos, to: ghost.pos, insert: ghost.text },
    effects: clearGhostTextEffect.of(null),
  });

  return true;
};

const ghostTextExtension = [
  ghostTextStateField,
  ghostTextDecorations,
  ghostTextClearer,
  Prec.high(keymap.of([{ key: 'Tab', run: acceptGhostText }])),
];

export default class NanoGPTPlugin extends Plugin {
  settings: PluginSettings;
  client: NanoGPTClient;
  chatHistoryManager: ChatHistoryManager;
  imageManager: ImageManager;
  private inlineAutocompleteTimer: number | null = null;
  private inlineAutocompleteInFlight = false;
  private inlineAutocompleteRequestId = 0;
  private isApplyingAutocomplete = false;

  async onload() {
    console.log('Loading NanoGPT Assistant plugin');

    await this.loadSettings();

    this.client = new NanoGPTClient(this.settings.apiKey, this.settings.baseUrl);
    this.chatHistoryManager = new ChatHistoryManager(this.app, this);
    this.imageManager = new ImageManager(this.app);

    this.registerEditorExtension(ghostTextExtension);

    this.registerView(
      VIEW_TYPE_CHAT,
      (leaf) => new ChatView(leaf, this.client, this.chatHistoryManager, this.settings)
    );

    this.addRibbonIcon('sparkles', 'NanoGPT Chat', () => {
      this.activateChatView();
    });

    this.addSettingTab(new NanoGPTSettingTab(this.app, this));

    this.addCommand({
      id: 'open-chat',
      name: 'Open Chat',
      callback: () => {
        this.activateChatView();
      },
    });

    this.addCommand({
      id: 'generate-summary',
      name: 'Generate Summary',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.generateSummary(editor, ctx.file);
      },
    });

    this.addCommand({
      id: 'expand-selection',
      name: 'Expand Selection',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.expandSelection(editor, ctx.file);
      },
    });

    this.addCommand({
      id: 'rewrite-text',
      name: 'Rewrite Text',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.rewriteText(editor, ctx.file);
      },
    });

    this.addCommand({
      id: 'explain-selection',
      name: 'Explain Selection',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.explainSelection(editor, ctx.file);
      },
    });

    this.addCommand({
      id: 'generate-image',
      name: 'Generate Image',
      callback: () => {
        this.generateImage();
      },
    });

    this.addCommand({
      id: 'generate-image-from-selection',
      name: 'Generate Image from Selection',
      editorCallback: (editor) => {
        this.generateImageFromSelection(editor);
      },
    });

    this.addCommand({
      id: 'web-search',
      name: 'Web Search',
      callback: () => {
        this.webSearch();
      },
    });

    this.addCommand({
      id: 'web-search-from-selection',
      name: 'Web Search from Selection',
      editorCallback: (editor) => {
        this.webSearchFromSelection(editor);
      },
    });

    this.addCommand({
      id: 'inline-autocomplete',
      name: 'Inline Autocomplete',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.inlineAutocomplete(editor, ctx.file, false);
      },
    });

    this.addCommand({
      id: 'edit-note-with-ai',
      name: 'Edit Note with AI',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.editNoteWithAI(ctx.file);
      },
    });

    this.addCommand({
      id: 'complete-note',
      name: 'Complete Note',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.completeNote(editor, ctx.file);
      },
    });

    this.addCommand({
      id: 'generate-outline',
      name: 'Generate Outline',
      editorCallback: (editor, ctx) => {
        if (ctx.file) this.generateOutline(editor, ctx.file);
      },
    });

    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, view) => {
        if (!this.settings.inlineAutocompleteEnabled) return;
        if (!(view instanceof MarkdownView)) return;
        if (!view.file) return;
        if (this.isApplyingAutocomplete) return;
        this.scheduleInlineAutocomplete(editor, view.file);
      })
    );

    console.log('NanoGPT Assistant plugin loaded');
  }

  async onunload() {
    console.log('Unloading NanoGPT Assistant plugin');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.client.setApiKey(this.settings.apiKey);
    this.client.setBaseUrl(this.settings.baseUrl);
    this.client.invalidateCache();
  }

  async activateChatView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0];
    } else {
      // Our view could not be found in the workspace, create a new leaf
      // in the right sidebar for it
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      }
    }

    // "Reveal" the leaf in case it is in a collapsed sidebar
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async generateSummary(editor: any, file: TFile) {
    await this.processTextCommand(editor, 'Summarize the following text:', file);
  }

  async expandSelection(editor: any, file: TFile) {
    await this.processTextCommand(editor, 'Expand on the following text:', file);
  }

  async rewriteText(editor: any, file: TFile) {
    await this.processTextCommand(editor, 'Rewrite the following text:', file);
  }

  async explainSelection(editor: any, file: TFile) {
    await this.processTextCommand(editor, 'Explain the following text in simple terms:', file);
  }

  private async processTextCommand(editor: any, instruction: string, file: TFile) {
    const selectedText = editor.getSelection();
    if (!selectedText) {
      new Notice('Please select some text first');
      return;
    }

    new Notice('Processing...');
    const cursor = editor.getCursor();

    try {
      let response = '';
      const systemPrompt = `You are a helpful assistant. ${instruction}`;
      
      await this.client.streamChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: selectedText },
        ],
        this.settings.defaultModel,
        (chunk) => {
          response += chunk;
        },
        this.settings.temperature,
        this.settings.maxTokens
      );

      editor.replaceRange(response, cursor.from, cursor.to);
      new Notice('Complete!');
    } catch (error) {
      console.error('Text command error:', error);
      new Notice(`Error: ${error.message}`);
    }
  }

  generateImage() {
    const { ImageModal } = require('./src/ui/ImageModal');
    new ImageModal(
      this.app,
      this.client,
      this.imageManager,
      this.settings
    ).open();
  }

  async generateImageFromSelection(editor: any) {
    const selectedText = editor.getSelection();
    if (!selectedText) {
      new Notice('Please select some text first');
      return;
    }

    const { ImageModal } = require('./src/ui/ImageModal');
    new ImageModal(
      this.app,
      this.client,
      this.imageManager,
      this.settings,
      selectedText
    ).open();
  }

  webSearch() {
    const { WebSearchModal } = require('./src/ui/WebSearchModal');
    new WebSearchModal(
      this.app,
      this.client,
      this.settings
    ).open();
  }

  async webSearchFromSelection(editor: any) {
    const selectedText = editor.getSelection();
    if (!selectedText) {
      new Notice('Please select some text first');
      return;
    }

    const { WebSearchModal } = require('./src/ui/WebSearchModal');
    new WebSearchModal(
      this.app,
      this.client,
      this.settings,
      selectedText
    ).open();
  }

  async completeNote(editor: any, file: TFile) {
    const title = file.basename;
    if (!title) {
      new Notice('Note has no title');
      return;
    }

    new Notice('Generating note content...');
    const cursor = editor.getCursor();

    try {
      let response = '';
      await this.client.streamChatCompletion(
        [
          { role: 'system', content: 'You are a helpful assistant that writes comprehensive Obsidian notes in Markdown format.' },
          { role: 'user', content: `Write a complete Obsidian Markdown note about "${title}". Include an introduction, key points, examples, and a conclusion.` },
        ],
        this.settings.defaultModel,
        (chunk) => {
          response += chunk;
        },
        this.settings.temperature,
        this.settings.maxTokens
      );

      editor.replaceRange(response, cursor);
      new Notice('Note completed!');
    } catch (error) {
      console.error('Note completion error:', error);
      new Notice(`Error: ${error.message}`);
    }
  }

  private scheduleInlineAutocomplete(editor: any, file: TFile) {
    if (this.inlineAutocompleteTimer) {
      window.clearTimeout(this.inlineAutocompleteTimer);
    }

    this.inlineAutocompleteTimer = window.setTimeout(() => {
      this.inlineAutocomplete(editor, file, true);
    }, this.settings.inlineAutocompleteDelayMs);
  }

  private setGhostText(editor: any, cursor: { line: number; ch: number }, text: string): boolean {
    const cm = (editor as any).cm as EditorView | undefined;
    if (!cm || typeof cm.dispatch !== 'function') {
      return false;
    }

    const pos = editor.posToOffset(cursor);
    cm.dispatch({
      effects: setGhostTextEffect.of({ text, pos }),
    });
    return true;
  }

  private clearGhostText(editor: any) {
    const cm = (editor as any).cm as EditorView | undefined;
    if (!cm || typeof cm.dispatch !== 'function') {
      return;
    }

    cm.dispatch({
      effects: clearGhostTextEffect.of(null),
    });
  }

  async inlineAutocomplete(editor: any, file: TFile, silent: boolean = false) {
    if (this.inlineAutocompleteInFlight) return;
    if (editor.somethingSelected()) return;

    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const linePrefix = lineText.slice(0, cursor.ch);
    const lineSuffix = lineText.slice(cursor.ch);

    if (lineSuffix.trim().length > 0) return;
    if (linePrefix.trim().length < 3) return;

    const requestId = ++this.inlineAutocompleteRequestId;
    if (!silent) {
      new Notice('Generating autocomplete...');
    }

    this.inlineAutocompleteInFlight = true;
    this.clearGhostText(editor);

    try {
      const fullText = editor.getValue();
      const cursorOffset = editor.posToOffset(cursor);
      const start = Math.max(0, cursorOffset - 2500);
      const end = Math.min(fullText.length, cursorOffset + 800);
      const contextSnippet = fullText.slice(start, end);

      const systemPrompt =
        'You are an inline autocomplete engine for Obsidian notes. Return only the continuation text to insert at the cursor.';
      const userPrompt = `Note title: ${file.basename}\n\nContext around cursor:\n${contextSnippet}\n\nCurrent line:\n${lineText}\nPrefix before cursor:\n${linePrefix}\nSuffix after cursor:\n${lineSuffix}\n\nProvide the continuation to insert.`;

      let completion = '';
      await this.client.streamChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        this.settings.defaultModel,
        (chunk) => {
          completion += chunk;
        },
        this.settings.temperature,
        Math.min(this.settings.maxTokens, 400)
      );

      if (requestId !== this.inlineAutocompleteRequestId) return;

      const currentCursor = editor.getCursor();
      const currentLine = editor.getLine(cursor.line);

      if (currentCursor.line !== cursor.line || currentCursor.ch !== cursor.ch) return;
      if (!currentLine.startsWith(linePrefix)) return;

      const cleanedCompletion = completion.replace(/^\s+/, '').trimEnd();
      if (!cleanedCompletion) {
        if (!silent) new Notice('No completion returned');
        return;
      }

      const ghostApplied = this.setGhostText(editor, cursor, cleanedCompletion);
      if (!ghostApplied) {
        this.isApplyingAutocomplete = true;
        editor.replaceRange(cleanedCompletion, cursor);
        this.isApplyingAutocomplete = false;
        if (!silent) new Notice('Autocomplete inserted');
        return;
      }

      if (!silent) {
        new Notice('Autocomplete ready (Tab to accept)');
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
      if (!silent) {
        new Notice(`Error: ${error.message}`);
      }
    } finally {
      this.inlineAutocompleteInFlight = false;
    }
  }

  async generateOutline(editor: any, file: TFile) {
    const title = file.basename;
    if (!title) {
      new Notice('Note has no title');
      return;
    }

    new Notice('Generating outline...');
    const cursor = editor.getCursor();

    try {
      let response = '';
      await this.client.streamChatCompletion(
        [
          { role: 'system', content: 'You are a helpful assistant that creates structured outlines in Markdown format.' },
          { role: 'user', content: `Create a detailed outline for a note about "${title}". Use Markdown headings and bullet points.` },
        ],
        this.settings.defaultModel,
        (chunk) => {
          response += chunk;
        },
        this.settings.temperature,
        this.settings.maxTokens
      );

      editor.replaceRange(response, cursor);
      new Notice('Outline generated!');
    } catch (error) {
      console.error('Outline generation error:', error);
      new Notice(`Error: ${error.message}`);
    }
  }

  editNoteWithAI(file: TFile) {
    const { EditNoteModal } = require('./src/ui/EditNoteModal');
    new EditNoteModal(
      this.app,
      this.client,
      this.settings,
      file
    ).open();
  }
}

class NanoGPTSettingTab extends PluginSettingTab {
  plugin: NanoGPTPlugin;

  constructor(app: App, plugin: NanoGPTPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your NanoGPT API key')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('Enter your API key')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('NanoGPT API base URL')
      .addText((text) =>
        text
          .setPlaceholder('https://nano-gpt.com/api/v1')
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default Model')
      .setDesc('Default model to use for chat and text generation')
      .addText((text) =>
        text
          .setPlaceholder('zai-org/glm-4.7')
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async (value) => {
            this.plugin.settings.defaultModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show Subscription Only')
      .setDesc('Only show models included in subscription')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.subscriptionOnly)
          .onChange(async (value) => {
            this.plugin.settings.subscriptionOnly = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('Default system prompt for chat')
      .addTextArea((text) =>
        text
          .setPlaceholder('You are a helpful assistant.')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Controls randomness (0.0 - 2.0)')
      .addSlider((slider) =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max Tokens')
      .setDesc('Maximum tokens to generate')
      .addText((text) =>
        text
          .setPlaceholder('2048')
          .setValue(this.plugin.settings.maxTokens.toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.plugin.settings.maxTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Inline Autocomplete')
      .setDesc('Suggest completions as you type')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.inlineAutocompleteEnabled)
          .onChange(async (value) => {
            this.plugin.settings.inlineAutocompleteEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Autocomplete Delay (ms)')
      .setDesc('Wait time after typing before suggesting')
      .addText((text) =>
        text
          .setPlaceholder('700')
          .setValue(this.plugin.settings.inlineAutocompleteDelayMs.toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.plugin.settings.inlineAutocompleteDelayMs = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Folder Context')
      .setDesc('Include other notes in the same folder')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.folderContextEnabled)
          .onChange(async (value) => {
            this.plugin.settings.folderContextEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Folder Context Max Notes')
      .setDesc('Maximum notes to include for context')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(this.plugin.settings.folderContextMaxFiles.toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.plugin.settings.folderContextMaxFiles = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Folder Context Max Characters')
      .setDesc('Limit total context size')
      .addText((text) =>
        text
          .setPlaceholder('8000')
          .setValue(this.plugin.settings.folderContextMaxChars.toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.plugin.settings.folderContextMaxChars = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Image Size')
      .setDesc('Default size for generated images')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            '256x256': '256x256',
            '512x512': '512x512',
            '1024x1024': '1024x1024',
            '1536x1024': '1536x1024',
            '1024x1536': '1024x1536',
          })
          .setValue(this.plugin.settings.imageSize)
          .onChange(async (value) => {
            this.plugin.settings.imageSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Image Quality')
      .setDesc('Default quality for generated images')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            'standard': 'Standard',
            'hd': 'HD',
          })
          .setValue(this.plugin.settings.imageQuality)
          .onChange(async (value) => {
            this.plugin.settings.imageQuality = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Web Search Results')
      .setDesc('Number of results to return')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(this.plugin.settings.webSearchNumResults.toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.plugin.settings.webSearchNumResults = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Web Search Provider')
      .setDesc('Provider name from NanoGPT web search docs')
      .addText((text) =>
        text
          .setPlaceholder('tavily')
          .setValue(this.plugin.settings.webSearchProvider)
          .onChange(async (value) => {
            this.plugin.settings.webSearchProvider = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Web Search Options (JSON)')
      .setDesc('Optional provider-specific options in JSON')
      .addTextArea((text) =>
        text
          .setPlaceholder('{"search_depth": "basic"}')
          .setValue(this.plugin.settings.webSearchOptions)
          .onChange(async (value) => {
            this.plugin.settings.webSearchOptions = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Include Citations')
      .setDesc('Include citation section in web search results')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeCitations)
          .onChange(async (value) => {
            this.plugin.settings.includeCitations = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
