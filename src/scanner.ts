import type { ExternalLinksIconSettings, IconItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getCachedIconImage } from './utils';
import { preferDarkThemeFromDocument } from './svg';
import { matchIcon, getAllIconsSorted } from './icon-matcher';
import { MarkdownRenderChild } from 'obsidian';


export type GetSettingsFn = () => ExternalLinksIconSettings;
export type GetSettingsVersionFn = () => number;

/**
 * MarkdownRenderChild that manages icons for links within a single rendered section.
 * Created by registerMarkdownPostProcessor and bound to the section's lifecycle:
 * when core post-processors (callouts, task lists) rebuild the DOM, this child
 * unloads automatically, cleaning up any icons it applied. The next post-processor
 * pass creates a fresh child for the rebuilt DOM — no flicker, no stale state.
 */
export class IconLinkRenderChild extends MarkdownRenderChild {
	private getSettings: GetSettingsFn;
	private getSettingsVersion: GetSettingsVersionFn;
	private scanner: Scanner;
	private managedElements: Set<HTMLElement> = new Set();

	constructor(containerEl: HTMLElement, scanner: Scanner) {
		super(containerEl);
		this.scanner = scanner;
		this.getSettings = scanner.getSettings;
		this.getSettingsVersion = scanner.getSettingsVersion;
	}

	onload(): void {
		try {
			const containerEl = this.containerEl;
			const settings = this.getSettings();
			const settingsVersion = this.getSettingsVersion();
			const preferDark = preferDarkThemeFromDocument();
			const icons: IconItem[] = getAllIconsSorted(settings, settingsVersion);

			const links = containerEl.querySelectorAll('.external-link, .internal-link');
			for (const el of Array.from(links)) {
				if (!el.instanceOf(HTMLElement)) continue;

				// property 链接（properties 面板内的 .metadata-link-inner）受独立开关控制；
				// 被 Typify 等插件渲染为状态按钮（custom-status-icon-pill）的链接跳过，
				// 与 scan() 中的判断保持一致，避免先加图标再被清掉的闪烁
				if (el.closest('.metadata-container')
					&& (!settings.fancyPropertyLink || el.closest('.custom-status-icon-pill'))) continue;

				const href = el.getAttribute('href') || el.getAttribute('data-href') || '';
				const isExternal = el.classList.contains('external-link');
				const isInternal = el.classList.contains('internal-link');

				let chosen = matchIcon(href, isExternal, isInternal, settings, settingsVersion);
				const dataIcon = el.getAttribute('data-icon') || '';
				if (!chosen && dataIcon) {
					chosen = icons.find(icon => icon.id === dataIcon) || null;
				}

				if (!chosen) continue;

				let image: string | undefined;
				try {
					image = getCachedIconImage(chosen.id, chosen.svgData, chosen.themeDarkSvgData, preferDark);
				} catch { /* skip failed icons */ }
				if (!image) continue;

				el.style.setProperty('--external-link-icon-image', `url("${image}")`);
				el.classList.add('external-links-icon-enabled');

				this.managedElements.add(el);
				this.scanner.registerIconElement(chosen.id, el);
			}
		} catch (e) {
			console.error('Failed to annotate links in IconLinkRenderChild.onload:', e);
		}
	}

	onunload(): void {
		for (const el of this.managedElements) {
			try {
				el.classList.remove('external-links-icon-enabled');
				el.style.removeProperty('--external-link-icon-image');
			} catch { /* element may already be detached */ }
			this.scanner.unregisterIconElement(el);
		}
		this.managedElements.clear();
	}
}

// CM 编辑器内需要放行的变动：涉及链接或嵌入节点（LP 嵌入渲染在 .cm-editor 内部）
const CM_LINKISH_SELECTOR = '.internal-link, .external-link, .markdown-embed';

/**
 * 判断一批 mutation 是否全部来自 CM 编辑器内的纯文本变动（键入、decoration 更新）。
 * 这类变动不会新增链接节点，跳过可避免每次键入都触发全量重扫；
 * 嵌入渲染等涉及链接/嵌入节点的变动、以及 CM 之外的变动（阅读态 DOM、属性面板、body class）仍会放行。
 */
function isIgnorableMutationBatch(mutations: MutationRecord[]): boolean {
	const hasLinkish = (n: Node): boolean =>
		n.instanceOf(Element)
		&& (n.matches(CM_LINKISH_SELECTOR) || n.querySelector(CM_LINKISH_SELECTOR) !== null);

	return mutations.every(m => {
		const target = m.target.instanceOf(Element) ? m.target : m.target.parentElement;
		if (!target || !target.closest('.cm-editor')) return false;
		return !Array.from(m.addedNodes).some(hasLinkish)
			&& !Array.from(m.removedNodes).some(hasLinkish);
	});
}

export class Scanner {
	getSettings: GetSettingsFn;
	getSettingsVersion: GetSettingsVersionFn;
	private scanTimerId: number | null = null;
	private mutationObserver: MutationObserver | null = null;
	private observedRoots: Element[] = [];
	private observeSelectors: string[];
	private iconElementsByName: Map<string, Set<HTMLElement>> = new Map();
	private lastSettingsVersion = -1;
	private lastPreferDark: boolean | null = null;

	constructor(getSettings: GetSettingsFn, observeSelectors?: string[], getSettingsVersion?: GetSettingsVersionFn) {
		this.getSettings = getSettings;
		this.getSettingsVersion = getSettingsVersion || (() => 0);
		this.observeSelectors = observeSelectors || ['.markdown-preview-view', '.view-content', '.workspace-leaf-content'];
	}

	start(): void {
		this.mutationObserver = new MutationObserver((mutations) => {
			if (isIgnorableMutationBatch(mutations)) return;
			// Fallback for dynamic DOM changes post-render (embeds, etc.). Initial render
			// is handled by registerMarkdownPostProcessor in main.ts, so no delay needed here.
			window.requestAnimationFrame(() => this.scheduleScan(0));
		});

		const observeSelectors = this.observeSelectors;
		const doc = activeDocument;
		const roots = Array.from(doc.querySelectorAll(observeSelectors.join(',')));

		try { this.mutationObserver?.observe(doc.body, { attributes: true, attributeFilter: ['class'] }); } catch { /* ignore */ }

		if (roots.length) {
			this.observedRoots = roots;
			roots.forEach(r => {
				try { this.mutationObserver?.observe(r, { childList: true, subtree: true }); } catch { /* ignore root observe errors */ }
			});
		} else {
			this.observedRoots = [];
			try { this.mutationObserver?.observe(doc.body, { childList: true, subtree: true }); } catch { /* ignore */ }
		}

		// Initial scan removed: registerMarkdownPostProcessor handles reading mode render
		// timing precisely. layout-change / active-leaf-change events cover other cases.
	}

	stop(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
		this.observedRoots = [];
		this.iconElementsByName.clear();
		if (this.scanTimerId) {
			window.clearTimeout(this.scanTimerId);
			this.scanTimerId = null;
		}
	}

	scheduleScan(delay = 100): void {
		if (this.scanTimerId) {
			window.clearTimeout(this.scanTimerId);
			this.scanTimerId = null;
		}
		this.scanTimerId = window.setTimeout(() => {
			this.scanTimerId = null;
			this.scanAndAnnotateLinks();
		}, delay);
	}

	scanAndAnnotateLinks(): void {
		try {
			const preferDark = preferDarkThemeFromDocument();
			const doc = activeDocument;

			const settings = this.getSettings();
			const settingsVersion = this.getSettingsVersion();
			const icons: IconItem[] = getAllIconsSorted(settings, settingsVersion);

			// Update icon position body class
			doc.body.classList.remove('external-links-icon-position-before');
			if (settings.iconPosition === 'before') {
				doc.body.classList.add('external-links-icon-position-before');
			}

			const previewRoots = doc.querySelectorAll('.markdown-preview-view');

			// Check if anything has actually changed
			const settingsOrThemeChanged = this.lastSettingsVersion !== settingsVersion || this.lastPreferDark !== preferDark;
			
			// Pre-compute all icon images
			const iconImages = new Map<string, string>();
			for (const icon of icons) {
				try {
					const image = getCachedIconImage(icon.id, icon.svgData, icon.themeDarkSvgData, preferDark);
					iconImages.set(icon.id, image);
				} catch (err) {
					console.warn('Failed to encode icon style for', icon.id, err);
				}
			}

			const rootSources = (this.observedRoots && this.observedRoots.length) ? this.observedRoots : Array.from(previewRoots);

			// Track elements that need icon changes
			const elementsToUpdate: Array<{ el: HTMLElement; shouldHaveIcon: boolean; iconId?: string; image?: string }> = [];
			const processedElements = new Set<Element>();

			for (const root of rootSources) {
				const elements = root.querySelectorAll('.external-link, .internal-link');
				if (!elements || elements.length === 0) continue;

				for (const el of Array.from(elements)) {
					if (processedElements.has(el)) continue;
					if (!el.instanceOf(HTMLElement)) continue;

					processedElements.add(el);

					// property 链接（properties 面板内的 .metadata-link-inner）受独立开关控制：
					// 开关关闭时标记为移除图标，由下方清理分支统一移除 class 与 style；
					// 被 Typify 等插件渲染为状态按钮（custom-status-icon-pill）的链接同样跳过并清理
					if (el.closest('.metadata-container')) {
						if (!settings.fancyPropertyLink || el.closest('.custom-status-icon-pill')) {
							elementsToUpdate.push({ el, shouldHaveIcon: false });
							continue;
						}
					}

					const href = el.getAttribute('href') || el.getAttribute('data-href') || '';
					const isExternal = el.classList.contains('external-link');
					const isInternal = el.classList.contains('internal-link');

					let chosen = matchIcon(href, isExternal, isInternal, settings, settingsVersion);
					const dataIcon = el.getAttribute('data-icon') || '';
					if (!chosen && dataIcon) {
						chosen = icons.find(icon => icon.id === dataIcon) || null;
					}

					if (chosen) {
						const image = iconImages.get(chosen.id);
						if (image) {
							elementsToUpdate.push({
								el,
								shouldHaveIcon: true,
								iconId: chosen.id,
								image,
							});
						} else {
							elementsToUpdate.push({ el, shouldHaveIcon: false });
						}
					} else {
						elementsToUpdate.push({ el, shouldHaveIcon: false });
					}
				}
			}

			if (settingsOrThemeChanged) {
				// Full refresh: settings or theme changed. IconLinkRenderChild manages element
				// registration via its own onload/onunload, so we only need to update styles
				// on already-annotated elements here. Don't clear iconElementsByName — children
				// own its contents.
				for (const update of elementsToUpdate) {
					if (update.shouldHaveIcon && update.iconId && update.image) {
						try {
							update.el.style.setProperty('--external-link-icon-image', `url("${update.image}")`);
							// Elements that newly acquired an icon (e.g., property links, links newly matched after settings change)
							// need both the class added to display and registration for theme-switch refresh
							update.el.classList.add('external-links-icon-enabled');
							this.registerIconElement(update.iconId, update.el);
						} catch (err) {
							console.warn('Failed to apply icon style for', update.iconId, err);
						}
					} else if (!update.shouldHaveIcon) {
						// Element lost its icon (e.g., link type no longer matches)
						update.el.classList.remove('external-links-icon-enabled');
						update.el.style.removeProperty('--external-link-icon-image');
						this.unregisterIconElement(update.el);
					}
				}
			} else {
				// Incremental update: only update elements whose icon actually changed.
				for (const update of elementsToUpdate) {
					const el = update.el;
					const hasIcon = el.classList.contains('external-links-icon-enabled');
					const currentImage = el.style.getPropertyValue('--external-link-icon-image');

					if (update.shouldHaveIcon) {
						const expectedImage = `url("${update.image}")`;

						if (!hasIcon || currentImage !== expectedImage) {
							el.style.setProperty('--external-link-icon-image', expectedImage);
							el.classList.add('external-links-icon-enabled');
							if (update.iconId) this.registerIconElement(update.iconId, el);
						}
					} else {
						if (hasIcon) {
							el.classList.remove('external-links-icon-enabled');
							el.style.removeProperty('--external-link-icon-image');
							this.unregisterIconElement(el);
						}
					}
				}
			}

			// 清理已脱离 DOM 的元素：scan 路径注册的元素（如 property 链接）在
			// 面板重渲染后不会触发 unregister，若不清理会持续持有 detached DOM 子树
			for (const elements of this.iconElementsByName.values()) {
				for (const el of Array.from(elements)) {
					if (!el.isConnected) elements.delete(el);
				}
			}

			this.lastSettingsVersion = settingsVersion;
			this.lastPreferDark = preferDark;
		} catch (e) {
			console.error('Failed to scan and annotate links for icons:', e);
		}
	}

	reobserveIfChanged(): void {
		const doc = activeDocument;
		const currentRoots = Array.from(doc.querySelectorAll(this.observeSelectors.join(',')));
		const changed = currentRoots.length !== this.observedRoots.length ||
			!currentRoots.every((r, i) => r === this.observedRoots[i]);
		if (!changed) return;

		this.observedRoots = currentRoots;
		this.mutationObserver?.disconnect();

		try { this.mutationObserver?.observe(doc.body, { attributes: true, attributeFilter: ['class'] }); } catch { /* ignore */ }

		if (currentRoots.length) {
			currentRoots.forEach(r => {
				try { this.mutationObserver?.observe(r, { childList: true, subtree: true }); } catch { /* ignore */ }
			});
		} else {
			try { this.mutationObserver?.observe(doc.body, { childList: true, subtree: true }); } catch { /* ignore */ }
		}
	}

	refreshIconsForThemeChange(): void {
		try {
			if (!this.iconElementsByName.size) return;
			const preferDark = preferDarkThemeFromDocument();
			const settings = this.getSettings();
			const allIcons: Record<string, IconItem> = Object.assign({}, DEFAULT_SETTINGS.icons || {}, settings.customIcons || {});
			const imageCache = new Map<string, string>();
			for (const [name, elements] of this.iconElementsByName) {
				const icon = allIcons[name];
				if (!icon) continue;
				let image = imageCache.get(name);
				if (!image) {
					try {
						image = getCachedIconImage(name, icon.svgData, icon.themeDarkSvgData, preferDark);
						imageCache.set(name, image);
					} catch (err) {
						console.warn('Failed to encode icon style for theme refresh', name, err);
						continue;
					}
				}
				for (const el of Array.from(elements)) {
					if (!el.instanceOf(HTMLElement) || !el.isConnected) {
						elements.delete(el);
						continue;
					}
					try {
						el.style.setProperty('--external-link-icon-image', `url("${image}")`);
					} catch (err) {
						console.warn('Failed to update icon style for theme refresh', name, err);
					}
				}
			}
		} catch (e) {
			console.error('Failed to refresh link icons for theme change:', e);
		}
	}

	handleCssChange(): void {
		this.refreshIconsForThemeChange();
	}

	/**
	 * Register an element annotated by an IconLinkRenderChild. Called on child.onload.
	 * Maintains the iconElementsByName index for theme-change refresh and full scans.
	 */
	registerIconElement(iconId: string, el: HTMLElement): void {
		let set = this.iconElementsByName.get(iconId);
		if (!set) {
			set = new Set<HTMLElement>();
			this.iconElementsByName.set(iconId, set);
		}
		set.add(el);
	}

	/**
	 * Unregister an element when its IconLinkRenderChild unloads.
	 * Called automatically on DOM rebuild (callout restructuring, etc.).
	 */
	unregisterIconElement(el: HTMLElement): void {
		for (const set of this.iconElementsByName.values()) {
			set.delete(el);
		}
	}

}
