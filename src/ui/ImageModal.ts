import { App, Modal, Notice, TextAreaComponent, MarkdownView } from 'obsidian';
import { NanoGPTClient } from '../api/NanoGPTClient';
import { ImageManager } from '../storage/ImageManager';
import { PluginSettings } from '../api/types';

export class ImageModal extends Modal {
  private promptField: TextAreaComponent;
  private isGenerating = false;
  private resultContainer: HTMLElement;

  constructor(
    app: App,
    private client: NanoGPTClient,
    private imageManager: ImageManager,
    private settings: PluginSettings,
    private initialPrompt?: string
  ) {
    super(app);
    if (initialPrompt) {
      this.promptField = new TextAreaComponent(document.createElement('textarea'));
      this.promptField.setValue(initialPrompt);
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('nanogpt-image-modal');

    contentEl.createEl('h2', { text: 'Generate Image' });

    contentEl.createEl('p', { text: 'Describe the image you want to generate:' });

    this.promptField = new TextAreaComponent(contentEl)
      .setPlaceholder('A beautiful sunset over the ocean...')
      .onChange(() => this.adjustTextareaHeight());

    if (this.initialPrompt) {
      this.promptField.setValue(this.initialPrompt);
    }

    const optionsContainer = contentEl.createDiv({
      cls: 'nanogpt-image-options',
    });

    optionsContainer.createEl('label', { text: 'Model: ' });
    const modelSelect = optionsContainer.createEl('select');
    modelSelect.createEl('option', { value: '', text: 'Loading...' });
    modelSelect.disabled = true;

    this.client.listImageModels().then(models => {
      modelSelect.empty();
      modelSelect.disabled = false;
      
      models.forEach(m => {
        modelSelect.createEl('option', { value: m.model, text: m.name });
      });

      // Default to flux-pro if available, otherwise first one
      if (models.some(m => m.model === 'flux-pro')) {
        modelSelect.value = 'flux-pro';
      }
    });

    optionsContainer.createEl('label', { text: ' Size: ' });
    const sizeSelect = optionsContainer.createEl('select');
    sizeSelect.createEl('option', { value: '256x256', text: '256x256' });
    sizeSelect.createEl('option', { value: '512x512', text: '512x512' });
    sizeSelect.createEl('option', { value: '1024x1024', text: '1024x1024' });
    sizeSelect.createEl('option', { value: '1536x1024', text: '1536x1024' });
    sizeSelect.createEl('option', { value: '1024x1536', text: '1024x1536' });
    sizeSelect.value = this.settings.imageSize;

    optionsContainer.createEl('label', { text: ' Quality: ' });
    const qualitySelect = optionsContainer.createEl('select');
    qualitySelect.createEl('option', { value: 'standard', text: 'Standard' });
    qualitySelect.createEl('option', { value: 'hd', text: 'HD' });
    qualitySelect.value = this.settings.imageQuality;

    const generateButton = contentEl.createEl('button', {
      text: 'Generate',
      cls: 'mod-cta',
    });
    generateButton.addEventListener('click', async () => {
      await this.generateImage(
        modelSelect.value,
        sizeSelect.value,
        qualitySelect.value
      );
    });

    this.resultContainer = contentEl.createDiv({
      cls: 'nanogpt-image-result',
    });

    const closeButton = contentEl.createEl('button', { text: 'Close' });
    closeButton.addEventListener('click', () => this.close());
  }

  async onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async generateImage(
    model: string,
    size: string,
    quality: string
  ) {
    const prompt = this.promptField.getValue().trim();
    if (!prompt) {
      new Notice('Please enter a prompt');
      return;
    }

    if (this.isGenerating) return;

    this.isGenerating = true;
    this.resultContainer.empty();
    this.resultContainer.createEl('p', { text: 'Generating image...' });

    try {
      const response = await this.client.generateImage({
        prompt,
        model,
        size,
        quality,
      });

      this.resultContainer.empty();

      for (const imageData of response.data) {
        const imageDataUrl = imageData.b64_json
          ? `data:image/png;base64,${imageData.b64_json}`
          : imageData.url;

        const imgContainer = this.resultContainer.createDiv({
          cls: 'nanogpt-image-item',
        });

        const img = imgContainer.createEl('img', {
          attr: { src: imageDataUrl || '' },
          cls: 'nanogpt-generated-image',
        });

        const actions = imgContainer.createDiv({
          cls: 'nanogpt-image-actions',
        });

        const insertButton = actions.createEl('button', {
          text: 'Insert into Note',
          cls: 'mod-cta',
        });
        insertButton.addEventListener('click', async () => {
          if (imageData.b64_json) {
            const markdownLink = await this.imageManager.saveImageToVault(
              imageData.b64_json,
              prompt
            );
            
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
              await this.imageManager.insertImageIntoEditor(
                activeView.editor,
                markdownLink
              );
              new Notice('Image inserted into note');
            }
          } else if (imageData.url) {
            new Notice('External image - please save manually');
          }
        });

        const saveButton = actions.createEl('button', {
          text: 'Save to Vault',
        });
        saveButton.addEventListener('click', async () => {
          if (imageData.b64_json) {
            await this.imageManager.saveImageToVault(
              imageData.b64_json,
              prompt
            );
          }
        });
      }
    } catch (error) {
      console.error('Image generation error:', error);
      new Notice(`Error: ${error.message}`);
      this.resultContainer.createEl('p', {
        text: `Error: ${error.message}`,
        cls: 'nanogpt-error',
      });
    } finally {
      this.isGenerating = false;
    }
  }

  private adjustTextareaHeight() {
    const textarea = this.promptField.inputEl;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }
}
