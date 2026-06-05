import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import type { SettingDefinitionItem, SettingGroupItem } from 'obsidian';
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
	icon: string = 'external-link';
	plugin: ExternalLinksIcon;
	private debounceTimers: Map<string, number> = new Map();

	private themeMediaQuery: MediaQueryList | null = null;
	private mqHandler: EventListener | null = null;
	private bodyObserver: MutationObserver | null = null;
	private themeChangeDebounce: number = 0;

	constructor(app: App, plugin: ExternalLinksIcon) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t('Language'),
				desc: t('Setting page language'),
				render: (setting) => {
					setting.addDropdown(dropdown => {
						dropdown
							.addOption('auto', t('Adapt to Obsidian setting (Auto)'))
							.addOption('en', t('English'))
							.addOption('zh', t('Chinese (Simplified)'))
							.setValue(this.plugin.settings.language || 'auto')
							.onChange(async (value) => {
								this.plugin.settings.language = value;
								await this.plugin.saveSettings();
								this.plugin.applyLanguage();
								this.update();
							});
					});
					this.ensureThemeListeners();
					try { this.updatePreviewIcons(preferDarkThemeFromDocument()); } catch { /* ignore */ }
					return () => this.disconnectThemeListeners();
				},
			},
			{
				name: t('Add new icon'),
				desc: t('Add website or URL scheme icon. The icon name must be unique.'),
				render: (setting) => {
					const btnContainer = setting.controlEl.createDiv({ cls: 'add-buttons' });
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
				},
			},
			{
				type: 'page',
				name: t('Appearance'),
				items: [
					{ name: t('Fancy url scheme'), desc: t('Enable icons for url schemes.'), control: { type: 'toggle', key: 'fancyUrlScheme' } },
					{ name: t('Fancy web link'), desc: t('Enable icons for web page links.'), control: { type: 'toggle', key: 'fancyWebLink' } },
					{ name: t('Fancy obsidian web link'), desc: t('Enable icons for Obsidian website links. Turn this off if you find the icons confusing with Fancy obsidian note link.'), control: { type: 'toggle', key: 'fancyObsidianWebLink' } },
					{
						name: t('Fancy obsidian note link'),
						desc: t('Enable internal links or external vault links icon.'),
						control: {
							type: 'dropdown',
							key: 'fancyObsidianNoteLink',
							defaultValue: 'none',
							options: {
								none: t('None'),
								internal: t('Internal'),
								external: t('External'),
								both: t('Both'),
							},
						},
					},
					{ name: t('Fancy advanced uri link'), desc: t('Enable icons for advanced uri links.'), control: { type: 'toggle', key: 'fancyAdvancedUriLink' } },
					{
						name: t('Icon position'),
						desc: t('Choose whether the icon appears before or after the link text.'),
						control: {
							type: 'dropdown',
							key: 'iconPosition',
							defaultValue: 'after',
							options: {
								before: t('Before link'),
								after: t('After link'),
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('Website'),
				items: this.buildWebsiteItems(),
			},
			{
				type: 'group',
				heading: t('URL scheme'),
				items: this.buildSchemeItems(),
			},
		];
	}

	private buildWebsiteItems(): SettingGroupItem[] {
		const items: SettingGroupItem[] = [];

		items.push({
			name: t('Built-in icons'),
			render: (setting) => {
				setting.settingEl.classList.add('builtin-list-row');
				const builtinsDetails = setting.settingEl.createEl('details', { cls: 'builtin-list' });
				builtinsDetails.createEl('summary', { text: t('Built-in icons') });
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
			},
		});

		const customIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'url');
		if (customIcons.length > 0) {
			customIcons.forEach((icon) => {
				items.push(this.createIconDefinition(icon));
			});
		} else {
			items.push({
				name: t('No custom website icons yet.'),
			});
		}

		return items;
	}

	private buildSchemeItems(): SettingGroupItem[] {
		const items: SettingGroupItem[] = [];

		items.push({
			name: t('Built-in icons'),
			render: (setting) => {
				setting.settingEl.classList.add('builtin-list-row');
				const builtinsDetails = setting.settingEl.createEl('details', { cls: 'builtin-list' });
				builtinsDetails.createEl('summary', { text: t('Built-in icons') });
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
			},
		});

		const customSchemeIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'scheme');
		if (customSchemeIcons.length > 0) {
			customSchemeIcons.forEach((icon) => {
				items.push(this.createIconDefinition(icon));
			});
		} else {
			items.push({
				name: t('No custom URL scheme icons yet.'),
			});
		}

		return items;
	}

	private createIconDefinition(icon: IconItem): SettingGroupItem {
		return {
			name: getIconDisplayName(icon),
			render: (setting) => {
				setting.setClass('icon-setting-item');
				setting.nameEl.empty();
				this.addIconPreview(setting, icon);
				this.addNameInput(setting, icon);
				this.addUploadButton(setting, icon);
				this.addControlButtons(setting, icon);
			},
		};
	}

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
		this.update();
	}

	private ensureThemeListeners(): void {
		this.disconnectThemeListeners();

		try {
			this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			const mq = this.themeMediaQuery;
			this.mqHandler = () => this.scheduleThemeRefresh();
			if (mq.addEventListener) mq.addEventListener('change', this.mqHandler);
		} catch {
				// ignore
			}

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

	private scheduleThemeRefresh(): void {
		if (this.themeChangeDebounce) {
			window.clearTimeout(this.themeChangeDebounce);
		}
		this.themeChangeDebounce = window.setTimeout(() => {
			this.themeChangeDebounce = 0;
			try {
				const preferDark = preferDarkThemeFromDocument();
				this.updatePreviewIcons(preferDark);
			} catch { /* ignore */ }
		}, 100);
	}

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

	private getSortedCustomIcons(): IconItem[] {
		return Object.values(this.plugin.settings.customIcons || {})
			.sort((a: IconItem, b: IconItem) => (a.order || 0) - (b.order || 0));
	}

	private addIconPreview(settingItem: Setting, icon: IconItem): void {
		const previewContainer = settingItem.nameEl.createDiv({ cls: 'svg-preview-container' });

		const previewIcon = previewContainer.createDiv({ cls: 'external-links-icon-preview-div small' });

		const builtinOverride = (DEFAULT_SETTINGS.icons || {})[icon.id];
		const effectiveIcon = builtinOverride ? builtinOverride : icon;
		const isBuiltin = Boolean(builtinOverride);
		renderIconImage(previewIcon, effectiveIcon, icon.linkType || 'url', isBuiltin);

		previewContainer.createSpan({ text: getIconDisplayName(icon) });
	}

	private addNameInput(settingItem: Setting, icon: IconItem): void {
		const placeholder = icon.linkType === 'url' ? t('Example.com') : t('Scheme identifier');
		settingItem.addText(text => {
			text.setPlaceholder(placeholder)
				.setValue(icon.target || '')
				.onChange((value) => {
					this.debounceUpdateTarget(icon.id, value);
				});
		});
	}

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
					this.update();
				}
				this.debounceTimers.delete(`target-${id}`);
			})().catch(console.error);
		}, 500);
		this.debounceTimers.set(`target-${id}`, newTimerId);
	}

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
						this.update();
					});
					modal.open();
				});
		});
	}

	private addControlButtons(settingItem: Setting, icon: IconItem): void {
		const allCustom = Object.values(this.plugin.settings.customIcons || {});
		const groupSorted = allCustom
			.filter(i => i.linkType === icon.linkType)
			.sort((a, b) => (a.order || 0) - (b.order || 0));
		const currentIndex = groupSorted.findIndex(i => i.id === icon.id);

		const canMoveUp = currentIndex > 0;
		const canMoveDown = currentIndex >= 0 && currentIndex < groupSorted.length - 1;
		settingItem.addButton(button => button
			.setButtonText('↑')
			.setTooltip(t('Move up'))
			.setDisabled(!canMoveUp)
			.onClick(async () => {
				if (!canMoveUp) return;
				await this.moveIcon(icon, -1);
				this.update();
			}));

		settingItem.addButton(button => button
			.setButtonText('↓')
			.setTooltip(t('Move down'))
			.setDisabled(!canMoveDown)
			.onClick(async () => {
				if (!canMoveDown) return;
				await this.moveIcon(icon, 1);
				this.update();
			}));

		settingItem.addButton(button => button
			.setIcon('lucide-trash-2')
			.setTooltip(t('Delete'))
			.setDestructive()
			.onClick(async () => {
				const modal = new ConfirmModal(this.plugin.app, `${t('Are you sure you want to delete the icon')} "${getIconDisplayName(icon)}"?`);
				modal.open();
				const confirmed = await modal.result;
				if (confirmed) {
					delete this.plugin.settings.customIcons[icon.id];
					clearIconCache(icon.id);
					await this.plugin.saveSettings();
					this.update();
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

		arr.forEach((it, idx) => { it.order = idx; });

		const newMap: Record<string, IconItem> = {};
		Object.values(this.plugin.settings.customIcons || {}).forEach(it => {
			if (it.linkType !== icon.linkType) {
				newMap[it.id] = it;
			}
		});
		arr.forEach(it => { newMap[it.id] = it; });

		this.plugin.settings.customIcons = newMap;
		await this.plugin.saveSettings();
	}
}
