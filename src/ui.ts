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
		targetInput.type = 'text';

		const defaultType = this._defaultLinkType || 'url';
		targetInput.placeholder = defaultType === 'url' ? t('Domain (e.g. baidu.com or https://baidu.com)') : t('Scheme identifier (e.g. zotero)');

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
				renderPreview(doc, darkPreview, newDarkSvgData!, 'copied');
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
			removeBtn!.onclick = () => {
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

function downloadSvg(svgData: string, fileName: string): void {
	try {
		const doc = activeDocument;
		const blob = new Blob([svgData], {type: 'image/svg+xml'});
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
