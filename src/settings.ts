import { PluginSettingTab, Setting, App, Notice, setIcon } from 'obsidian';
import type ExternalLinksIcon from './main';
import type { IconItem, LinkType } from './types';
import { ICON_CATEGORIES, DEFAULT_SETTINGS } from './constants';
import { t } from './lang/helper';

function getIconDisplayName(icon: IconItem): string {
	const isBuiltin = Boolean((DEFAULT_SETTINGS.icons || {})[icon.id]);
	if (isBuiltin) {
		const key = `icon-name.${icon.id}` as keyof typeof import('./lang/locale/en').default;
		return t(key);
	}
	return icon.name;
}
import { preferDarkThemeFromDocument, prepareSvgForSettings, getSvgSourceForTheme } from './svg';
import { clearIconCache } from './utils';
import { ConfirmModal, EditIconModal, NewIconModal } from './ui';

function renderIconImage(
	container: HTMLElement,
	icon: IconItem,
	linkType: string,
	isBuiltin: boolean
): void {
	const doc = container.ownerDocument;
	const hasDual = !!(icon.svgData && icon.themeDarkSvgData);
	const builtinStr = isBuiltin ? 'true' : 'false';
	try {
		if (hasDual) {
			const lightPrepared = prepareSvgForSettings(icon.svgData || '', container);
			const darkPrepared = prepareSvgForSettings(icon.themeDarkSvgData || '', container);

			const imgLight = doc.createElement('img');
			imgLight.dataset.iconId = icon.id || '';
			imgLight.dataset.iconLinkType = linkType;
			imgLight.dataset.builtin = builtinStr;
			imgLight.dataset.iconVariant = 'light';
			imgLight.dataset.dualVariant = 'true';
			imgLight.src = `data:image/svg+xml;utf8,${encodeURIComponent(lightPrepared)}`;
			imgLight.alt = getIconDisplayName(icon);

			const imgDark = doc.createElement('img');
			imgDark.dataset.iconId = icon.id || '';
			imgDark.dataset.iconLinkType = linkType;
			imgDark.dataset.builtin = builtinStr;
			imgDark.dataset.iconVariant = 'dark';
			imgDark.dataset.dualVariant = 'true';
			imgDark.src = `data:image/svg+xml;utf8,${encodeURIComponent(darkPrepared)}`;
			imgDark.alt = getIconDisplayName(icon);

			container.appendChild(imgLight);
			container.appendChild(imgDark);
		} else {
			const preferDark = preferDarkThemeFromDocument();
			const svgSource = getSvgSourceForTheme(icon, preferDark);
			const prepared = prepareSvgForSettings(svgSource, container);
			const img = doc.createElement('img');
			img.dataset.iconId = icon.id || '';
			img.dataset.iconLinkType = linkType;
			img.dataset.builtin = builtinStr;
			img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
			img.alt = getIconDisplayName(icon);
			container.appendChild(img);
		}
	} catch (e) {
		console.warn('Failed to render icon preview', e);
		container.textContent = '🔗';
	}
}

export class ExternalLinksIconSettingTab extends PluginSettingTab {
	plugin: ExternalLinksIcon;
	private debounceTimers: Map<string, number> = new Map();

	// Theme change detection
	private themeMediaQuery: MediaQueryList | null = null;
	private mqHandler: EventListener | null = null;
	private bodyObserver: MutationObserver | null = null;
	private themeChangeDebounce: number = 0;

	constructor(app: App, plugin: ExternalLinksIcon) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('Language'))
			.setDesc(t('Setting page language'))
			.addDropdown(dropdown => {
				dropdown
					.addOption('auto', t('Adapt to Obsidian setting (Auto)'))
					.addOption('en', t('English'))
					.addOption('zh', t('Chinese (Simplified)'))
					.setValue(this.plugin.settings.language || 'auto')
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
						this.plugin.applyLanguage();
						this.display();
					});
			});

		this.createAddIconButton(containerEl);
		containerEl.createEl('div', { text: t('Add website or URL scheme icon. The icon name must be unique.') });
		this.displayWebsiteSection(containerEl);
		this.displayURLSchemeSection(containerEl);

		// Ensure theme-change listeners are active so previews update when theme toggles
		this.ensureThemeListeners();
		// Update previews to current theme state (keeps UI consistent after non-render theme switches)
		try { this.updatePreviewIcons(preferDarkThemeFromDocument()); } catch { /* ignore */ }
	}

	private displayWebsiteSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t('Website')).setHeading();
		containerEl.createEl('div', { text: t('Website icons are matched by domain. When adding a website-type icon, provide a unique name and the domain (e.g. "example.com").') });

		const builtInWrap = containerEl.createDiv({ cls: 'website-builtins' });
		const builtinsDetails = builtInWrap.createEl('details', { cls: 'builtin-list' });
		builtinsDetails.createEl('summary', { text: t('Built-in') });
		const builtinRow = builtinsDetails.createDiv({ cls: 'builtin-row' });

		const builtinIconsMap: Record<string, IconItem> = Object.assign({}, DEFAULT_SETTINGS.icons || {});
		const builtinIcons = Object.values(builtinIconsMap)
			.sort((a: IconItem, b: IconItem) => (a.order || 0) - (b.order || 0))
			.filter((ic: IconItem) => ic.linkType === 'url');
		builtinIcons.forEach((icon: IconItem) => {
			const box = builtinRow.createDiv({ cls: 'website-item' });

			const iconEl = box.createDiv({ cls: 'item-icon' });
			renderIconImage(iconEl, icon, 'url', true);

			box.createSpan({ text: getIconDisplayName(icon) });
		});

		const customIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'url');
		if (customIcons.length > 0) {
			const customWrap = containerEl.createDiv({ cls: 'website-custom' });
			new Setting(customWrap).setName(t('Custom')).setHeading();
			customIcons.forEach((icon) => {
				this.createIconSetting(customWrap, icon);
			});
		} else {
			containerEl.createEl('div', { text: t('No custom website icons yet.') });
		}
	}

	private displayURLSchemeSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t('URL scheme')).setHeading();
		containerEl.createEl('div', { text: t('URL scheme icons are matched by a scheme identifier. When adding a scheme-type icon, provide a unique name and the scheme identifier (e.g. "webcal").') });

		const builtInWrap = containerEl.createDiv({ cls: 'scheme-builtins' });
		const builtinsDetails = builtInWrap.createEl('details', { cls: 'builtin-list' });
		builtinsDetails.createEl('summary', { text: t('Built-in') });
		const builtinRow = builtinsDetails.createDiv({ cls: 'builtin-row' });

		(ICON_CATEGORIES.URL_SCHEME || []).forEach((key: string) => {
			const icon = (DEFAULT_SETTINGS.icons || {})[key] || (this.plugin.settings.icons || {})[key];
			if (icon) {
				const box = builtinRow.createDiv({ cls: 'scheme-item' });

				const iconEl = box.createDiv({ cls: 'item-icon' });
				renderIconImage(iconEl, icon, 'scheme', true);
				box.createSpan({ text: getIconDisplayName(icon) });
			}
		});

		const customSchemeIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'scheme');
		if (customSchemeIcons.length > 0) {
			const customWrap = containerEl.createDiv({ cls: 'scheme-custom' });
			new Setting(customWrap).setName(t('Custom')).setHeading();
			customSchemeIcons.forEach((icon) => {
				this.createIconSetting(customWrap, icon);
			});
		} else {
			containerEl.createEl('div', { text: t('No custom URL scheme icons yet.') });
		}
	}

	/**
	 * 创建添加图标按钮
	 */
	private createAddIconButton(containerEl: HTMLElement): void {
		const s = new Setting(containerEl).setName(t('Add new icon')).setHeading();
		const btnContainer = s.controlEl.createDiv({ cls: 'add-buttons' });
		const doc = btnContainer.ownerDocument;

		const addWebsiteBtn = doc.createElement('button');
		addWebsiteBtn.textContent = t('Add website');
		addWebsiteBtn.onclick = () => {
			const modal = new NewIconModal(this.app, (data) => this.addIconWithData(data), 'url');
			modal.open();
		};
		btnContainer.appendChild(addWebsiteBtn);

		const addSchemeBtn = doc.createElement('button');
		addSchemeBtn.textContent = t('Add URL scheme');
		addSchemeBtn.onclick = () => {
			const modal = new NewIconModal(this.app, (data) => this.addIconWithData(data), 'scheme');
			modal.open();
		};
		btnContainer.appendChild(addSchemeBtn);
	}

	/**
	 * 根据弹窗数据添加新图标（带校验）
	 */
	private async addIconWithData(data: { linkType: LinkType; name: string; target: string; svgData?: string; themeDarkSvgData?: string }) {
		const { linkType, name, target, svgData, themeDarkSvgData } = data;
		const id = name;
		const customIcons = this.plugin.settings.customIcons || {};
		if (customIcons[id]) {
			new Notice(`Icon name "${name}" already exists. Please choose a unique name.`);
			return;
		}

		let normalized = target.trim();
		if (linkType === 'url') {
			normalized = normalized.replace(/^https?:\/\//i, '').replace(/\/$/, '');
		}

		const maxOrder = Object.values(customIcons).reduce((max, ic: IconItem) => Math.max(max, ic.order || 0), -1);

		const newIcon: IconItem = {
			id,
			name,
			svgData: (svgData && svgData.trim().length > 0) ? svgData : this.plugin.getDefaultSvgData(),
			order: maxOrder + 1,
			linkType,
			target: normalized
		};

		if (themeDarkSvgData && themeDarkSvgData.trim().length > 0) {
			newIcon.themeDarkSvgData = themeDarkSvgData;
		}

		customIcons[id] = newIcon;

		this.plugin.settings.customIcons = customIcons;
		await this.plugin.saveSettings();
		this.display();
	}

	/**
	 * Setup listeners to detect theme changes and refresh Settings previews.
	 */
	private ensureThemeListeners(): void {
		// Disconnect any existing listeners first to avoid duplicates
		this.disconnectThemeListeners();

		// Listen to prefers-color-scheme changes
		try {
			this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			const mq = this.themeMediaQuery;
			this.mqHandler = () => this.scheduleThemeRefresh();
			if (mq.addEventListener) mq.addEventListener('change', this.mqHandler);
		} catch {
				// ignore
			}

		// Observe body class changes (Obsidian toggles theme classes on <body>)
		try {
			this.bodyObserver = new MutationObserver((mutations) => {
				for (const m of mutations) {
					if (m.type === 'attributes' && m.attributeName === 'class') {
						this.scheduleThemeRefresh();
						break;
					}
				}
			});
			const doc = this.containerEl.ownerDocument;
			if (doc?.body) this.bodyObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
		} catch {
			// ignore
		}
	}

	/**
	 * Debounced refresh scheduler to avoid rapid re-renders
	 */
	private scheduleThemeRefresh(): void {
		if (this.themeChangeDebounce) {
			window.clearTimeout(this.themeChangeDebounce);
		}
		this.themeChangeDebounce = window.setTimeout(() => {
			this.themeChangeDebounce = 0;
			// Update only preview images so they reflect the current theme without a full re-render
			try {
				const preferDark = preferDarkThemeFromDocument();
				this.updatePreviewIcons(preferDark);
			} catch { /* ignore */ }
		}, 100);
	}

	/**
	 * Disconnect any previously registered listeners
	 */
	private disconnectThemeListeners(): void {
		if (this.themeMediaQuery) {
			try {
				const mq = this.themeMediaQuery;
				if (this.mqHandler) {
					if (mq.removeEventListener) mq.removeEventListener('change', this.mqHandler);
				}
			} catch { /* ignore */ }
			this.themeMediaQuery = null;
			this.mqHandler = null;
		}
		if (this.bodyObserver) {
			try { this.bodyObserver.disconnect(); } catch { /* ignore */ }
			this.bodyObserver = null;
		}
		if (this.themeChangeDebounce) {
			window.clearTimeout(this.themeChangeDebounce);
			this.themeChangeDebounce = 0;
		}
	}

	/**
	 * Update preview icons in-place according to theme preference.
	 */
	private updatePreviewIcons(preferDark?: boolean): void {
		try {
			if (typeof preferDark === 'undefined') preferDark = preferDarkThemeFromDocument();
			const imgs = Array.from(this.containerEl.querySelectorAll<HTMLImageElement>('img[data-icon-id]'));
			imgs.forEach(img => {
				if (img.dataset.dualVariant === 'true') return;
				const id = img.dataset.iconId || '';
				const isBuiltin = img.dataset.builtin === 'true';
				let icon: IconItem | undefined;
				if (isBuiltin) icon = (DEFAULT_SETTINGS.icons || {})[id];
				if (!icon) icon = (this.plugin.settings.customIcons || {})[id];
				// fallback to defaults if still missing
				if (!icon) icon = (DEFAULT_SETTINGS.icons || {})[id];
				if (!icon) return;
				let svgSource = '';
				if (preferDark) svgSource = icon.themeDarkSvgData || icon.svgData || '';
				else svgSource = icon.svgData || icon.themeDarkSvgData || '';
				if (!svgSource) return;
				const container = img.parentElement || img;
				const prepared = prepareSvgForSettings(svgSource, container);
				img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
			});
		} catch {
			// ignore errors while updating previews
		}
	}

	/**
	 * 获取按顺序排列的自定义图标
	 */
	private getSortedCustomIcons(): IconItem[] {
		return Object.values(this.plugin.settings.customIcons || {})
			.sort((a: IconItem, b: IconItem) => (a.order || 0) - (b.order || 0));
	}

	/**
	 * 创建单个图标设置项
	 */
	private createIconSetting(containerEl: HTMLElement, icon: IconItem): void {
		const settingItem = new Setting(containerEl).setClass('icon-setting-item');

		// SVG 预览和名称
		this.addIconPreview(settingItem, icon);
		
		// 图标名称输入
		this.addNameInput(settingItem, icon);
		
		// 文件上传按钮
		this.addUploadButton(settingItem, icon);
		
		// 移动和删除按钮
		this.addControlButtons(settingItem, icon);
	}

	/**
	 * 添加图标预览
	 */
	private addIconPreview(settingItem: Setting, icon: IconItem): void {
		const previewContainer = settingItem.nameEl.createDiv({ cls: 'svg-preview-container' });

		const previewIcon = previewContainer.createDiv({ cls: 'external-links-icon-preview-div small' });

		const builtinOverride = (DEFAULT_SETTINGS.icons || {})[icon.id];
		const effectiveIcon = builtinOverride ? builtinOverride : icon;
		const isBuiltin = Boolean(builtinOverride);
		renderIconImage(previewIcon, effectiveIcon, icon.linkType || 'url', isBuiltin);

		previewContainer.createSpan({ text: getIconDisplayName(icon) });
	}

	/**
	 * 添加名称输入框
	 */
	private addNameInput(settingItem: Setting, icon: IconItem): void {
		if (icon.linkType === 'url') {
			// Website custom icons: editable target (domain) only
			settingItem.addText(text => {
				text.setPlaceholder(t('Example.com'))
					.setValue(icon.target || '')
					.onChange((value) => {
						this.debounceUpdateTarget(icon.id, value);
					});
			});
		} else {
			// Scheme custom icons: only editable scheme identifier (protocol).
			// Icon ID (name) is shown in the preview area and should not be editable here.
			settingItem.addText(text => {
				text.setPlaceholder(t('Scheme identifier'))
					.setValue(icon.target || '')
					.onChange((value) => {
						this.debounceUpdateTarget(icon.id, value);
					});
			});
		}
	}

	/**
	 * 防抖动更新 target（域名或 scheme）
	 */
	private debounceUpdateTarget(id: string, newTarget: string): void {
		const timerId = this.debounceTimers.get(`target-${id}`);
		if (timerId) {
			window.clearTimeout(timerId);
		}

		const newTimerId = window.setTimeout(() => {
			(async () => {
				const icons = this.plugin.settings.customIcons || {};
				if (icons[id]) {
					icons[id].target = newTarget.trim();
					await this.plugin.saveSettings();
					this.display();
				}
				this.debounceTimers.delete(`target-${id}`);
			})().catch(console.error);
		}, 500);
		this.debounceTimers.set(`target-${id}`, newTimerId);
	}

	/**
	 * 添加上传按钮
	 */
	private addUploadButton(settingItem: Setting, icon: IconItem): void {
		settingItem.addButton(button => {
			button.setIcon('lucide-pencil')
				.setTooltip(t('Edit icon'))
				.onClick(() => {
					const modal = new EditIconModal(this.app, icon, async (data) => {
						if (data.svgData) {
							icon.svgData = data.svgData;
						}
						if (data.themeDarkSvgData === null) {
							delete icon.themeDarkSvgData;
						} else if (data.themeDarkSvgData) {
							icon.themeDarkSvgData = data.themeDarkSvgData;
						}
						await this.plugin.saveSettings();
						this.display();
					});
					modal.open();
				});
		});
	}

	/**
	 * 添加控制按钮（上移、下移、删除）
	 */
	private addControlButtons(settingItem: Setting, icon: IconItem): void {
		// Compute ordering within the same linkType group so move buttons reflect group boundaries
		const allCustom = Object.values(this.plugin.settings.customIcons || {});
		const groupSorted = allCustom
			.filter(i => i.linkType === icon.linkType)
			.sort((a, b) => (a.order || 0) - (b.order || 0));
		const currentIndex = groupSorted.findIndex(i => i.id === icon.id);
		
		// Always render move up/down buttons but disable them when at edges within the same group
		const canMoveUp = currentIndex > 0;
		const canMoveDown = currentIndex >= 0 && currentIndex < groupSorted.length - 1;
		settingItem.addButton(button => button
			.setButtonText('↑')
			.setTooltip(t('Move up'))
			.setDisabled(!canMoveUp)
			.onClick(async () => {
				if (!canMoveUp) return;
				await this.moveIcon(icon, -1);
				this.display();
			}));

		settingItem.addButton(button => button
			.setButtonText('↓')
			.setTooltip(t('Move down'))
			.setDisabled(!canMoveDown)
			.onClick(async () => {
				if (!canMoveDown) return;
				await this.moveIcon(icon, 1);
				this.display();
			}));
		
		// 删除按钮
		settingItem.addButton(button => button
			.setIcon('lucide-trash-2')
			.setTooltip(t('Delete'))
			.setWarning()
			.onClick(async () => {
				const modal = new ConfirmModal(this.plugin.app, `${t('Are you sure you want to delete the icon')} "${getIconDisplayName(icon)}"?`);
				modal.open();
				const confirmed = await modal.result;
				if (confirmed) {
					delete this.plugin.settings.customIcons[icon.id];
					clearIconCache(icon.id);
					await this.plugin.saveSettings();
					this.display();
				}
			}));
	}

	private async moveIcon(icon: IconItem, direction: number): Promise<void> {
		const allCustom = Object.values(this.plugin.settings.customIcons || {});
		const group = allCustom.filter(i => i.linkType === icon.linkType).sort((a, b) => (a.order || 0) - (b.order || 0));
		const currentIndex = group.findIndex(i => i.id === icon.id);
		const targetIndex = currentIndex + direction;
		if (currentIndex === -1 || targetIndex < 0 || targetIndex >= group.length) return;

		const arr = group.slice();
		const [moved] = arr.splice(currentIndex, 1);
		arr.splice(targetIndex, 0, moved);

		// reassign orders within this group
		arr.forEach((it, idx) => { it.order = idx; });

		// merge back: preserve other custom icons (from other linkType) and update this group's items
		const newMap: Record<string, IconItem> = {};
		Object.values(this.plugin.settings.customIcons || {}).forEach(it => {
			if (it.linkType !== icon.linkType) {
				newMap[it.id] = it;
			}
		});
		arr.forEach(it => { newMap[it.id] = it; });

		this.plugin.settings.customIcons = newMap;

		// Normalize orders across all custom icons to ensure stable global ordering
		const combined = Object.values(newMap);
		const linkOrder: LinkType[] = ['url', 'scheme'];
		let idx2 = 0;
		linkOrder.forEach(lt => {
			combined
				.filter(i => i.linkType === lt)
				.sort((a, b) => (a.order || 0) - (b.order || 0))
				.forEach(it => {
					it.order = idx2++;
				});
		});

		// rebuild map with normalized orders
		const normalizedMap: Record<string, IconItem> = {};
		combined.forEach(it => { normalizedMap[it.id] = it; });
		this.plugin.settings.customIcons = normalizedMap;
		await this.plugin.saveSettings();

	}

	onClose(): void {
		// Cleanup theme listeners when Settings tab is closed
		this.disconnectThemeListeners();
		try { this.containerEl.empty(); } catch { /* ignore */ }
	}}
