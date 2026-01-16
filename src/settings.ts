import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import type ExternalLinksIcon from './main';
import type { IconItem, LinkType } from './types';
import { ICON_CATEGORIES, DEFAULT_SETTINGS, CSS_SELECTORS } from './constants';
import { preferDarkThemeFromDocument } from './svg';
import { prepareSvgForSettings, sanitizeSvg } from './svg';
import { ConfirmModal, NewIconModal } from './ui';

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

		this.createAddIconButton(containerEl);
		containerEl.createEl('div', { text: 'Add website or URL scheme icon. The icon name must be unique.' });
		this.displayWebsiteSection(containerEl);
		this.displayURLSchemeSection(containerEl);

		// Ensure theme-change listeners are active so previews update when theme toggles
		this.ensureThemeListeners();
		// Update previews to current theme state (keeps UI consistent after non-render theme switches)
		try { this.updatePreviewIcons(preferDarkThemeFromDocument()); } catch (e) { /* ignore */ }
	}

	private displayWebsiteSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Website').setHeading();
		containerEl.createEl('div', { text: 'Website icons are matched by domain. When adding a website-type icon, provide a unique name and the domain (e.g. "baidu.com").' });

		const builtInWrap = containerEl.createDiv({ cls: 'website-builtins' });
		const builtinsDetails = builtInWrap.createEl('details', { cls: 'builtin-list' });
		builtinsDetails.createEl('summary', { text: 'Built-in' });
		const builtinRow = builtinsDetails.createDiv({ cls: 'builtin-row' });

		const builtinIconsMap: Record<string, IconItem> = Object.assign({}, DEFAULT_SETTINGS.icons || {});
		const builtinIcons = Object.values(builtinIconsMap)
			.sort((a: IconItem, b: IconItem) => (a.order || 0) - (b.order || 0))
			.filter((ic: IconItem) => ic.linkType === 'url');
		builtinIcons.forEach((icon: IconItem) => {
			const box = builtinRow.createDiv({ cls: 'website-item' });

			const iconEl = box.createDiv({ cls: 'item-icon' });
			try {
				const hasDual = !!(icon.svgData && icon.themeDarkSvgData);
				if (hasDual) {
					const lightPrepared = prepareSvgForSettings(icon.svgData || '', iconEl);
					const darkPrepared = prepareSvgForSettings(icon.themeDarkSvgData || '', iconEl);

					const imgLight = document.createElement('img');
					imgLight.dataset.iconName = icon.name || '';
					imgLight.dataset.iconLinkType = 'url';
					imgLight.dataset.builtin = 'true';
					imgLight.dataset.iconVariant = 'light';
					imgLight.dataset.dualVariant = 'true';
					imgLight.src = `data:image/svg+xml;utf8,${encodeURIComponent(lightPrepared)}`;
					imgLight.alt = icon.name || '';

					const imgDark = document.createElement('img');
					imgDark.dataset.iconName = icon.name || '';
					imgDark.dataset.iconLinkType = 'url';
					imgDark.dataset.builtin = 'true';
					imgDark.dataset.iconVariant = 'dark';
					imgDark.dataset.dualVariant = 'true';
					imgDark.src = `data:image/svg+xml;utf8,${encodeURIComponent(darkPrepared)}`;
					imgDark.alt = icon.name || '';

					iconEl.appendChild(imgLight);
					iconEl.appendChild(imgDark);
				} else {
					const preferDark = preferDarkThemeFromDocument();
					let svgSource: string;
					if (!preferDark) {
						svgSource = icon.svgData || icon.themeDarkSvgData || '';
					} else {
						svgSource = icon.themeDarkSvgData || icon.svgData || '';
					}
					const img = document.createElement('img');
					img.dataset.iconName = icon.name || '';
					img.dataset.iconLinkType = 'url';
					img.dataset.builtin = 'true';
					const prepared = prepareSvgForSettings(svgSource, iconEl);
					img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
					img.alt = icon.name || '';
					iconEl.appendChild(img);
				}
			} catch (e) {
				console.warn('Failed to render builtin website preview', e);
				iconEl.textContent = '🔗';
			}

			box.createSpan({ text: icon.name });
		});

		const customIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'url');
		if (customIcons.length > 0) {
			const customWrap = containerEl.createDiv({ cls: 'website-custom' });
			new Setting(customWrap).setName('Custom').setHeading();
			customIcons.forEach((icon, idx) => {
				this.createIconSetting(customWrap, icon, idx);
			});
		} else {
			containerEl.createEl('div', { text: 'No custom website icons yet.' });
		}
	}

	private displayURLSchemeSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('URL scheme').setHeading();
		containerEl.createEl('div', { text: 'Url scheme icons are matched by a scheme identifier. When adding a scheme-type icon, provide a unique name and the scheme identifier (e.g. zotero).' });

		const builtInWrap = containerEl.createDiv({ cls: 'scheme-builtins' });
		const builtinsDetails = builtInWrap.createEl('details', { cls: 'builtin-list' });
		builtinsDetails.createEl('summary', { text: 'Built-in' });
		const builtinRow = builtinsDetails.createDiv({ cls: 'builtin-row' });

		(ICON_CATEGORIES.URL_SCHEME || []).forEach((key: string) => {
			const icon = (DEFAULT_SETTINGS.icons || {})[key] || (this.plugin.settings.icons || {})[key];
			if (icon) {
				const box = builtinRow.createDiv({ cls: 'scheme-item' });

				const iconEl = box.createDiv({ cls: 'item-icon' });
				try {
					const hasDual = !!(icon.svgData && icon.themeDarkSvgData);
					if (hasDual) {
						const lightPrepared = prepareSvgForSettings(icon.svgData || '', iconEl);
						const darkPrepared = prepareSvgForSettings(icon.themeDarkSvgData || '', iconEl);

						const imgLight = document.createElement('img');
						imgLight.dataset.iconName = icon.name || '';
						imgLight.dataset.iconLinkType = 'scheme';
						imgLight.dataset.builtin = 'true';
						imgLight.dataset.iconVariant = 'light';
						imgLight.dataset.dualVariant = 'true';
						imgLight.src = `data:image/svg+xml;utf8,${encodeURIComponent(lightPrepared)}`;
						imgLight.alt = icon.name || '';

						const imgDark = document.createElement('img');
						imgDark.dataset.iconName = icon.name || '';
						imgDark.dataset.iconLinkType = 'scheme';
						imgDark.dataset.builtin = 'true';
						imgDark.dataset.iconVariant = 'dark';
						imgDark.dataset.dualVariant = 'true';
						imgDark.src = `data:image/svg+xml;utf8,${encodeURIComponent(darkPrepared)}`;
						imgDark.alt = icon.name || '';

						iconEl.appendChild(imgLight);
						iconEl.appendChild(imgDark);
					} else {
						const preferDark = preferDarkThemeFromDocument();
						let svgSource: string;
						if (!preferDark) {
							svgSource = icon.svgData || icon.themeDarkSvgData || '';
						} else {
							svgSource = icon.themeDarkSvgData || icon.svgData || '';
						}
						const img = document.createElement('img');
						img.dataset.iconName = icon.name || '';
						img.dataset.iconLinkType = 'scheme';
						img.dataset.builtin = 'true';
						const prepared = prepareSvgForSettings(svgSource, iconEl);
						img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
						img.alt = icon.name || '';

						iconEl.appendChild(img);
					}
				} catch (e) {
					console.warn('Failed to render builtin scheme preview', e);
					iconEl.textContent = '🔗';
				}
				box.createSpan({ text: icon.name + (icon.target ? ` — ${icon.target}` : '') });
			}
		});

		const customSchemeIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'scheme');
		if (customSchemeIcons.length > 0) {
			const customWrap = containerEl.createDiv({ cls: 'scheme-custom' });
			new Setting(customWrap).setName('Custom').setHeading();
			customSchemeIcons.forEach((icon, idx) => {
				this.createIconSetting(customWrap, icon, idx);
			});
		} else {
			containerEl.createEl('div', { text: 'No custom URL scheme icons yet.' });
		}
	}

	/**
	 * 创建添加图标按钮
	 */
	private createAddIconButton(containerEl: HTMLElement): void {
		const s = new Setting(containerEl).setName('Add new icon').setHeading();
		const btnContainer = s.controlEl.createDiv({ cls: 'add-buttons' });

		const addWebsiteBtn = document.createElement('button');
		addWebsiteBtn.textContent = 'Add website';
		addWebsiteBtn.onclick = () => {
			const modal = new NewIconModal(this.app, (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => this.addIconWithData(data), 'url');
			modal.open();
		};
		btnContainer.appendChild(addWebsiteBtn);

		const addSchemeBtn = document.createElement('button');
		addSchemeBtn.textContent = 'Add URL scheme';
		addSchemeBtn.onclick = () => {
			const modal = new NewIconModal(this.app, (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => this.addIconWithData(data), 'scheme');
			modal.open();
		};
		btnContainer.appendChild(addSchemeBtn);
	}

	/**
	 * 根据弹窗数据添加新图标（带校验）
	 */
	private async addIconWithData(data: { linkType: LinkType; name: string; target: string; svgData?: string }) {
		const { linkType, name, target, svgData } = data;
		const customIcons = this.plugin.settings.customIcons || {};
		if (customIcons[name]) {
			new Notice(`Icon name "${name}" already exists. Please choose a unique name.`);
		}

		// 规范化 target：如果是 url，去掉协议和尾部斜杠
		let normalized = target.trim();
		if (linkType === 'url') {
			normalized = normalized.replace(/^https?:\/\//i, '').replace(/\/$/, '');
		}

		// 计算 order
		const maxOrder = Object.values(customIcons).reduce((max, ic: IconItem) => Math.max(max, ic.order || 0), -1);

		customIcons[name] = {
			name,
			svgData: (svgData && svgData.trim().length > 0) ? svgData : this.plugin.getDefaultSvgData(),
			order: maxOrder + 1,
			linkType,
			target: normalized
		};

		this.plugin.settings.customIcons = customIcons;
		await this.plugin.saveSettings();
		this.display();
	}

	/**
	 * 显示图标列表
	 */
	private displayIconList(containerEl: HTMLElement): void {
		// 清除旧的图标列表
		containerEl.querySelectorAll('.icon-setting-item').forEach(el => el.remove());

		// 显示自定义图标
		const sortedCustomIcons = this.getSortedCustomIcons();
		sortedCustomIcons.forEach((icon, index) => {
			this.createIconSetting(containerEl, icon, index);
		});
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
			else if (mq.addListener) mq.addListener(this.mqHandler);
		} catch (e) {
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
			if (document && document.body) {
				this.bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
			}
		} catch (e) {
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
			} catch (e) { /* ignore */ }
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
					else if (mq.removeListener) mq.removeListener(this.mqHandler);
				}
			} catch (e) { /* ignore */ }
			this.themeMediaQuery = null;
			this.mqHandler = null;
		}
		if (this.bodyObserver) {
			try { this.bodyObserver.disconnect(); } catch (e) { /* ignore */ }
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
			const imgs = Array.from(this.containerEl.querySelectorAll<HTMLImageElement>('img[data-icon-name]'));
			imgs.forEach(img => {
				if (img.dataset.dualVariant === 'true') return;
				const name = img.dataset.iconName || '';
				const linkType = (img.dataset.iconLinkType || 'url') as 'url' | 'scheme';
				const isBuiltin = img.dataset.builtin === 'true';
				let icon: IconItem | undefined;
				if (isBuiltin) icon = (DEFAULT_SETTINGS.icons || {})[name];
				if (!icon) icon = (this.plugin.settings.customIcons || {})[name];
				// fallback to defaults if still missing
				if (!icon) icon = (DEFAULT_SETTINGS.icons || {})[name];
				if (!icon) return;
				let svgSource = '';
				if (preferDark) svgSource = icon.themeDarkSvgData || icon.svgData || '';
				else svgSource = icon.svgData || icon.themeDarkSvgData || '';
				if (!svgSource) return;
				const container = img.parentElement || img;
				const prepared = prepareSvgForSettings(svgSource, container);
				img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
			});
		} catch (e) {
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
	private createIconSetting(containerEl: HTMLElement, icon: IconItem, index: number): void {
		const settingItem = new Setting(containerEl).setClass('icon-setting-item');

		// SVG 预览和名称
		this.addIconPreview(settingItem, icon);
		
		// 图标名称输入
		this.addNameInput(settingItem, icon);
		
		// 文件上传按钮
		this.addUploadButton(settingItem, icon);
		
		// 移动和删除按钮
		this.addControlButtons(settingItem, icon, index);
	}

	/**
	 * 添加图标预览
	 */
	private addIconPreview(settingItem: Setting, icon: IconItem): void {
		const previewContainer = settingItem.nameEl.createDiv({ cls: 'svg-preview-container' });

		const previewIcon = previewContainer.createDiv({ cls: 'external-links-icon-preview-div small' });

		// If this icon is a built-in, prefer the DEFAULT_SETTINGS version for Settings preview
		const builtinOverride = (DEFAULT_SETTINGS.icons || {})[icon.name];
		const effectiveIcon = builtinOverride ? builtinOverride : icon;
		try {
			const hasDual = !!(effectiveIcon.svgData && effectiveIcon.themeDarkSvgData);
			if (hasDual) {
				const lightPrepared = prepareSvgForSettings(effectiveIcon.svgData || '', previewIcon);
				const darkPrepared = prepareSvgForSettings(effectiveIcon.themeDarkSvgData || '', previewIcon);

				const imgLight = document.createElement('img');
				imgLight.dataset.iconName = icon.name || '';
				imgLight.dataset.iconLinkType = icon.linkType || 'url';
				imgLight.dataset.builtin = (builtinOverride ? 'true' : 'false');
				imgLight.dataset.iconVariant = 'light';
				imgLight.dataset.dualVariant = 'true';
				imgLight.src = `data:image/svg+xml;utf8,${encodeURIComponent(lightPrepared)}`;
				imgLight.alt = icon.name || '';

				const imgDark = document.createElement('img');
				imgDark.dataset.iconName = icon.name || '';
				imgDark.dataset.iconLinkType = icon.linkType || 'url';
				imgDark.dataset.builtin = (builtinOverride ? 'true' : 'false');
				imgDark.dataset.iconVariant = 'dark';
				imgDark.dataset.dualVariant = 'true';
				imgDark.src = `data:image/svg+xml;utf8,${encodeURIComponent(darkPrepared)}`;
				imgDark.alt = icon.name || '';

				previewIcon.appendChild(imgLight);
				previewIcon.appendChild(imgDark);
			} else {
				const preferDark = preferDarkThemeFromDocument();
				let svgToRender: string;
				if (!preferDark) {
					svgToRender = effectiveIcon.svgData || effectiveIcon.themeDarkSvgData || '';
				} else {
					svgToRender = effectiveIcon.themeDarkSvgData || effectiveIcon.svgData || '';
				}
				const prepared = prepareSvgForSettings(svgToRender || effectiveIcon.svgData || '', previewIcon);
				const img = document.createElement('img');
				img.dataset.iconName = icon.name || '';
				img.dataset.iconLinkType = icon.linkType || 'url';
				img.dataset.builtin = (builtinOverride ? 'true' : 'false');
				img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
				img.alt = icon.name || '';
				previewIcon.appendChild(img);
			}
		} catch (error) {
			console.warn('Failed to render icon preview:', error);
			previewIcon.textContent = '🔧'; // fallback glyph
		}

		previewContainer.createSpan({ text: icon.name });
	}

	/**
	 * 添加名称输入框
	 */
	private addNameInput(settingItem: Setting, icon: IconItem): void {
		if (icon.linkType === 'url') {
			// Website custom icons: editable target (domain) only
			settingItem.addText(text => {
				text.setPlaceholder('Example.com')
					.setValue(icon.target || '')
					.onChange((value) => {
						this.debounceUpdateTarget(icon.name, value);
					});
			});
		} else {
			// Scheme custom icons: only editable scheme identifier (protocol).
			// Icon ID (name) is shown in the preview area and should not be editable here.
			settingItem.addText(text => {
				text.setPlaceholder('Scheme identifier')
					.setValue(icon.target || '')
					.onChange((value) => {
						this.debounceUpdateTarget(icon.name, value);
					});
			});
		}
	}

	/**
	 * 防抖动更新 target（域名或 scheme）
	 */
	private debounceUpdateTarget(name: string, newTarget: string): void {
		const timerId = this.debounceTimers.get(`target-${name}`);
		if (timerId) {
			window.clearTimeout(timerId);
		}

		const newTimerId = window.setTimeout(() => {
			(async () => {
				const icons = this.plugin.settings.customIcons || {};
				if (icons[name]) {
					icons[name].target = newTarget.trim();
					await this.plugin.saveSettings();
					this.display();
				}
				this.debounceTimers.delete(`target-${name}`);
			})().catch(console.error);
		}, 500);
		this.debounceTimers.set(`target-${name}`, newTimerId);
	}

	/**
	 * 防抖动重命名处理
	 */
	private debounceRename(oldName: string, newName: string): void {
		const timerId = this.debounceTimers.get(oldName);
		if (timerId) {
			window.clearTimeout(timerId);
		}
		
		const newTimerId = window.setTimeout(() => {
			(async () => {
				if (newName !== oldName && newName.trim()) {
					await this.renameIcon(oldName, newName.trim());
					this.display();
				}
				this.debounceTimers.delete(oldName);
			})().catch(console.error);
		}, 500);
		
		this.debounceTimers.set(oldName, newTimerId);
	}

	/**
	 * 添加链接类型下拉框
	 */
	private addLinkTypeDropdown(settingItem: Setting, icon: IconItem): void {
		settingItem.addDropdown(dropdown => dropdown
			.addOption('url', 'Website')
			.addOption('scheme', 'URL scheme')
			.setValue(icon.linkType || 'url')
			.onChange(async (value: string) => {
				if (value === 'url' || value === 'scheme') {
					icon.linkType = value;
					await this.plugin.saveSettings();
					// 重新显示以更新占位符
					this.display();
				}
			}));
	}

	/**
	 * 添加上传按钮
	 */
	private addUploadButton(settingItem: Setting, icon: IconItem): void {
		settingItem.addButton(button => button
			.setButtonText('Upload SVG')
			.setTooltip('Upload an SVG file')
			.onClick(() => this.uploadSVG(icon)));
	}

	/**
	 * 添加控制按钮（上移、下移、删除）
	 */
	private addControlButtons(settingItem: Setting, icon: IconItem, index: number): void {
		// Compute ordering within the same linkType group so move buttons reflect group boundaries
		const allCustom = Object.values(this.plugin.settings.customIcons || {});
		const groupSorted = allCustom
			.filter(i => i.linkType === icon.linkType)
			.sort((a, b) => (a.order || 0) - (b.order || 0));
		const currentIndex = groupSorted.findIndex(i => i.name === icon.name);
		
		// Always render move up/down buttons but disable them when at edges within the same group
		const canMoveUp = currentIndex > 0;
		const canMoveDown = currentIndex >= 0 && currentIndex < groupSorted.length - 1;
		settingItem.addButton(button => button
			.setButtonText('↑')
			.setTooltip('Move up')
			.setDisabled(!canMoveUp)
			.onClick(async () => {
				if (!canMoveUp) return;
				await this.moveIcon(icon, -1);
				this.display();
			}));

		settingItem.addButton(button => button
			.setButtonText('↓')
			.setTooltip('Move down')
			.setDisabled(!canMoveDown)
			.onClick(async () => {
				if (!canMoveDown) return;
				await this.moveIcon(icon, 1);
				this.display();
			}));
		
		// 删除按钮
		settingItem.addButton(button => button
			.setButtonText('Delete')
			.setWarning()
			.onClick(async () => {
				const modal = new ConfirmModal(this.plugin.app, `Are you sure you want to delete the icon "${icon.name}"?`);
				modal.open();
				const confirmed = await modal.result;
				if (confirmed) {
					delete this.plugin.settings.customIcons[icon.name];
					await this.plugin.saveSettings();
					this.display();
				}
			}));
	}

	/**
	 * 重命名图标
	 */
	private async renameIcon(oldName: string, newName: string): Promise<void> {
		if (!newName || newName === oldName) {
			return;
		}

		const icons = this.plugin.settings.customIcons;
		const iconItem = icons[oldName];
		
		if (!iconItem) {
			console.warn(`Icon "${oldName}" not found`);
			return;
		}

		// 检查是否已存在同名图标
		if (icons[newName]) {
			console.warn(`Icon "${newName}" already exists`);
			return;
		}

		// 执行重命名
		delete icons[oldName];
		iconItem.name = newName;
		icons[newName] = iconItem;
		
		await this.plugin.saveSettings();
	}

	/**
	 * 移动图标位置
	 */
	private async moveIcon(icon: IconItem, direction: number): Promise<void> {
		// Only operate within the same linkType group (url vs scheme)
		const allCustom = Object.values(this.plugin.settings.customIcons || {});
		const group = allCustom.filter(i => i.linkType === icon.linkType).sort((a, b) => (a.order || 0) - (b.order || 0));
		const currentIndex = group.findIndex(i => i.name === icon.name);
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
				newMap[it.name] = it;
			}
		});
		arr.forEach(it => { newMap[it.name] = it; });

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
		combined.forEach(it => { normalizedMap[it.name] = it; });
		this.plugin.settings.customIcons = normalizedMap;
		await this.plugin.saveSettings();

	}

	/**
	 * 上传 SVG 文件
	 */
	private uploadSVG(icon: IconItem): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.svg,image/svg+xml';
		input.classList.add('external-links-icon-hidden-input');

		input.onchange = async (event) => {
			try {
				const files = (event.target as HTMLInputElement).files;
				if (!files || files.length === 0) return;

				const file = files[0];
				if (!this.isValidSvgFile(file)) {
					new Notice('Please select a valid SVG file.');
					return;
				}

				const content = await this.readFileAsText(file);
				if (content && this.isValidSvgContent(content)) {
					const sanitized = sanitizeSvg(content);
					icon.svgData = sanitized;
					await this.plugin.saveSettings();
					this.display();
				} else {
					new Notice('Invalid SVG file content.');
				}
			} catch (error) {
				console.error('Failed to upload SVG:', error);
				new Notice('Failed to upload SVG file.');
			}
		};

		document.body.appendChild(input);
		input.click();
		document.body.removeChild(input);
	}

	private isValidSvgFile(file: File): boolean {
		return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
	}

	/**
	 * 验证 SVG 内容是否有效
	 */
	private isValidSvgContent(content: string): boolean {
		const trimmed = content.trim();
		return trimmed.startsWith('<svg') && trimmed.includes('</svg>');
	}

	/**
	 * 读取文件为文本
	 */
	private readFileAsText(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const result = e.target?.result as string;
				resolve(result || '');
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		});
	}
	onClose(): void {
		// Cleanup theme listeners when Settings tab is closed
		this.disconnectThemeListeners();
		try { this.containerEl.empty(); } catch (e) { /* ignore */ }
	}}
