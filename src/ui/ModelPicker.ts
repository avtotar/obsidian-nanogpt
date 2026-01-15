import { NanoGPTModel } from '../api/types';
import { setIcon } from 'obsidian';

export class ModelPicker {
  private containerEl: HTMLElement;
  private buttonEl: HTMLElement;
  private dropdownEl: HTMLElement | null = null;
  private models: NanoGPTModel[] = [];
  private selectedModelId: string;
  private onSelect: (modelId: string) => void;

  constructor(
    containerEl: HTMLElement,
    initialModelId: string,
    onSelect: (modelId: string) => void
  ) {
    this.containerEl = containerEl;
    this.selectedModelId = initialModelId;
    this.onSelect = onSelect;
    this.render();
  }

  public setModels(models: NanoGPTModel[]) {
    this.models = models;
  }

  private render() {
    this.buttonEl = this.containerEl.createEl('button', {
      cls: 'nanogpt-model-picker-btn',
    });
    this.updateButtonText();
    this.buttonEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.dropdownEl && !this.dropdownEl.contains(e.target as Node) && !this.buttonEl.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private updateButtonText() {
    if (!this.buttonEl) return;
    this.buttonEl.empty();
    
    const selectedModel = this.models.find(m => m.id === this.selectedModelId);
    const modelName = selectedModel?.name || this.selectedModelId;
    
    this.buttonEl.createSpan({ text: modelName, cls: 'nanogpt-model-name' });
    if (selectedModel?.kind === 'image') {
      this.buttonEl.createSpan({ text: 'Image', cls: 'nanogpt-model-badge' });
    }
    const iconSpan = this.buttonEl.createSpan({ cls: 'nanogpt-picker-icon' });
    setIcon(iconSpan, 'chevron-down');
  }

  private toggleDropdown() {
    if (this.dropdownEl) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown() {
    const parentRect = this.containerEl.getBoundingClientRect();
    
    this.dropdownEl = document.body.createDiv({
      cls: 'nanogpt-model-picker-dropdown',
    });
    
    // Position dropdown
    this.dropdownEl.style.top = `${parentRect.bottom + 5}px`;
    this.dropdownEl.style.left = `${parentRect.left}px`;

    // Search Input
    const searchContainer = this.dropdownEl.createDiv({ cls: 'nanogpt-model-search' });
    const searchInput = searchContainer.createEl('input', {
      attr: { type: 'text', placeholder: 'Search models...' }
    });
    searchInput.focus();

    // Model List
    const listContainer = this.dropdownEl.createDiv({ cls: 'nanogpt-model-list' });
    this.renderModelList(listContainer, this.models);

    // Filter Logic
    searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase();
      const filtered = this.models.filter(m => 
        m.id.toLowerCase().includes(query) || 
        (m.name && m.name.toLowerCase().includes(query))
      );
      this.renderModelList(listContainer, filtered);
    });
  }

  private renderModelList(container: HTMLElement, models: NanoGPTModel[]) {
    container.empty();
    
    if (models.length === 0) {
      container.createDiv({ 
        text: 'No models found',
        attr: { style: 'padding: 8px 12px; color: var(--text-muted); font-size: 0.8rem;' }
      });
      return;
    }

    models.forEach(model => {
      const item = container.createDiv({
        cls: `nanogpt-model-item ${model.id === this.selectedModelId ? 'selected' : ''}`
      });
      
      const nameRow = item.createDiv({ cls: 'nanogpt-model-item-header' });
      nameRow.createSpan({ text: model.name || model.id, cls: 'nanogpt-model-item-name' });
      if (model.kind === 'image') {
        nameRow.createSpan({ text: 'Image', cls: 'nanogpt-model-badge' });
      }
      if (model.description) {
        item.createDiv({ text: model.description, cls: 'nanogpt-model-item-desc' });
      }

      item.addEventListener('click', () => {
        this.selectedModelId = model.id;
        this.updateButtonText();
        this.onSelect(model.id);
        this.closeDropdown();
      });
    });
  }

  private closeDropdown() {
    if (this.dropdownEl) {
      this.dropdownEl.remove();
      this.dropdownEl = null;
    }
  }
}
