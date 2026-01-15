import { App, Modal, Notice, TextAreaComponent, MarkdownView, MarkdownRenderer, Component } from 'obsidian';
import { NanoGPTClient } from '../api/NanoGPTClient';
import { PluginSettings, WebSearchResponse } from '../api/types';

export class WebSearchModal extends Modal {
  private queryField: TextAreaComponent;
  private isSearching = false;
  private resultContainer: HTMLElement;
  private component: Component;

  constructor(
    app: App,
    private client: NanoGPTClient,
    private settings: PluginSettings,
    private initialQuery?: string
  ) {
    super(app);
    this.component = new Component();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('nanogpt-websearch-modal');

    contentEl.createEl('h2', { text: 'Web Search' });

    this.queryField = new TextAreaComponent(contentEl)
      .setPlaceholder('Search the web...')
      .onChange(() => this.adjustTextareaHeight());

    if (this.initialQuery) {
      this.queryField.setValue(this.initialQuery);
    }

    const optionsContainer = contentEl.createDiv({
      cls: 'nanogpt-websearch-options',
    });

    optionsContainer.createEl('label', { text: 'Results: ' });
    const numResultsSelect = optionsContainer.createEl('select');
    numResultsSelect.createEl('option', { value: '3', text: '3' });
    numResultsSelect.createEl('option', { value: '5', text: '5' });
    numResultsSelect.createEl('option', { value: '10', text: '10' });
    numResultsSelect.value = this.settings.webSearchNumResults.toString();

    const searchButton = contentEl.createEl('button', {
      text: 'Search',
      cls: 'mod-cta',
    });
    searchButton.addEventListener('click', async () => {
      await this.performSearch(parseInt(numResultsSelect.value));
    });

    this.resultContainer = contentEl.createDiv({
      cls: 'nanogpt-websearch-result',
    });

    const closeButton = contentEl.createEl('button', { text: 'Close' });
    closeButton.addEventListener('click', () => this.close());
  }

  async onClose() {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
  }

  private async performSearch(numResults: number) {
    const query = this.queryField.getValue().trim();
    if (!query) {
      new Notice('Please enter a search query');
      return;
    }

    if (this.isSearching) return;

    this.isSearching = true;
    this.resultContainer.empty();
    this.resultContainer.createEl('p', { text: 'Searching...' });

    try {
      const response = await this.client.webSearch({
        query,
        num_results: numResults,
        provider: this.settings.webSearchProvider,
        options: this.settings.webSearchOptions,
      });

      this.resultContainer.empty();

      const markdown = this.formatWebSearchResults(response);

      const previewContainer = this.resultContainer.createDiv({
        cls: 'nanogpt-websearch-preview',
      });
      
      await MarkdownRenderer.render(
        this.app,
        markdown,
        previewContainer,
        '',
        this.component
      );

      const insertButton = this.resultContainer.createEl('button', {
        text: 'Insert into Note',
        cls: 'mod-cta',
      });
      insertButton.addEventListener('click', () => {
        this.insertIntoNote(markdown);
      });
    } catch (error) {
      console.error('Web search error:', error);
      new Notice(`Error: ${error.message}`);
      this.resultContainer.createEl('p', {
        text: `Error: ${error.message}`,
        cls: 'nanogpt-error',
      });
    } finally {
      this.isSearching = false;
    }
  }

  private formatWebSearchResults(response: WebSearchResponse): string {
    let markdown = `## Web Search: "${response.query}"\n\n`;
    markdown += `### Results\n\n`;

    response.results.forEach((result, index) => {
      markdown += `${index + 1}. [${result.title}](${result.url})\n`;
      markdown += `   ${result.summary}\n`;
      if (result.source) {
        markdown += `   Source: ${result.source}\n`;
      }
      markdown += '\n';
    });

    if (this.settings.includeCitations) {
      markdown += `### Citations\n\n`;
      response.results.forEach((result, index) => {
        markdown += `- [${index + 1}] ${result.title} - ${result.url}\n`;
      });
    }

    return markdown;
  }

  private insertIntoNote(markdown: string) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeView) {
      const editor = activeView.editor;
      const cursor = editor.getCursor();
      editor.replaceRange(`\n${markdown}\n`, cursor);
      new Notice('Web search results inserted');
      this.close();
    } else {
      new Notice('No active markdown note open');
    }
  }

  private renderMarkdownToHTML(markdown: string): string {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      .replace(/^\d+\. \[(.*?)\]\((.*?)\)/gim, '<li><strong><a href="$2" target="_blank">$1</a></strong></li>')
      .replace(/^   (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }

  private adjustTextareaHeight() {
    const textarea = this.queryField.inputEl;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }
}
