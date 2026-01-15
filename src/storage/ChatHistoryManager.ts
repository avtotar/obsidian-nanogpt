import { App, TFile, Plugin } from 'obsidian';
import { ChatMessage, PluginSettings } from '../api/types';

export class ChatHistoryManager {
  private history: { [path: string]: ChatMessage[] } = {};
  private loaded = false;

  constructor(private app: App, private plugin: Plugin & { settings: PluginSettings }) {}

  private async ensureLoaded() {
    if (this.loaded) return;
    // We can access settings directly if the plugin instance passed has them
    // Or reload via loadData if we want to be sure
    this.history = this.plugin.settings.chatHistory || {};
    this.loaded = true;
  }

  async loadChatHistory(file: TFile): Promise<ChatMessage[]> {
    await this.ensureLoaded();
    return this.history[file.path] || [];
  }

  async saveChatHistory(file: TFile, messages: ChatMessage[]): Promise<void> {
    await this.ensureLoaded();
    this.history[file.path] = messages;
    
    // Update settings object
    this.plugin.settings.chatHistory = this.history;
    // Persist to disk
    await this.plugin.saveData(this.plugin.settings);
  }

  async appendMessage(file: TFile, message: ChatMessage): Promise<void> {
    const messages = await this.loadChatHistory(file);
    messages.push(message);
    await this.saveChatHistory(file, messages);
  }

  async clearChatHistory(file: TFile): Promise<void> {
    await this.saveChatHistory(file, []);
  }
}
