import { App, Modal, Notice, TextAreaComponent, MarkdownRenderer, Component, TFile } from 'obsidian';
import { NanoGPTClient } from '../api/NanoGPTClient';
import { PluginSettings } from '../api/types';

export class EditNoteModal extends Modal {
  private instructionField: TextAreaComponent;
  private isGenerating = false;
  private resultContainer: HTMLElement;
  private applyButton: HTMLButtonElement;
  private proposedContent = '';
  private component: Component;

  constructor(
    app: App,
    private client: NanoGPTClient,
    private settings: PluginSettings,
    private file: TFile
  ) {
    super(app);
    this.component = new Component();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('nanogpt-edit-modal');

    contentEl.createEl('h2', { text: 'Edit Note with AI' });

    contentEl.createEl('p', { text: 'Describe the edits you want to apply:' });

    this.instructionField = new TextAreaComponent(contentEl)
      .setPlaceholder('Make the intro more concise and add a summary section...')
      .onChange(() => this.adjustTextareaHeight());

    const controls = contentEl.createDiv({ cls: 'nanogpt-edit-controls' });

    const generateButton = controls.createEl('button', {
      text: 'Generate Preview',
      cls: 'mod-cta',
    });
    generateButton.addEventListener('click', async () => {
      await this.generatePreview();
    });

    this.applyButton = controls.createEl('button', {
      text: 'Apply Changes',
      cls: 'mod-cta',
    });
    this.applyButton.disabled = true;
    this.applyButton.addEventListener('click', async () => {
      await this.applyChanges();
    });

    this.resultContainer = contentEl.createDiv({
      cls: 'nanogpt-edit-preview',
    });

    const closeButton = contentEl.createEl('button', { text: 'Close' });
    closeButton.addEventListener('click', () => this.close());
  }

  async onClose() {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
  }

  private async getFolderContext(): Promise<string> {
    if (!this.settings.folderContextEnabled) return '';

    const folderPath = this.file.parent?.path ?? '';
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (file.path === this.file.path) return false;
      return file.parent?.path === folderPath;
    });

    if (files.length === 0) return '';

    const contextEntries: string[] = [];
    let totalChars = 0;
    let fileCount = 0;

    for (const file of files) {
      if (fileCount >= this.settings.folderContextMaxFiles) break;

      try {
        const content = await this.app.vault.read(file);
        if (!content) continue;

        const nextEntry = `\n---\nFile: ${file.basename}\n${content}\n`;
        if (totalChars + nextEntry.length > this.settings.folderContextMaxChars) break;

        contextEntries.push(nextEntry);
        totalChars += nextEntry.length;
        fileCount += 1;
      } catch (error) {
        console.warn('Failed to read file for folder context', error);
      }
    }

    if (contextEntries.length === 0) return '';

    return `\n\nContext from notes in folder "${folderPath || '/'}":\n${contextEntries.join('')}`;
  }

  private async generatePreview() {
    const instructions = this.instructionField.getValue().trim();
    if (!instructions) {
      new Notice('Please enter edit instructions');
      return;
    }

    if (this.isGenerating) return;

    this.isGenerating = true;
    this.resultContainer.empty();
    this.resultContainer.createEl('p', { text: 'Generating preview...' });

    try {
      const originalContent = await this.app.vault.read(this.file);
      const folderContext = await this.getFolderContext();
      const systemPrompt =
        'You are an assistant that edits Obsidian notes. Return the full revised note in Markdown only.';
      const userPrompt = `Edit instructions:\n${instructions}\n\nOriginal note:\n${originalContent}${folderContext}`;

      let updatedContent = '';

      await this.client.streamChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        this.settings.defaultModel,
        (chunk) => {
          updatedContent += chunk;
        },
        this.settings.temperature,
        this.settings.maxTokens
      );

      this.proposedContent = updatedContent.trim();
      this.applyButton.disabled = this.proposedContent.length === 0;

      this.resultContainer.empty();
      await MarkdownRenderer.render(
        this.app,
        this.proposedContent,
        this.resultContainer,
        this.file.path,
        this.component
      );
    } catch (error) {
      console.error('Edit note error:', error);
      new Notice(`Error: ${error.message}`);
      this.resultContainer.createEl('p', {
        text: `Error: ${error.message}`,
        cls: 'nanogpt-error',
      });
    } finally {
      this.isGenerating = false;
    }
  }

  private async applyChanges() {
    if (!this.proposedContent) return;

    try {
      await this.app.vault.modify(this.file, this.proposedContent);
      new Notice('Note updated');
      this.close();
    } catch (error) {
      console.error('Apply edit error:', error);
      new Notice(`Error: ${error.message}`);
    }
  }

  private adjustTextareaHeight() {
    const textarea = this.instructionField.inputEl;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }
}
