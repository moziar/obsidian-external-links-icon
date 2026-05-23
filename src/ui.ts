import { App, Modal, Notice } from 'obsidian';
import type { IconItem, LinkType } from './types';
import { t } from './lang/helper';
import { prepareSvgForSettings } from './svg';

export class ConfirmModal extends Modal {
	private _message: string;
	private _resolver: (value: boolean) => void = () => {};
	public result: Promise<boolean>;

	constructor(app: App, message: string) {
		super(app);
		this._message = message;
		this.result = new Promise<boolean>((resolve) => { this._resolver = resolve; });
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('div', { text: this._message });
		const actions = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = actions.createEl('button', { text: t('Cancel'), cls: 'external-links-icon-cancel-btn' });
		const okBtn = actions.createEl('button', { text: t('Confirm'), cls: 'external-links-icon-add-btn' });
		cancelBtn.onclick = () => { this._resolver(false); this.close(); };
		okBtn.onclick = () => { this._resolver(true); this.close(); };
	}

	onClose(): void {
		this._resolver(false);
		const { contentEl } = this;
		contentEl.empty();
	}
}

export interface NewIconData {
	linkType: LinkType;
	name: string;
	target: string;
	svgData?: string;
	themeDarkSvgData?: string;
}

export class NewIconModal extends Modal {
	onSubmit: (data: NewIconData) => void | Promise<void>;

	constructor(app: App, onSubmit: (data: NewIconData) => void | Promise<void>, defaultLinkType?: LinkType) {
		super(app);
		this.onSubmit = onSubmit;
		this._defaultLinkType = defaultLinkType || 'url';
	}

	private _defaultLinkType: LinkType = 'url';
	private hiddenInputs: HTMLInputElement[] = [];

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		const doc = contentEl.ownerDocument;

		contentEl.createEl('h3', { text: t('Add new icon') });
		contentEl.createEl('div', { text: t('Provide icon information. Name must be unique. '),  cls: 'external-links-icon-desc' });

		const nameInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		nameInput.placeholder = t('Icon name (unique)');
		nameInput.type = 'text';

		const targetInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		targetInput.placeholder = t('Website or scheme identifier');
		targetInput.type = 'text';

		const defaultType = this._defaultLinkType || 'url';
		targetInput.placeholder = defaultType === 'url' ? t('Domain (e.g. baidu.com or https://baidu.com)') : t('Scheme identifier (e.g. zotero)');

		let uploadedSvgData: string | undefined;
		let uploadedDarkSvgData: string | undefined;

		const defaultSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
		defaultSection.createEl('div', { text: t('Default icon (light mode)'), cls: 'external-links-icon-upload-label' });
		const defaultRow = defaultSection.createDiv({ cls: 'external-links-icon-upload-row' });
		const defaultBtn = defaultRow.createEl('button', { text: t('Upload SVG') });
		const defaultName = defaultRow.createSpan({ text: t('No file chosen') });
		const defaultPreview = defaultRow.createDiv({ cls: 'external-links-icon-preview-div small' });

		const defaultInput = createFileInput(doc, (content, fileName) => {
			uploadedSvgData = content;
			defaultName.textContent = fileName;
			renderPreview(doc, defaultPreview, content, fileName);
		});
		this.hiddenInputs.push(defaultInput);
		doc.body.appendChild(defaultInput);
		defaultBtn.onclick = () => defaultInput.click();

		const darkSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
		darkSection.createEl('div', { text: t('Dark mode icon (optional)'), cls: 'external-links-icon-upload-label' });
		const darkRow = darkSection.createDiv({ cls: 'external-links-icon-upload-row' });
		const darkBtn = darkRow.createEl('button', { text: t('Upload SVG') });
		const darkName = darkRow.createSpan({ text: t('No file chosen') });
		const darkPreview = darkRow.createDiv({ cls: 'external-links-icon-preview-div small' });
		darkSection.createEl('div', { text: t('Dark mode icon hint'), cls: 'external-links-icon-upload-hint' });

		const darkInput = createFileInput(doc, (content, fileName) => {
			uploadedDarkSvgData = content;
			darkName.textContent = fileName;
			renderPreview(doc, darkPreview, content, fileName);
		});
		this.hiddenInputs.push(darkInput);
		doc.body.appendChild(darkInput);
		darkBtn.onclick = () => darkInput.click();

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: t('Cancel') });
		cancelBtn.onclick = () => { this.close(); };
		const addBtn = buttonContainer.createEl('button', { text: t('Add icon') });
		addBtn.onclick = () => {
			const name = nameInput.value.trim();
			let target = targetInput.value.trim();
			if (!name) { new Notice(t('Name is required')); return; }
			if (!target) { new Notice(t('Target is required')); return; }
			if (!uploadedSvgData && uploadedDarkSvgData) {
				new Notice(t('Default icon is required when uploading a dark mode icon'));
				return;
			}
			if (this._defaultLinkType === 'url') {
				target = target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
			}
			const result = this.onSubmit({ linkType: this._defaultLinkType, name, target, svgData: uploadedSvgData, themeDarkSvgData: uploadedDarkSvgData });
			if (result instanceof Promise) {
				result.catch((e) => {
					console.error('Failed to add icon:', e);
					new Notice('Failed to add icon');
				});
			}
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		for (const input of this.hiddenInputs) {
			if (input.isConnected) input.remove();
		}
		this.hiddenInputs = [];
	}
}

export class EditIconModal extends Modal {
	private icon: IconItem;
	private onSave: (data: { svgData?: string; themeDarkSvgData?: string | null }) => void | Promise<void>;
	private hiddenInputs: HTMLInputElement[] = [];

	constructor(
		app: App,
		icon: IconItem,
		onSave: (data: { svgData?: string; themeDarkSvgData?: string | null }) => void | Promise<void>,
	) {
		super(app);
		this.icon = icon;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		const doc = contentEl.ownerDocument;

		contentEl.createEl('h3', { text: `${t('Edit icon')}: ${this.icon.name}` });

		let newSvgData: string | undefined;
		let newDarkSvgData: string | undefined;
		let removeDark = false;
		let removeBtn: HTMLButtonElement | undefined;
		let removeIndicator: HTMLSpanElement | undefined;

		const defaultSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section external-links-icon-light-section' });
		defaultSection.createEl('div', { text: t('Default icon (light mode)'), cls: 'external-links-icon-upload-label' });

		if (this.icon.svgData) {
			const currentRow = defaultSection.createDiv({ cls: 'external-links-icon-current-row' });
			currentRow.createSpan({ text: t('Current icon'), cls: 'external-links-icon-current-label' });
			const currentPreview = currentRow.createDiv({ cls: 'external-links-icon-preview-div modal-preview' });
			try {
				const prepared = prepareSvgForSettings(this.icon.svgData, currentPreview);
				const img = doc.createElement('img');
				img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
				img.alt = 'current';
				currentPreview.appendChild(img);
			} catch { currentPreview.textContent = '🔧'; }
		}

		const defaultRow = defaultSection.createDiv({ cls: 'external-links-icon-upload-row' });
		const defaultBtn = defaultRow.createEl('button', { text: t('Upload new') });
		const defaultName = defaultRow.createSpan({ text: t('No file chosen') });
		const defaultPreview = defaultRow.createDiv({ cls: 'external-links-icon-preview-div small' });

		const defaultInput = createFileInput(doc, (content, fileName) => {
			newSvgData = content;
			defaultName.textContent = fileName;
			renderPreview(doc, defaultPreview, content, fileName);
		});
		this.hiddenInputs.push(defaultInput);
		doc.body.appendChild(defaultInput);
		defaultBtn.onclick = () => defaultInput.click();

		const darkSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section external-links-icon-dark-section' });
		darkSection.createEl('div', { text: t('Dark mode icon (optional)'), cls: 'external-links-icon-upload-label' });

		if (this.icon.themeDarkSvgData) {
			const currentDarkRow = darkSection.createDiv({ cls: 'external-links-icon-current-row dark-bg' });
			currentDarkRow.createSpan({ text: t('Current icon'), cls: 'external-links-icon-current-label' });
			const currentDarkPreview = currentDarkRow.createDiv({ cls: 'external-links-icon-preview-div modal-preview' });
			try {
				const prepared = prepareSvgForSettings(this.icon.themeDarkSvgData, currentDarkPreview);
				const img = doc.createElement('img');
				img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
				img.alt = 'current dark';
				currentDarkPreview.appendChild(img);
			} catch { currentDarkPreview.textContent = '🔧'; }

			removeBtn = currentDarkRow.createEl('button', { text: t('Remove'), cls: 'external-links-icon-remove-btn' });
			removeIndicator = currentDarkRow.createSpan({ cls: 'external-links-icon-remove-indicator' });
			removeBtn!.onclick = () => {
				removeDark = !removeDark;
				removeIndicator!.textContent = removeDark ? ` ✓ ${t('Will be removed on save')}` : '';
				removeBtn!.classList.toggle('is-active', removeDark);
			};
		}

		const darkRow = darkSection.createDiv({ cls: 'external-links-icon-upload-row' });
		const darkBtn = darkRow.createEl('button', { text: t('Upload new') });
		const darkName = darkRow.createSpan({ text: t('No file chosen') });
		const darkPreview = darkRow.createDiv({ cls: 'external-links-icon-preview-div small' });
		darkSection.createEl('div', { text: t('Dark mode icon hint'), cls: 'external-links-icon-upload-hint' });

		const darkInput = createFileInput(doc, (content, fileName) => {
			newDarkSvgData = content;
			removeDark = false;
			if (removeBtn) removeBtn.classList.remove('is-active');
			if (removeIndicator) removeIndicator.textContent = '';
			darkName.textContent = fileName;
			renderPreview(doc, darkPreview, content, fileName);
		});
		this.hiddenInputs.push(darkInput);
		doc.body.appendChild(darkInput);
		darkBtn.onclick = () => darkInput.click();

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: t('Cancel') });
		cancelBtn.onclick = () => { this.close(); };
		const saveBtn = buttonContainer.createEl('button', { text: t('Save'), cls: 'external-links-icon-add-btn' });
		saveBtn.onclick = () => {
			if (newDarkSvgData && !this.icon.svgData && !newSvgData) {
				new Notice(t('Default icon is required when uploading a dark mode icon'));
				return;
			}
			const data: { svgData?: string; themeDarkSvgData?: string | null } = {};
			if (newSvgData) data.svgData = newSvgData;
			if (removeDark) {
				data.themeDarkSvgData = null;
			} else if (newDarkSvgData) {
				data.themeDarkSvgData = newDarkSvgData;
			}
			const result = this.onSave(data);
			if (result instanceof Promise) {
				result.catch((e) => {
					console.error('Failed to save icon:', e);
					new Notice(t('Failed to save'));
				});
			}
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		for (const input of this.hiddenInputs) {
			if (input.isConnected) input.remove();
		}
		this.hiddenInputs = [];
	}
}

function createFileInput(doc: Document, onValid: (content: string, fileName: string) => void): HTMLInputElement {
	const input = doc.createElement('input');
	input.type = 'file';
	input.accept = '.svg,image/svg+xml';
	input.classList.add('external-links-icon-hidden-input');
	input.onchange = (ev) => {
		const files = (ev.target as HTMLInputElement).files;
		if (!files || files.length === 0) return;
		const file = files[0];
		if (!(file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
			new Notice(t('Please select a valid SVG file.'));
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const content = (typeof reader.result === 'string') ? reader.result : '';
			if (content.trim().startsWith('<svg') && content.includes('</svg>')) {
				onValid(content, file.name);
			} else {
				new Notice(t('Invalid SVG content'));
			}
		};
		reader.onerror = () => new Notice(t('Failed to read file'));
		reader.readAsText(file);
	};
	return input;
}

function renderPreview(doc: Document, previewDiv: HTMLElement, content: string, fileName: string): void {
	try {
		const img = doc.createElement('img');
		img.src = `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
		img.alt = fileName;
		while (previewDiv.firstChild) previewDiv.removeChild(previewDiv.firstChild);
		previewDiv.appendChild(img);
	} catch {
		previewDiv.textContent = '';
	}
}
