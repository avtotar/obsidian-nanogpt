# 2024-01-15 - Initial Release

## Features Added

### Core
- Plugin initialization and settings management
- API client with SSE streaming support
- Model caching and filtering
- Configuration tab with all settings

### Chat
- Chat modal with streaming responses
- Per-note chat history (frontmatter storage)
- System prompt support
- Clear chat functionality

### Text Generation
- Generate Summary
- Expand Selection
- Rewrite Text
- Explain Selection

### Image Generation
- Generate Image modal
- Generate Image from Selection
- Model selection (Flux Pro, DALL-E 3, Stable Diffusion XL)
- Size and quality options
- Save to vault with automatic naming
- Insert into note

### Web Search
- Web Search modal
- Web Search from Selection
- Configurable result count
- Citation section option
- Markdown formatting

### Note Completion
- Complete Note command
- Generate Outline command

### Storage
- ChatHistoryManager for frontmatter persistence
- ImageManager for vault storage
- Automatic filename generation

### UI
- Responsive modals
- Loading states
- Error handling
- User notices

### Default Configuration
- API Key: Required (user-provided)
- Base URL: https://nano-gpt.com/api/v1
- Default Model: zai-org/glm-4.7
- Subscription Only: true
- Temperature: 0.7
- Max Tokens: 2048
- Image Size: 1024x1024
- Image Quality: standard
- Web Search Results: 5
- Include Citations: true

## Known Issues
- None initially reported

## Future Enhancements
- Custom prompt templates
- Multiple chat sessions per note
- Image variation/regeneration
- Voice input for chat
- Export chat history to separate file
- Keyboard shortcuts for common actions
