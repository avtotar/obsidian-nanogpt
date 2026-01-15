import { ItemView, WorkspaceLeaf, Notice, TextAreaComponent, TFile, setIcon, Menu, MarkdownView, MarkdownRenderer, Modal, normalizePath } from 'obsidian';
import { NanoGPTClient } from '../api/NanoGPTClient';
import { ChatHistoryManager } from '../storage/ChatHistoryManager';
import { ChatMessage, PluginSettings } from '../api/types';
import { ModelPicker } from './ModelPicker';

export const VIEW_TYPE_CHAT = 'nanogpt-chat-view';

export class ChatView extends ItemView {
  private messages: ChatMessage[] = [];
  private isGenerating = false;
  private chatContainer: HTMLElement;
  private inputField: TextAreaComponent;
  private sendButton: HTMLButtonElement;
  private activeFile: TFile | null = null;
  private modelPicker: ModelPicker;
  private currentModel: string;
  private webSearchEnabled = false;
  private imageModelIds = new Set<string>();
  private chatMode: 'ask' | 'edit' = 'ask';
  private pendingEditPreview: { file: TFile; original: string; updated: string } | null = null;
  
  constructor(
    leaf: WorkspaceLeaf,
    private client: NanoGPTClient,
    private chatHistoryManager: ChatHistoryManager,
    private settings: PluginSettings
  ) {
    super(leaf);
    this.currentModel = settings.defaultModel;
  }

  getViewType() {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText() {
    return 'NanoGPT Chat';
  }

  getIcon() {
    return 'sparkles';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('nanogpt-chat-view');

    // Header / Toolbar
    const header = container.createDiv({ cls: 'nanogpt-header' });
    
    // Model Picker Container
    const modelPickerContainer = header.createDiv({ cls: 'nanogpt-model-picker-container' });
    this.modelPicker = new ModelPicker(modelPickerContainer, this.currentModel, (modelId) => {
      this.currentModel = modelId;
      new Notice(`Model changed to ${modelId}`);
    });

    const modeToggle = header.createDiv({ cls: 'nanogpt-chat-mode-toggle' });
    const askModeButton = modeToggle.createEl('button', {
      text: 'Ask',
      cls: 'nanogpt-mode-btn is-active',
    });
    const editModeButton = modeToggle.createEl('button', {
      text: 'Edit',
      cls: 'nanogpt-mode-btn',
    });

    const setMode = (mode: 'ask' | 'edit') => {
      this.chatMode = mode;
      if (mode === 'ask') {
        askModeButton.addClass('is-active');
        editModeButton.removeClass('is-active');
      } else {
        editModeButton.addClass('is-active');
        askModeButton.removeClass('is-active');
      }
      new Notice(`Chat mode: ${mode === 'ask' ? 'Ask' : 'Edit'}`);
    };

    askModeButton.addEventListener('click', () => setMode('ask'));
    editModeButton.addEventListener('click', () => setMode('edit'));

    // Load models
    this.loadModels();

    // Header Actions
    const actionsContainer = header.createDiv({ cls: 'nanogpt-header-actions' });
    
    const webSearchBtn = actionsContainer.createEl('button', {
      cls: 'nanogpt-icon-btn',
      attr: { 'aria-label': 'Toggle Web Search' }
    });
    setIcon(webSearchBtn, 'globe');
    webSearchBtn.addEventListener('click', () => {
      this.webSearchEnabled = !this.webSearchEnabled;
      if (this.webSearchEnabled) {
        webSearchBtn.addClass('is-active');
        new Notice('Web Search enabled');
      } else {
        webSearchBtn.removeClass('is-active');
        new Notice('Web Search disabled');
      }
    });

    const newChatBtn = actionsContainer.createEl('button', {
      cls: 'nanogpt-icon-btn',
      attr: { 'aria-label': 'Clear Chat' }
    });
    setIcon(newChatBtn, 'plus-circle');
    newChatBtn.addEventListener('click', () => this.clearChat());

    // Chat Area
    this.chatContainer = container.createDiv({
      cls: 'nanogpt-chat-container',
    });

    // Input Area (Fixed at bottom)
    const inputContainer = container.createDiv({
      cls: 'nanogpt-input-container',
    });

    const inputWrapper = inputContainer.createDiv({
      cls: 'nanogpt-input-wrapper'
    });

    this.inputField = new TextAreaComponent(inputWrapper)
      .setPlaceholder('Message NanoGPT...')
      .onChange(() => this.adjustInputHeight());
    
    // Auto-focus input on click
    this.inputField.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    const inputFooter = inputWrapper.createDiv({ cls: 'nanogpt-input-footer' });
    
    // Context Indicator
    const contextIndicator = inputFooter.createDiv({ cls: 'nanogpt-context-indicator' });
    setIcon(contextIndicator.createSpan(), 'file-text');
    const contextText = contextIndicator.createSpan({ text: 'No file' });

    this.sendButton = inputFooter.createEl('button', {
      text: 'Send',
      cls: 'nanogpt-send-btn',
    }) as HTMLButtonElement;
    this.sendButton.addEventListener('click', () => this.sendMessage());

    // Listen for file changes
    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        this.activeFile = file;
        contextText.setText(file ? file.basename : 'No file');
        await this.onActiveFileChange(file);
      })
    );

    // Initial load
    const file = this.app.workspace.getActiveFile();
    this.activeFile = file;
    contextText.setText(file ? file.basename : 'No file');
    await this.onActiveFileChange(file);
  }

  async onClose() {
    // Cleanup handled by Obsidian
  }

  async loadModels() {
    try {
      const [models, imageModels] = await Promise.all([
        this.client.listModels(this.settings.subscriptionOnly),
        this.client.listImageModels(),
      ]);

      this.imageModelIds = new Set(imageModels.map((model) => model.model));

      const chatModels = models.map((model) => ({
        ...model,
        kind: model.kind || 'chat',
      }));

      const imageAsModels = imageModels.map((model) => ({
        id: model.model,
        object: 'model',
        name: model.name,
        description: model.description || 'Image generation model',
        kind: 'image' as const,
      }));

      this.modelPicker.setModels([...chatModels, ...imageAsModels]);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  }

  async onActiveFileChange(file: TFile | null) {
    if (file) {
      await this.loadChatHistory();
      await this.renderMessages();
      if (this.inputField) this.inputField.setDisabled(false);
      if (this.sendButton) this.sendButton.disabled = false;
    } else {
      this.chatContainer.empty();
      const emptyState = this.chatContainer.createDiv({ cls: 'nanogpt-empty-state' });
      setIcon(emptyState.createDiv(), 'file-question');
      emptyState.createDiv({ text: 'Open a note to start a conversation.' });
      
      if (this.inputField) this.inputField.setDisabled(true);
      if (this.sendButton) this.sendButton.disabled = true;
    }
  }

  private async loadChatHistory() {
    if (this.activeFile) {
      this.messages = await this.chatHistoryManager.loadChatHistory(this.activeFile);
    } else {
      this.messages = [];
    }
  }

  private async renderMessages() {
    this.chatContainer.empty();

    if (!this.activeFile) return;

    if (this.messages.length === 0) {
      const emptyState = this.chatContainer.createDiv({ cls: 'nanogpt-empty-state' });
      setIcon(emptyState.createDiv(), 'message-square');
      emptyState.createDiv({ text: 'Start a new thread.' });
      return;
    }

    for (const msg of this.messages) {
      await this.appendMessageToUI(msg.role, msg.content);
    }

    this.scrollToBottom();
  }

  private async appendMessageToUI(role: string, content: string) {
    const messageEl = this.chatContainer.createDiv({
      cls: `nanogpt-message nanogpt-${role}`,
    });

    // Role Label (Only for Assistant)
    if (role !== 'user') {
      const headerDiv = messageEl.createDiv({ cls: 'nanogpt-message-header' });
      headerDiv.createSpan({ text: 'NanoGPT', cls: 'nanogpt-message-role' });
      
      // Action Buttons
      const actionsDiv = headerDiv.createDiv({ cls: 'nanogpt-message-actions' });
      
      const copyBtn = actionsDiv.createEl('button', { cls: 'nanogpt-msg-btn', attr: { 'aria-label': 'Copy' } });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        new Notice('Copied to clipboard');
      });

      const insertBtn = actionsDiv.createEl('button', { cls: 'nanogpt-msg-btn', attr: { 'aria-label': 'Insert at Cursor' } });
      setIcon(insertBtn, 'arrow-down-to-line'); // or 'log-in' or 'file-input'
      insertBtn.addEventListener('click', () => this.insertContentIntoNote(content));

    }

    const contentEl = messageEl.createDiv({
      cls: 'nanogpt-message-content',
    });
    
    await MarkdownRenderer.render(
      this.app,
      content,
      contentEl,
      this.activeFile?.path || '',
      this
    );

    if (role !== 'user' && this.pendingEditPreview) {
      const preview = this.pendingEditPreview;
      this.pendingEditPreview = null;

      const controls = contentEl.createDiv({ cls: 'nanogpt-edit-inline-controls' });
      const acceptBtn = controls.createEl('button', { text: 'Accept', cls: 'mod-cta' });
      const rejectBtn = controls.createEl('button', { text: 'Reject' });

      acceptBtn.addEventListener('click', async () => {
        await this.app.vault.modify(preview.file, preview.updated);
        new Notice('Edits applied');
      });

      rejectBtn.addEventListener('click', () => {
        new Notice('Edits rejected');
      });
    }
  }

  private insertContentIntoNote(content: string) {
    // 1. Try getting the active view directly (fastest)
    let view = this.app.workspace.getActiveViewOfType(MarkdownView);

    // 2. If not found or file doesn't match, search for the specific leaf
    if (!view || (this.activeFile && (!view.file || view.file.path !== this.activeFile.path))) {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      const matchingLeaf = leaves.find(
        (leaf) => (leaf.view as MarkdownView).file?.path === this.activeFile?.path
      );

      if (matchingLeaf) {
        view = matchingLeaf.view as MarkdownView;
        // Focus the leaf to ensure editor actions work
        this.app.workspace.setActiveLeaf(matchingLeaf, { focus: true });
      }
    }

    if (view) {
      const editor = view.editor;
      editor.focus();
      editor.replaceSelection(content);
      new Notice('Inserted into note');
    } else {
      new Notice('Could not find editor for this note');
    }
  }

  private formatMessageContent(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  private async getNoteContent(): Promise<string> {
    if (!this.activeFile) return '';
    try {
      return await this.app.vault.read(this.activeFile);
    } catch (error) {
      console.error('Error reading note content:', error);
      return '';
    }
  }

  private async getFolderContext(): Promise<string> {
    if (!this.activeFile) return '';
    if (!this.settings.folderContextEnabled) return '';

    const folderPath = this.activeFile.parent?.path ?? '';
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (file.path === this.activeFile?.path) return false;
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

  private extractUrls(text: string): string[] {
    const regex = /(https?:\/\/[^\s)\]]+)/g;
    const urls = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const url = match[1]?.trim();
      if (url) urls.add(url);
    }

    return Array.from(urls).slice(0, 5);
  }

  private async confirmScrapeUrls(urls: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.contentEl.addClass('nanogpt-edit-modal');
      modal.contentEl.createEl('h2', { text: 'Scrape URLs?' });
      modal.contentEl.createEl('p', {
        text: 'This will scrape the URL(s) and create notes. Continue?',
      });

      const list = modal.contentEl.createEl('ul');
      urls.forEach((url) => {
        list.createEl('li', { text: url });
      });

      const actions = modal.contentEl.createDiv({ cls: 'nanogpt-edit-controls' });
      const confirmBtn = actions.createEl('button', { text: 'Scrape', cls: 'mod-cta' });
      const cancelBtn = actions.createEl('button', { text: 'Cancel' });

      const finish = (value: boolean) => {
        resolve(value);
        modal.close();
      };

      confirmBtn.addEventListener('click', () => finish(true));
      cancelBtn.addEventListener('click', () => finish(false));
      modal.onClose = () => resolve(false);
      modal.open();
    });
  }


  private parseCreateNotesCommand(text: string): string[] {
    const trimmed = text.trim();
    const match = trimmed.match(/^create\s+notes?:\s*(.+)$/i);
    if (!match) return [];

    const payload = match[1];
    return payload
      .split(/[\n,;]/)
      .map((title) => title.trim())
      .filter(Boolean);
  }

  private async getUniqueNotePath(folderPath: string, title: string): Promise<string> {
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled';
    const basePath = normalizePath(folderPath ? `${folderPath}/${safeTitle}` : safeTitle);
    let candidate = `${basePath}.md`;
    let index = 1;

    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${basePath} (${index}).md`;
      index += 1;
    }

    return candidate;
  }

  private getChatModelId(): string {
    return this.imageModelIds.has(this.currentModel)
      ? this.settings.defaultModel
      : this.currentModel;
  }

  private async createNotesWithLinks(titles: string[], contextNote: TFile): Promise<string[]> {
    const folderPath = contextNote.parent?.path ?? '';
    const createdPaths: string[] = [];
    const chatModelId = this.getChatModelId();

    for (const title of titles) {
      const notePath = await this.getUniqueNotePath(folderPath, title);
      const noteTitle = notePath.split('/').pop()?.replace(/\.md$/, '') || title;

      const systemPrompt =
        'You are a helpful assistant that writes concise Obsidian notes in Markdown format.';
      const userPrompt = `Write an Obsidian note titled "${noteTitle}".`;

      let content = '';
      await this.client.streamChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        chatModelId,
        (chunk) => {
          content += chunk;
        },
        this.settings.temperature,
        Math.min(this.settings.maxTokens, 1200)
      );

      const finalContent = content.trim() || `# ${noteTitle}\n`;
      await this.app.vault.create(notePath, finalContent);
      createdPaths.push(notePath);
    }

    if (createdPaths.length > 0) {
      const links = createdPaths
        .map((path) => `- [[${path.replace(/\.md$/, '').split('/').pop()}]]`)
        .join('\n');

      const sectionHeader = '\n\n## Related Notes\n';
      const currentContent = await this.app.vault.read(contextNote);
      const updatedContent = currentContent.includes('## Related Notes')
        ? `${currentContent}\n${links}`
        : `${currentContent}${sectionHeader}${links}`;

      await this.app.vault.modify(contextNote, updatedContent);
    }

    return createdPaths;
  }

  private async createNotesFromScrape(urls: string[], contextNote: TFile): Promise<string[]> {
    const response = await this.client.scrapeUrls({ urls });
    const successful = response.results.filter((result) => result.success);

    if (successful.length === 0) {
      return [];
    }

    const folderPath = contextNote.parent?.path ?? '';
    const createdPaths: string[] = [];

    for (const result of successful) {
      const title = result.title || result.url;
      const notePath = await this.getUniqueNotePath(folderPath, title);
      const noteTitle = notePath.split('/').pop()?.replace(/\.md$/, '') || title;
      const body = result.markdown || result.content || '';
      const content = `# ${noteTitle}\n\nSource: ${result.url}\n\n${body}`;
      await this.app.vault.create(notePath, content.trim());
      createdPaths.push(notePath);
    }

    if (createdPaths.length > 0) {
      const links = createdPaths
        .map((path) => `- [[${path.replace(/\.md$/, '').split('/').pop()}]]`)
        .join('\n');

      const sectionHeader = '\n\n## Web Scrapes\n';
      const currentContent = await this.app.vault.read(contextNote);
      const updatedContent = currentContent.includes('## Web Scrapes')
        ? `${currentContent}\n${links}`
        : `${currentContent}${sectionHeader}${links}`;

      await this.app.vault.modify(contextNote, updatedContent);
    }

    return createdPaths;
  }

  private async sendMessage() {
    const userMessage = this.inputField.getValue().trim();
    if (!userMessage || this.isGenerating || !this.activeFile) return;

    this.isGenerating = true;
    this.sendButton.disabled = true;
    
    // Typing indicator
    const assistantPlaceholder = this.createTypingIndicator();

    const userMsg: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(userMsg);
    await this.appendMessageToUI('user', userMessage);
    this.inputField.setValue('');
    this.adjustInputHeight();
    this.scrollToBottom();

    // Move placeholder to bottom
    this.chatContainer.appendChild(assistantPlaceholder);
    this.scrollToBottom();

    let assistantResponse = '';
    const contentEl = assistantPlaceholder.querySelector('.nanogpt-message-content') as HTMLElement;

    try {
      const noteContent = await this.getNoteContent();
      const folderContext = await this.getFolderContext();
      let urls = this.extractUrls(userMessage);

      if (urls.length > 0) {
        const shouldScrape = await this.confirmScrapeUrls(urls);
        if (shouldScrape) {
          contentEl.empty();
          contentEl.createDiv({ cls: 'nanogpt-edit-status', text: 'Scraping URLs...' });

          const createdPaths = await this.createNotesFromScrape(urls, this.activeFile);
          assistantResponse = createdPaths.length > 0
            ? `Scraped ${createdPaths.length} pages and saved them as notes.`
            : 'No pages were scraped.';

          assistantPlaceholder.remove();
          await this.appendMessageToUI('assistant', assistantResponse);
          urls = [];
        } else {
          urls = [];
        }
      }

      if (assistantResponse === '' && this.chatMode === 'edit') {
        const createNotes = this.parseCreateNotesCommand(userMessage);
        if (createNotes.length > 0) {
          contentEl.empty();
          contentEl.createDiv({ cls: 'nanogpt-edit-status', text: 'Creating notes...' });

          const createdPaths = await this.createNotesWithLinks(createNotes, this.activeFile);
          assistantResponse = createdPaths.length > 0
            ? `Created ${createdPaths.length} notes and linked them in "${this.activeFile.basename}".`
            : 'No notes were created.';

          assistantPlaceholder.remove();
          await this.appendMessageToUI('assistant', assistantResponse);
        } else {
          contentEl.empty();
          contentEl.createDiv({ cls: 'nanogpt-edit-status', text: 'Preparing edit preview...' });

          const systemPrompt =
            'You are an assistant that edits Obsidian notes. Return the full revised note in Markdown only.';
          const userPrompt = `Edit instructions:\n${userMessage}\n\nOriginal note:\n${noteContent}${folderContext}`;

          let updatedContent = '';
          await this.client.streamChatCompletion(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            this.getChatModelId(),
            (chunk) => {
              updatedContent += chunk;
            },
            this.settings.temperature,
            this.settings.maxTokens
          );

          updatedContent = updatedContent.trim();
          if (!updatedContent) {
            throw new Error('No updated note returned');
          }

          this.pendingEditPreview = {
            file: this.activeFile,
            original: noteContent,
            updated: updatedContent,
          };

          assistantResponse = `### Proposed edits\n\n${updatedContent}\n\nUse the buttons below to accept or reject these changes.`;
          assistantPlaceholder.remove();
          await this.appendMessageToUI('assistant', assistantResponse);
        }
      } else if (assistantResponse === '' && this.imageModelIds.has(this.currentModel)) {
        const imageResponse = await this.client.generateImage({
          prompt: userMessage,
          model: this.currentModel,
          size: this.settings.imageSize,
          quality: this.settings.imageQuality,
        });

        const images = imageResponse.data
          .map((imageData, index) => {
            const imageDataUrl = imageData.b64_json
              ? `data:image/png;base64,${imageData.b64_json}`
              : imageData.url;

            if (!imageDataUrl) return '';
            return `![Generated image ${index + 1}](${imageDataUrl})`;
          })
          .filter(Boolean);

        assistantResponse = images.length > 0
          ? `Generated images:\n\n${images.join('\n\n')}`
          : 'No images returned.';

        assistantPlaceholder.remove();
        await this.appendMessageToUI('assistant', assistantResponse);
      } else if (assistantResponse === '') {
        let searchContext = '';
        if (this.webSearchEnabled) {
          // Show temporary status
          const statusEl = contentEl.createDiv({ cls: 'nanogpt-search-status', text: 'Searching web...' });
          try {
            const searchResults = await this.client.webSearch({
              query: userMessage,
              num_results: 3,
              provider: this.settings.webSearchProvider,
              options: this.settings.webSearchOptions,
            });
            if (searchResults.results && searchResults.results.length > 0) {
               searchContext = `\n\nWeb Search Results for "${userMessage}":\n` + 
                 searchResults.results.map((r, i) => `${i+1}. [${r.title}](${r.url}): ${r.summary}`).join('\n');
            }
          } catch (e) {
            console.error("Web search failed", e);
          } finally {
            statusEl.remove();
          }
        }

        const systemPromptWithContext = `${this.settings.systemPrompt}\n\nContext from active note "${this.activeFile.basename}":\n${noteContent}${folderContext}${searchContext}`;

        await this.client.streamChatCompletion(
          [
            { role: 'system', content: systemPromptWithContext },
            ...this.messages.filter(m => m.role !== 'system'),
          ],
          this.getChatModelId(),
          (chunk) => {
            if (assistantResponse === '') {
               contentEl.empty(); // Remove typing indicator on first chunk
            }
            assistantResponse += chunk;
            contentEl.innerHTML = this.formatMessageContent(assistantResponse);
            this.scrollToBottom();
          },
          this.settings.temperature,
          this.settings.maxTokens
        );

        // Replace placeholder with actual message to get actions
        assistantPlaceholder.remove();
        await this.appendMessageToUI('assistant', assistantResponse);
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date().toISOString(),
        model: this.currentModel,
      };

      this.messages.push(assistantMsg);
      if (this.activeFile) {
        await this.chatHistoryManager.saveChatHistory(this.activeFile, this.messages);
      }
    } catch (error) {
      console.error('Chat error:', error);
      new Notice(`Error: ${error.message}`);
      contentEl.setText(`Error: ${error.message}`);
      contentEl.addClass('nanogpt-error');
    } finally {
      this.isGenerating = false;
      this.sendButton.disabled = false;
      this.inputField.inputEl.focus();
    }
  }

  private createTypingIndicator(): HTMLElement {
    const messageEl = this.chatContainer.createDiv({
      cls: `nanogpt-message nanogpt-assistant`,
    });
    
    // Simple header without actions for typing state
    const headerDiv = messageEl.createDiv({ cls: 'nanogpt-message-header' });
    headerDiv.createSpan({ cls: 'nanogpt-message-role', text: 'NanoGPT' });

    const contentEl = messageEl.createDiv({ cls: 'nanogpt-message-content' });
    
    const indicator = contentEl.createDiv({ cls: 'nanogpt-typing-indicator' });
    indicator.createDiv({ cls: 'nanogpt-dot' });
    indicator.createDiv({ cls: 'nanogpt-dot' });
    indicator.createDiv({ cls: 'nanogpt-dot' });

    return messageEl;
  }

  private async clearChat() {
    if (!this.activeFile) return;
    this.messages = [];
    await this.chatHistoryManager.clearChatHistory(this.activeFile);
    await this.renderMessages();
    new Notice('Chat cleared');
  }

  private adjustInputHeight() {
    const textarea = this.inputField.inputEl;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  private scrollToBottom() {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }
}
