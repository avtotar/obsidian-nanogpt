import { App, Modal, MarkdownRenderer, Component, Notice, TFile } from 'obsidian';

export class EditPreviewModal extends Modal {
  private component: Component;

  constructor(
    app: App,
    private file: TFile,
    private originalContent: string,
    private updatedContent: string,
    private onApply: () => Promise<void>
  ) {
    super(app);
    this.component = new Component();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('nanogpt-edit-preview-modal');

    contentEl.createEl('h2', { text: 'Review AI Edits' });
    contentEl.createEl('p', { text: 'Preview the changes before applying them.' });

    const previewGrid = contentEl.createDiv({ cls: 'nanogpt-edit-preview-grid' });
    const originalPane = previewGrid.createDiv({ cls: 'nanogpt-edit-preview-pane' });
    const updatedPane = previewGrid.createDiv({ cls: 'nanogpt-edit-preview-pane' });

    originalPane.createEl('h3', { text: 'Original' });
    const originalBody = originalPane.createDiv({ cls: 'nanogpt-edit-preview-body' });
    await MarkdownRenderer.render(
      this.app,
      this.originalContent,
      originalBody,
      this.file.path,
      this.component
    );

    updatedPane.createEl('h3', { text: 'Proposed' });
    const updatedBody = updatedPane.createDiv({ cls: 'nanogpt-edit-preview-body' });
    await MarkdownRenderer.render(
      this.app,
      this.updatedContent,
      updatedBody,
      this.file.path,
      this.component
    );

    const actions = contentEl.createDiv({ cls: 'nanogpt-edit-controls' });
    const applyButton = actions.createEl('button', {
      text: 'Apply Changes',
      cls: 'mod-cta',
    });
    applyButton.addEventListener('click', async () => {
      try {
        await this.onApply();
        new Notice('Edits applied');
        this.close();
      } catch (error) {
        console.error('Failed to apply edits', error);
        new Notice(`Error: ${error.message}`);
      }
    });

    const closeButton = actions.createEl('button', { text: 'Cancel' });
    closeButton.addEventListener('click', () => this.close());
  }

  async onClose() {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
  }
}
