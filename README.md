# NanoGPT Assistant for Obsidian

A full-featured Obsidian plugin integrating NanoGPT's AI capabilities including chat, text generation, image generation, web search, web scraping, and note editing.

## Features

- **AI Chat Assistant**: Streaming chat with per-note history stored in plugin settings
- **Ask/Edit Modes**: Ask questions or edit the active note directly with inline accept/reject
- **Inline Autocomplete**: Ghost-text suggestions with Tab-to-accept
- **Folder Context**: Optionally include other notes in the same folder
- **Text Generation**: Summarize, expand, rewrite, and explain text
- **Image Generation**: Create images using NanoGPT image models
- **Web Search**: Search the web and insert formatted results with citations
- **Web Scraping**: Paste any URL in chat to scrape and save pages as notes
- **Note Creation**: Create and link multiple notes from chat edit mode
- **Model Filtering**: Filter models by subscription tier
- **Image Storage**: Automatically save generated images to vault

## Installation

1. Download the latest release from [GitHub Releases](https://github.com/nanogpt-community/obsidian-nanogpt/releases)
2. Extract the archive to your Obsidian vault's plugins folder: `YourVault/.obsidian/plugins/obsidian-nanogpt/`
3. Enable the plugin in Obsidian Settings > Community Plugins
4. Click on "NanoGPT Assistant" in the settings to configure your API key

## Setup

1. Get your NanoGPT API key from [nano-gpt.com/api](https://nano-gpt.com/api)
2. Open Obsidian Settings > Community Plugins > NanoGPT Assistant
3. Enter your API key in the settings
4. Configure default model, temperature, and other options as needed

## Usage

### Chat

1. Open any note
2. Click the NanoGPT ribbon icon or run "NanoGPT: Open Chat" command
3. Choose **Ask** or **Edit** mode in the header
4. Type your message and click Send
5. Edit mode returns a proposed update with **Accept/Reject** buttons
6. Chat history is stored in plugin settings per note path

**Edit mode commands**

- `create note: Title` - Create a new note in the current folder
- `create notes: A, B, C` - Create multiple notes and link them back

### Text Generation Commands

- **NanoGPT: Generate Summary** - Summarize selected text
- **NanoGPT: Expand Selection** - Expand on selected content
- **NanoGPT: Rewrite Text** - Rewrite selected text
- **NanoGPT: Explain Selection** - Explain in simpler terms
- **NanoGPT: Inline Autocomplete** - On-demand completion at cursor

### Image Generation

- **NanoGPT: Generate Image** - Open modal to generate image
- **NanoGPT: Generate Image from Selection** - Use selected text as prompt
- Generated images can be saved to vault or inserted directly into notes

### Web Search

- **NanoGPT: Web Search** - Search web and insert results
- **NanoGPT: Web Search from Selection** - Use selected text as query
- Results include formatted markdown with citations

### Web Scraping

- Paste a URL into chat to scrape and save it as a note
- A confirmation prompt appears before scraping
- Scraped notes are linked back into the active note

### Note Completion

- **NanoGPT: Complete Note** - Generate content based on note title
- **NanoGPT: Generate Outline** - Create outline for note

## Configuration

### API Settings

- **API Key**: Your NanoGPT API key (required)
- **Base URL**: NanoGPT API endpoint (default: `https://nano-gpt.com/api/v1`)
- **Default Model**: Model to use for chat/text (default: `zai-org/glm-4.7`)
- **Show Subscription Only**: Filter to subscription-included models

### Chat Settings

- **System Prompt**: Default system prompt for chat
- **Temperature**: Controls randomness (0.0 - 2.0, default: 0.7)
- **Max Tokens**: Maximum tokens to generate (default: 2048)

### Image Settings

- **Image Size**: Default size for generated images (256x256 to 1536x1024)
- **Image Quality**: Standard or HD quality

### Web Search Settings

- **Web Search Results**: Number of results to return (default: 5)
- **Web Search Provider**: Provider name for NanoGPT web search
- **Web Search Options**: JSON options sent to the provider
- **Include Citations**: Add citation section to results

### Autocomplete Settings

- **Inline Autocomplete**: Enable ghost-text suggestions
- **Autocomplete Delay**: Wait time before suggestions

### Folder Context Settings

- **Folder Context**: Include other notes in the active folder
- **Folder Context Max Notes**: Limit number of notes included
- **Folder Context Max Characters**: Total context cap

## Chat History Storage

Chat history is stored in the plugin's saved settings, keyed by note path. This keeps note files untouched while preserving per-note context.

## Image Storage

Generated images are saved to your vault's attachments folder (respects your Obsidian attachment settings). Images are named with format: `nanogpt-{timestamp}-{hash}.png`

## Default Model

The default model is `zai-org/glm-4.7`. You can change this in settings or use any other NanoGPT-supported model.

## Development

```bash
# Install dependencies
npm install

# Development build with hot reload
npm run dev

# Production build
npm run build
```
