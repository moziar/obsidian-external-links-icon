import { App, Modal, Notice, Platform, Setting, setIcon } from 'obsidian';
import type { IconItem, LinkType } from './types';
import { t } from './lang/helper';
import { prepareSvgForSettings } from './svg';
import { encodeSvgData } from './utils';

export class ConfirmModal extends Modal {
	private _message: string;
	private _resolver: (value: boolean) => void = () => {};
	private resolved = false;
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
		cancelBtn.onclick = () => { if (!this.resolved) { this.resolved = true; this._resolver(false); } this.close(); };
		okBtn.onclick = () => { if (!this.resolved) { this.resolved = true; this._resolver(true); } this.close(); };
	}

	onClose(): void {
		if (!this.resolved) { this.resolved = true; this._resolver(false); }
		const { contentEl } = this;
		contentEl.empty();
	}
}

export interface NewIconData {
	linkType: LinkType;
	name: string;
	target: string[];
	svgData?: string;
	themeDarkSvgData?: string;
}

interface DomainListEditorOptions {
	container: HTMLElement;
	initialDomains: string[];
	placeholder?: string;
}

function createDomainListEditor(options: DomainListEditorOptions): { getDomains: () => string[] } {
	const { container, initialDomains, placeholder } = options;
	const domains: string[] = [...initialDomains];

	const inputRow = container.createDiv({ cls: 'external-links-icon-domain-input-row' });
	const targetInput = inputRow.createEl('input', { cls: 'external-links-icon-domain-input' });
	targetInput.type = 'text';
	if (placeholder) targetInput.placeholder = placeholder;
	const addBtn = inputRow.createEl('button', { cls: 'external-links-icon-domain-add-btn clickable-icon' });
	setIcon(addBtn, 'lucide-plus');

	const domainListEl = container.createEl('ul', { cls: 'external-links-icon-domain-list' });

	const renderDomains = () => {
		domainListEl.empty();
		domains.forEach((domain, idx) => {
			const li = domainListEl.createEl('li', { cls: 'external-links-icon-domain-item' });
			li.createSpan({ text: domain });
			const removeBtn = li.createEl('button', { cls: 'external-links-icon-domain-item-remove clickable-icon' });
			setIcon(removeBtn, 'lucide-x');
			removeBtn.onclick = () => {
			domains.splice(idx, 1);
			renderDomains();
		};
		});
	};

	const addDomain = () => {
		const val = targetInput.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
		if (!val) return;
		if (domains.includes(val)) {
			new Notice(t('Domain already added'));
			return;
		}
		domains.push(val);
		targetInput.value = '';
		renderDomains();
	};

	addBtn.onclick = addDomain;
	targetInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			addDomain();
		}
	});

	renderDomains();

	return {
		getDomains: () => {
			// Pick up any text still in the input that hasn't been added
			const remaining = targetInput.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
			if (remaining && !domains.includes(remaining)) {
				domains.push(remaining);
			}
			return [...domains];
		}
	};
}

interface IconUploadSectionOptions {
	container: HTMLElement;
	label: string;
	initialSvgData?: string;
	isDark?: boolean;
	iconName?: string;
	hiddenInputs?: HTMLInputElement[];
	onRemove?: (removed: boolean) => void;
}

function createIconUploadSection(options: IconUploadSectionOptions): {
	getSvgData: () => string | undefined;
	setSvgData: (svgData: string | undefined) => void;
	controlRow: HTMLDivElement;
} {
	const { container, label, initialSvgData, isDark, iconName, hiddenInputs, onRemove } = options;
	const doc = container.ownerDocument;
	const variant = isDark ? 'dark' : 'light';
	const isDesktop = !Platform.isMobile;

	let newSvgData: string | undefined;
	let removeState = false;

	const section = container.createDiv({ cls: 'external-links-icon-upload-section' });
	section.createEl('div', { text: label, cls: 'external-links-icon-upload-label' });

	const body = section.createDiv({ cls: 'external-links-icon-section-body' });

	const { badge, preview } = createBadgeWithPreview(body, variant, initialSvgData, iconName);

	const controls = body.createDiv({ cls: 'external-links-icon-controls-col' });
	const row = controls.createDiv({ cls: 'external-links-icon-control-row' });
	const uploadBtn = row.createEl('button', { cls: 'external-links-icon-btn' });
	setIcon(uploadBtn, 'lucide-upload');
	uploadBtn.appendText(` ${initialSvgData ? t('Update') : t('Upload icon')}`);

	let removeBtn: HTMLButtonElement | undefined;
	let removeIndicator: HTMLSpanElement | undefined;

	if (onRemove && initialSvgData) {
		removeBtn = row.createEl('button', { text: t('Remove'), cls: 'external-links-icon-btn external-links-icon-btn-danger' });
		removeIndicator = row.createSpan({ cls: 'external-links-icon-remove-indicator' });
		removeBtn.onclick = () => {
			removeState = !removeState;
			if (removeIndicator) removeIndicator.textContent = removeState ? ` ✓ ${t('Will be removed on save')}` : '';
			removeBtn?.classList.toggle('is-active', removeState);
			if (isDesktop) {
				uploadBtn.style.display = removeState ? 'none' : '';
			}
			onRemove(removeState);
		};
	}

	const clearRemoveState = () => {
		removeState = false;
		if (removeBtn) removeBtn.classList.remove('is-active');
		if (removeIndicator) removeIndicator.textContent = '';
		onRemove?.(false);
	};

	const input = createFileInput(doc, (content) => {
		newSvgData = content;
		clearRemoveState();
		badge.classList.remove('external-links-icon-badge-empty');
		renderPreview(doc, preview, content, 'uploaded');
	});
	if (hiddenInputs) hiddenInputs.push(input);
	doc.body.appendChild(input);
	uploadBtn.onclick = () => input.click();

	return {
		getSvgData: () => newSvgData,
		setSvgData: (svgData: string | undefined) => {
			if (!svgData) return;
			newSvgData = svgData;
			clearRemoveState();
			badge.classList.remove('external-links-icon-badge-empty');
			renderPreview(doc, preview, svgData, 'copied');
		},
		controlRow: row,
	};
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

		contentEl.createEl('h3', { text: t('Add new icon') });

		const nameInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		nameInput.placeholder = t('Icon name (unique)');
		nameInput.type = 'text';

		const isUrl = this._defaultLinkType === 'url';

		// For URL type: multi-value domain input; for Scheme: single input
		let domainEditor: { getDomains: () => string[] } | undefined;
		let targetInput: HTMLInputElement | undefined;

		if (isUrl) {
			domainEditor = createDomainListEditor({
				container: contentEl,
				initialDomains: [],
				placeholder: t('Domain (e.g. baike.baidu.com or baidu.com/about)'),
			});
		} else {
			targetInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
			targetInput.type = 'text';
			targetInput.placeholder = t('Scheme identifier (e.g. zotero)');
		}

		const isDesktop = !Platform.isMobile;
		const iconContainer = contentEl.createDiv({ cls: isDesktop ? 'external-links-icon-upload-columns' : '' });

		const lightSection = createIconUploadSection({
			container: iconContainer,
			label: t('Default icon (light mode)'),
			isDark: false,
			hiddenInputs: this.hiddenInputs,
		});

		const darkSection = createIconUploadSection({
			container: iconContainer,
			label: t('Dark mode icon (optional)'),
			isDark: true,
			hiddenInputs: this.hiddenInputs,
		});

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: t('Cancel') });
		cancelBtn.onclick = () => { this.close(); };
		const addBtn = buttonContainer.createEl('button', { text: t('Add icon') });
		addBtn.onclick = () => {
			const name = nameInput.value.trim();
			if (!name) { new Notice(t('Name is required')); return; }

			let target: string[];
			if (isUrl) {
				target = domainEditor!.getDomains();
				if (target.length === 0) { new Notice(t('Target is required')); return; }
			} else {
				target = [targetInput!.value.trim()];
				if (!target[0]) { new Notice(t('Target is required')); return; }
			}

			const uploadedSvgData = lightSection.getSvgData();
			if (!uploadedSvgData) {
				new Notice(t('Default icon is required'));
				return;
			}
			const uploadedDarkSvgData = darkSection.getSvgData();
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
	private onSave: (data: { svgData?: string; themeDarkSvgData?: string | null; target?: string[] }) => void | Promise<void>;
	private hiddenInputs: HTMLInputElement[] = [];

	constructor(
		app: App,
		icon: IconItem,
		onSave: (data: { svgData?: string; themeDarkSvgData?: string | null; target?: string[] }) => void | Promise<void>,
	) {
		super(app);
		this.icon = icon;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: `${t('Edit icon')}: ${this.icon.name}` });

		// Domain editing for URL type
		let domainEditor: { getDomains: () => string[] } | undefined;
		let targetInput: HTMLInputElement | undefined;

		if (this.icon.linkType === 'url') {
			domainEditor = createDomainListEditor({
				container: contentEl,
				initialDomains: this.icon.target.filter(Boolean),
				placeholder: t('Domain (e.g. baike.baidu.com or baidu.com/about)'),
			});
		} else {
			// Scheme type: single target input
			new Setting(contentEl)
				.setName(t('Scheme identifier'))
				.addText(text => {
					targetInput = text.inputEl;
					text.setPlaceholder(t('Scheme identifier (e.g. zotero)'));
					const targetStr = this.icon.target[0] || '';
					text.setValue(targetStr);
				});
		}

		let removeDark = false;

		const isDesktop = !Platform.isMobile;
		const iconContainer = contentEl.createDiv({ cls: isDesktop ? 'external-links-icon-upload-columns' : '' });

		const lightSection = createIconUploadSection({
			container: iconContainer,
			label: t('Default icon (light mode)'),
			initialSvgData: this.icon.svgData,
			isDark: false,
			iconName: this.icon.name,
			hiddenInputs: this.hiddenInputs,
		});

		// Copy to dark button (only when light icon exists and no dark icon)
		if (this.icon.svgData && !this.icon.themeDarkSvgData) {
			const copyBtnCls = isDesktop ? 'clickable-icon' : 'external-links-icon-btn external-links-icon-btn-copy';
			const copyBtn = lightSection.controlRow.createEl('button', { cls: copyBtnCls });
			if (isDesktop) {
				setIcon(copyBtn, 'lucide-square-arrow-right');
				copyBtn.setAttribute('aria-label', t('Copy to dark'));
				copyBtn.classList.add('external-links-icon-btn-copy');
			} else {
				setIcon(copyBtn, 'lucide-copy');
				copyBtn.appendText(` ${t('Copy to dark')}`);
			}
			copyBtn.onclick = () => {
				darkSection.setSvgData(lightSection.getSvgData() || this.icon.svgData);
				new Notice(t('Copied to dark'));
			};
		}

		const darkSection = createIconUploadSection({
			container: iconContainer,
			label: t('Dark mode icon (optional)'),
			initialSvgData: this.icon.themeDarkSvgData,
			isDark: true,
			iconName: this.icon.name,
			hiddenInputs: this.hiddenInputs,
			onRemove: (removed) => { removeDark = removed; },
		});

		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });
		const cancelBtn = buttonContainer.createEl('button', { text: t('Cancel') });
		cancelBtn.onclick = () => { this.close(); };
		const saveBtn = buttonContainer.createEl('button', { text: t('Save'), cls: 'external-links-icon-add-btn' });
		saveBtn.onclick = () => {
			const newSvgData = lightSection.getSvgData();
			const newDarkSvgData = darkSection.getSvgData();
			if (newDarkSvgData && !this.icon.svgData && !newSvgData) {
				new Notice(t('Default icon is required when uploading a dark mode icon'));
				return;
			}
			const data: { svgData?: string; themeDarkSvgData?: string | null; target?: string[] } = {};
			if (newSvgData) data.svgData = newSvgData;
			if (removeDark) {
				data.themeDarkSvgData = null;
			} else if (newDarkSvgData) {
				data.themeDarkSvgData = newDarkSvgData;
			}

			// Target editing
			if (this.icon.linkType === 'url') {
				const domainList = domainEditor!.getDomains();
				if (domainList.length > 0) {
					const newTarget = [...domainList];
					// Only include target if it changed
					const oldTargets = this.icon.target.filter(Boolean);
					if (JSON.stringify(oldTargets) !== JSON.stringify(domainList)) {
						data.target = newTarget;
					}
				} else {
					data.target = [];
				}
			} else {
				// Scheme type
				const newSchemeTarget = targetInput!.value.trim();
				if (newSchemeTarget !== (this.icon.target[0] || '')) {
					data.target = [newSchemeTarget];
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
		img.src = encodeSvgData(content);
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
			img.src = encodeSvgData(prepared);
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
