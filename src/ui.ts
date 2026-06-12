import { App, Modal, Notice, setIcon } from 'obsidian';
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
	target: string | string[];
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

		const nameInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		nameInput.placeholder = t('Icon name (unique)');
		nameInput.type = 'text';

		const isUrl = this._defaultLinkType === 'url';

		// For URL type: multi-value domain input; for Scheme: single input
		let domainList: string[] = [];
		let targetInput: HTMLInputElement;
		let domainTagsContainer: HTMLDivElement | undefined;

		if (isUrl) {
			targetInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
			targetInput.type = 'text';
			targetInput.placeholder = t('Domain (e.g. baike.baidu.com or baidu.com/about)');

			const addRow = contentEl.createDiv({ cls: 'external-links-icon-domain-add-row' });
			const addDomainBtn = addRow.createEl('button', { text: t('Add domain'), cls: 'external-links-icon-btn' });
			domainTagsContainer = contentEl.createDiv({ cls: 'external-links-icon-domain-tags' });

			const renderTags = () => {
				domainTagsContainer!.empty();
				domainList.forEach((domain, idx) => {
					const tag = domainTagsContainer!.createDiv({ cls: 'external-links-icon-domain-tag' });
					tag.createSpan({ text: domain });
					const removeBtn = tag.createEl('button', { cls: 'external-links-icon-domain-tag-remove' });
					setIcon(removeBtn, 'lucide-x');
					removeBtn.onclick = () => {
						domainList.splice(idx, 1);
						renderTags();
					};
				});
			};

			const addDomain = () => {
				const val = targetInput.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
				if (!val) return;
				if (domainList.includes(val)) {
					new Notice(t('Domain already added'));
					return;
				}
				domainList.push(val);
				targetInput.value = '';
				renderTags();
			};

			addDomainBtn.onclick = addDomain;
			targetInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					addDomain();
				}
			});
		} else {
			targetInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
			targetInput.type = 'text';
			targetInput.placeholder = t('Scheme identifier (e.g. zotero)');
		}

		let uploadedSvgData: string | undefined;
		let uploadedDarkSvgData: string | undefined;

		const defaultSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
		defaultSection.createEl('div', { text: t('Default icon (light mode)'), cls: 'external-links-icon-upload-label' });

		const lightBody = defaultSection.createDiv({ cls: 'external-links-icon-section-body' });

		const { badge: lightBadge, preview: lightPreview } = createBadgeWithPreview(lightBody, 'light');

		const lightControls = lightBody.createDiv({ cls: 'external-links-icon-controls-col' });
		const lightRow = lightControls.createDiv({ cls: 'external-links-icon-control-row' });
		const lightUploadBtn = lightRow.createEl('button', { cls: 'external-links-icon-btn' });
		setIcon(lightUploadBtn, 'lucide-upload');
		lightUploadBtn.appendText(` ${t('Upload icon')}`);

	const lightInput = createFileInput(doc, (content) => {
			uploadedSvgData = content;
			lightBadge.classList.remove('external-links-icon-badge-empty');
			renderPreview(doc, lightPreview, content, 'uploaded');
		});
		this.hiddenInputs.push(lightInput);
		doc.body.appendChild(lightInput);
		lightUploadBtn.onclick = () => lightInput.click();

		const darkSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
		darkSection.createEl('div', { text: t('Dark mode icon (optional)'), cls: 'external-links-icon-upload-label' });

		const darkBody = darkSection.createDiv({ cls: 'external-links-icon-section-body' });

		const { badge: darkBadge, preview: darkPreview } = createBadgeWithPreview(darkBody, 'dark');

		const darkControls = darkBody.createDiv({ cls: 'external-links-icon-controls-col' });
		const darkRow = darkControls.createDiv({ cls: 'external-links-icon-control-row' });
		const darkUploadBtn = darkRow.createEl('button', { cls: 'external-links-icon-btn' });
		setIcon(darkUploadBtn, 'lucide-upload');
		darkUploadBtn.appendText(` ${t('Upload icon')}`);
		darkSection.createEl('div', { text: t('Dark mode icon hint'), cls: 'external-links-icon-upload-hint' });

		const darkInput = createFileInput(doc, (content) => {
			uploadedDarkSvgData = content;
			darkBadge.classList.remove('external-links-icon-badge-empty');
			renderPreview(doc, darkPreview, content, 'uploaded');
		});
		this.hiddenInputs.push(darkInput);
		doc.body.appendChild(darkInput);
		darkUploadBtn.onclick = () => darkInput.click();

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: t('Cancel') });
		cancelBtn.onclick = () => { this.close(); };
		const addBtn = buttonContainer.createEl('button', { text: t('Add icon') });
		addBtn.onclick = () => {
			const name = nameInput.value.trim();
			if (!name) { new Notice(t('Name is required')); return; }

			let target: string | string[];
			if (isUrl) {
				// Also pick up any text still in the input that hasn't been added
				const remaining = targetInput.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
				if (remaining && !domainList.includes(remaining)) {
					domainList.push(remaining);
				}
				if (domainList.length === 0) { new Notice(t('Target is required')); return; }
				target = domainList.length === 1 ? domainList[0] : domainList;
			} else {
				target = targetInput.value.trim();
				if (!target) { new Notice(t('Target is required')); return; }
			}

			if (!uploadedSvgData) {
				new Notice(t('Default icon is required'));
				return;
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
	private onSave: (data: { svgData?: string; themeDarkSvgData?: string | null; target?: string | string[] }) => void | Promise<void>;
	private hiddenInputs: HTMLInputElement[] = [];

	constructor(
		app: App,
		icon: IconItem,
		onSave: (data: { svgData?: string; themeDarkSvgData?: string | null; target?: string | string[] }) => void | Promise<void>,
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

		// Domain editing for URL type
		let domainList: string[] = [];
		let domainTagsContainer: HTMLDivElement | undefined;
		let targetInput: HTMLInputElement | undefined;

		if (this.icon.linkType === 'url') {
			domainList = [this.icon.target || ''].flat().filter(Boolean);

			const domainSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
			domainSection.createEl('div', { text: t('Domains'), cls: 'external-links-icon-upload-label' });

			domainTagsContainer = domainSection.createDiv({ cls: 'external-links-icon-domain-tags' });

			const renderTags = () => {
				domainTagsContainer!.empty();
				domainList.forEach((domain, idx) => {
					const tag = domainTagsContainer!.createDiv({ cls: 'external-links-icon-domain-tag' });
					tag.createSpan({ text: domain });
					const removeBtn = tag.createEl('button', { cls: 'external-links-icon-domain-tag-remove' });
					setIcon(removeBtn, 'lucide-x');
					removeBtn.onclick = () => {
						domainList.splice(idx, 1);
						renderTags();
					};
				});
			};
			renderTags();

			const addRow = domainSection.createDiv({ cls: 'external-links-icon-domain-add-row' });
			targetInput = addRow.createEl('input', { cls: 'external-links-icon-modal-input' });
			targetInput.type = 'text';
			targetInput.placeholder = t('Domain (e.g. baike.baidu.com or baidu.com/about)');
			const addDomainBtn = addRow.createEl('button', { text: t('Add domain'), cls: 'external-links-icon-btn' });

			const addDomain = () => {
				const val = targetInput!.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
				if (!val) return;
				if (domainList.includes(val)) {
					new Notice(t('Domain already added'));
					return;
				}
				domainList.push(val);
				targetInput!.value = '';
				renderTags();
			};

			addDomainBtn.onclick = addDomain;
			targetInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					addDomain();
				}
			});
		} else {
			// Scheme type: single target input
			const schemeSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
			schemeSection.createEl('div', { text: t('Scheme identifier'), cls: 'external-links-icon-upload-label' });
			targetInput = schemeSection.createEl('input', { cls: 'external-links-icon-modal-input' });
			targetInput.type = 'text';
			targetInput.placeholder = t('Scheme identifier (e.g. zotero)');
			const targetStr = typeof this.icon.target === 'string' ? this.icon.target : (Array.isArray(this.icon.target) ? this.icon.target[0] || '' : '');
			targetInput.value = targetStr;
		}

		let newSvgData: string | undefined;
		let newDarkSvgData: string | undefined;
		let removeDark = false;
		let removeBtn: HTMLButtonElement | undefined;
		let removeIndicator: HTMLSpanElement | undefined;
		let darkBadge: HTMLDivElement;
		let darkPreview: HTMLDivElement;

		const lightSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
		lightSection.createEl('div', { text: t('Default icon (light mode)'), cls: 'external-links-icon-upload-label' });

		const lightBody = lightSection.createDiv({ cls: 'external-links-icon-section-body' });

		const { badge: lightBadge, preview: lightPreview } = createBadgeWithPreview(lightBody, 'light', this.icon.svgData, this.icon.name);

		const lightControls = lightBody.createDiv({ cls: 'external-links-icon-controls-col' });
		const lightRow = lightControls.createDiv({ cls: 'external-links-icon-control-row' });
		const lightUploadBtn = lightRow.createEl('button', { cls: 'external-links-icon-btn' });
		setIcon(lightUploadBtn, 'lucide-upload');
		lightUploadBtn.appendText(` ${t('Upload new icon')}`);

		if (this.icon.svgData && !this.icon.themeDarkSvgData) {
			const copyBtn = lightRow.createEl('button', { cls: 'external-links-icon-btn external-links-icon-btn-copy' });
			setIcon(copyBtn, 'lucide-copy');
			copyBtn.appendText(` ${t('Copy to dark')}`);
			copyBtn.onclick = () => {
				newDarkSvgData = newSvgData || this.icon.svgData;
				removeDark = false;
				if (removeBtn) removeBtn.classList.remove('is-active');
				if (removeIndicator) removeIndicator.textContent = '';
				darkBadge.classList.remove('external-links-icon-badge-empty');
				renderPreview(doc, darkPreview, newDarkSvgData, 'copied');
				new Notice(t('Copied to dark'));
			};
		}

		const lightInput = createFileInput(doc, (content) => {
			newSvgData = content;
			lightBadge.classList.remove('external-links-icon-badge-empty');
			renderPreview(doc, lightPreview, content, 'uploaded');
		});
		this.hiddenInputs.push(lightInput);
		doc.body.appendChild(lightInput);
		lightUploadBtn.onclick = () => lightInput.click();

		const darkSection = contentEl.createDiv({ cls: 'external-links-icon-upload-section' });
		darkSection.createEl('div', { text: t('Dark mode icon (optional)'), cls: 'external-links-icon-upload-label' });

		const darkBody = darkSection.createDiv({ cls: 'external-links-icon-section-body' });

		const darkBadgeResult = createBadgeWithPreview(darkBody, 'dark', this.icon.themeDarkSvgData, this.icon.name);
		darkBadge = darkBadgeResult.badge;
		darkPreview = darkBadgeResult.preview;

		const darkControls = darkBody.createDiv({ cls: 'external-links-icon-controls-col' });
		const darkRow = darkControls.createDiv({ cls: 'external-links-icon-control-row' });
		const darkUploadBtn = darkRow.createEl('button', { cls: 'external-links-icon-btn' });
		setIcon(darkUploadBtn, 'lucide-upload');
		darkUploadBtn.appendText(` ${t('Upload new icon')}`);

		if (this.icon.themeDarkSvgData) {
			removeBtn = darkRow.createEl('button', { text: t('Remove'), cls: 'external-links-icon-btn external-links-icon-btn-danger' });
			removeIndicator = darkRow.createSpan({ cls: 'external-links-icon-remove-indicator' });
			removeBtn.onclick = () => {
				removeDark = !removeDark;
				removeIndicator!.textContent = removeDark ? ` ✓ ${t('Will be removed on save')}` : '';
				removeBtn!.classList.toggle('is-active', removeDark);
			};
		}

		darkSection.createEl('div', { text: t('Dark mode icon hint'), cls: 'external-links-icon-upload-hint' });

		const darkInput = createFileInput(doc, (content) => {
			newDarkSvgData = content;
			removeDark = false;
			if (removeBtn) removeBtn.classList.remove('is-active');
			if (removeIndicator) removeIndicator.textContent = '';
			darkBadge.classList.remove('external-links-icon-badge-empty');
			renderPreview(doc, darkPreview, content, 'uploaded');
		});
		this.hiddenInputs.push(darkInput);
		doc.body.appendChild(darkInput);
		darkUploadBtn.onclick = () => darkInput.click();

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: t('Cancel') });
		cancelBtn.onclick = () => { this.close(); };
		const saveBtn = buttonContainer.createEl('button', { text: t('Save'), cls: 'external-links-icon-add-btn' });
		saveBtn.onclick = () => {
			if (newDarkSvgData && !this.icon.svgData && !newSvgData) {
				new Notice(t('Default icon is required when uploading a dark mode icon'));
				return;
			}
			const data: { svgData?: string; themeDarkSvgData?: string | null; target?: string | string[] } = {};
			if (newSvgData) data.svgData = newSvgData;
			if (removeDark) {
				data.themeDarkSvgData = null;
			} else if (newDarkSvgData) {
				data.themeDarkSvgData = newDarkSvgData;
			}

			// Target editing
			if (this.icon.linkType === 'url') {
				// Also pick up any text still in the input
				const remaining = targetInput!.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
				if (remaining && !domainList.includes(remaining)) {
					domainList.push(remaining);
				}
				if (domainList.length > 0) {
					const newTarget = domainList.length === 1 ? domainList[0] : [...domainList];
					// Only include target if it changed
					const oldTargets = [this.icon.target || ''].flat().filter(Boolean);
					if (JSON.stringify(oldTargets) !== JSON.stringify(domainList)) {
						data.target = newTarget;
					}
				} else {
					data.target = '';
				}
			} else {
				// Scheme type
				const newSchemeTarget = targetInput!.value.trim();
				if (newSchemeTarget !== (typeof this.icon.target === 'string' ? this.icon.target : '')) {
					data.target = newSchemeTarget;
				}
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

function downloadSvg(svgData: string, fileName: string): void {
	try {
		const doc = activeDocument;
		const blob = new Blob([svgData], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const a = doc.createElement('a');
		a.href = url;
		a.download = fileName;
		doc.body.appendChild(a);
		a.click();
		doc.body.removeChild(a);
		URL.revokeObjectURL(url);
	} catch {
		new Notice(t('Failed to download SVG file.'));
	}
}

interface BadgeElements {
	badge: HTMLDivElement;
	preview: HTMLDivElement;
}

function createBadgeWithPreview(
	parent: HTMLElement,
	variant: 'light' | 'dark',
	svgData?: string,
	iconName?: string
): BadgeElements {
	const badge = parent.createDiv({
		cls: `external-links-icon-badge external-links-icon-badge-${variant}`
	});
	const preview = badge.createDiv({ cls: 'external-links-icon-badge-icon' });

	if (svgData) {
		try {
			const prepared = prepareSvgForSettings(svgData, preview);
			const img = badge.ownerDocument.createElement('img');
			img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
			img.alt = variant === 'light' ? 'current' : 'current dark';
			preview.appendChild(img);
		} catch { preview.textContent = '🔧'; }

		const dlCorner = badge.createDiv({ cls: 'external-links-icon-badge-dl' });
		dlCorner.title = t('Download icon');
		const dlIcon = dlCorner.createDiv({ cls: 'external-links-icon-badge-dl-icon' });
		setIcon(dlIcon, 'lucide-download');
		dlCorner.onclick = () => downloadSvg(svgData, `${iconName || 'icon'}-${variant}.svg`);
	} else {
		badge.classList.add('external-links-icon-badge-empty');
	}

	return { badge, preview };
}
