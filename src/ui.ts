import { App, Modal, Notice } from 'obsidian';
import type { LinkType } from './types';

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
		const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'external-links-icon-cancel-btn' });
		const okBtn = actions.createEl('button', { text: 'Confirm', cls: 'external-links-icon-add-btn' });
		cancelBtn.onclick = () => { this._resolver(false); this.close(); };
		okBtn.onclick = () => { this._resolver(true); this.close(); };
	}

	onClose(): void {
		this._resolver(false);
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class NewIconModal extends Modal {
	onSubmit: (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => void | Promise<void>;

	constructor(app: App, onSubmit: (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => void | Promise<void>, defaultLinkType?: LinkType) {
		super(app);
		this.onSubmit = onSubmit;
		this._defaultLinkType = defaultLinkType || 'url';
	}

	private _defaultLinkType: LinkType = 'url';

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Add new icon' });
		contentEl.createEl('div', { text: 'Provide icon information. Name must be unique. ',  cls: 'external-links-icon-desc' });

		const nameInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		nameInput.placeholder = 'Icon name (unique)';
		nameInput.type = 'text';

		const targetInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		targetInput.placeholder = 'Website or scheme identifier';
		targetInput.type = 'text';

		let uploadedSvgData: string | undefined;
		const uploadRow = contentEl.createDiv({ cls: 'external-links-icon-upload-row' });

		const uploadBtn = uploadRow.createEl('button', { text: 'Upload SVG' });
		const uploadName = uploadRow.createSpan({ text: 'No file chosen' });
		const previewDiv = uploadRow.createDiv({ cls: 'external-links-icon-preview-div small' });

		const hiddenInput = document.createElement('input');
		hiddenInput.type = 'file';
		hiddenInput.accept = '.svg,image/svg+xml';
		hiddenInput.classList.add('external-links-icon-hidden-input');
		hiddenInput.onchange = (ev) => {
			const files = (ev.target as HTMLInputElement).files;
			if (!files || files.length === 0) return;
			const file = files[0];
			if (!(file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
				new Notice('Please select a valid SVG file.');
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const content = (typeof reader.result === 'string') ? reader.result : '';
				if (content.trim().startsWith('<svg') && content.includes('</svg>')) {
					uploadedSvgData = content;
					uploadName.textContent = file.name;
					try {
						const img = document.createElement('img');
						const sanitized = content; // assume caller sanitizes on save
						const prepared = sanitized;
						img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
						img.alt = file.name;
						while (previewDiv.firstChild) previewDiv.removeChild(previewDiv.firstChild);
						previewDiv.appendChild(img);
					} catch {
						previewDiv.textContent = '';
					}
				} else {
					new Notice('Invalid SVG content');
				}
			};
			reader.onerror = () => new Notice('Failed to read file');
			reader.readAsText(file);
		};
		document.body.appendChild(hiddenInput);
		uploadBtn.onclick = () => hiddenInput.click();

		const defaultType = this._defaultLinkType || 'url';
		targetInput.placeholder = defaultType === 'url' ? 'Domain (e.g. baidu.com or https://baidu.com)' : 'Scheme identifier (e.g. zotero)';

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => { this.close(); };
		const addBtn = buttonContainer.createEl('button', { text: 'Add icon' });
		addBtn.onclick = () => {
			const name = nameInput.value.trim();
			let target = targetInput.value.trim();
			if (!name) { new Notice('Name is required'); return; }
			if (!target) { new Notice('Target is required'); return; }
			if (this._defaultLinkType === 'url') {
				target = target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
			}
			const result = this.onSubmit({ linkType: this._defaultLinkType, name, target, svgData: uploadedSvgData });
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
	}
}