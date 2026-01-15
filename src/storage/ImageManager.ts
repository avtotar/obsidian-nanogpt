import { App, Notice } from 'obsidian';
import { createHash } from 'node:crypto';

export class ImageManager {
  constructor(private app: App) {}

  async saveImageToVault(base64Data: string, prompt: string): Promise<string> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const uint8Array = new Uint8Array(buffer);
      const extension = 'png';
      const timestamp = Date.now();
      const hash = this.generateShortHash(prompt);

      const filename = `nanogpt-${timestamp}-${hash}.${extension}`;
      const path = await this.app.fileManager.getAvailablePathForAttachment(filename);

      await this.app.vault.createBinary(path, uint8Array.buffer);

      const markdownLink = `![[${filename}]]`;
      new Notice(`Image saved to: ${path}`);

      return markdownLink;
    } catch (error) {
      console.error('Error saving image:', error);
      new Notice('Failed to save image to vault');
      throw error;
    }
  }

  private generateShortHash(prompt: string): string {
    const hash = createHash('md5').update(prompt).digest('hex');
    return hash.substring(0, 8);
  }

  async insertImageIntoEditor(editor: any, markdownLink: string): Promise<void> {
    editor.replaceRange(`\n${markdownLink}\n`, editor.getCursor());
  }
}
