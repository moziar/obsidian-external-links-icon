import type { ExternalLinksIconSettings, IconItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getCachedIconImage } from './utils';
import { preferDarkThemeFromDocument } from './svg';
import { getMatchContext, iconMatchesContext, getAllIconsSorted } from './icon-matcher';


export type GetSettingsFn = () => ExternalLinksIconSettings;
export type GetSettingsVersionFn = () => number;

export class Scanner {
	private getSettings: GetSettingsFn;
	private getSettingsVersion: GetSettingsVersionFn;
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
			if (this.isOwnMutation(mutations)) return;
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

		this.scheduleScan(60);
	}

	stop(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
		this.observedRoots = [];
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

	private isOwnMutation(mutations: MutationRecord[]): boolean {
		for (const m of mutations) {
			if (m.type === 'attributes' && m.attributeName === 'class') {
				return false;
			}
			if (m.type === 'childList') {
				for (const n of Array.from(m.addedNodes)) {
					if (n.nodeType !== Node.ELEMENT_NODE) return false;
					const el = n as Element;
					if (el.matches && (el.matches('.external-links-icon-inline') || el.querySelector('.external-links-icon-inline'))) {
						continue;
					}
					return false;
				}
				for (const n of Array.from(m.removedNodes)) {
					if (n.nodeType !== Node.ELEMENT_NODE) return false;
					const el = n as Element;
					if (el.matches && (el.matches('.external-links-icon-inline') || el.querySelector('.external-links-icon-inline'))) {
						continue;
					}
					return false;
				}
			} else {
				return false;
			}
		}
		return true;
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
			const newIconElementsByName = new Map<string, Set<HTMLElement>>();

			// Track elements that need icon changes
			const elementsToUpdate: Array<{ el: HTMLElement; shouldHaveIcon: boolean; iconId?: string; image?: string; hideSuffix?: boolean }> = [];
			const processedElements = new Set<Element>();

			for (const root of rootSources) {
				const elements = root.querySelectorAll('.external-link, .internal-link');
				if (!elements || elements.length === 0) continue;
				
				for (const el of Array.from(elements)) {
					if (processedElements.has(el)) continue;
					if (!el.instanceOf(HTMLElement)) continue;

					processedElements.add(el);

					const href = el.getAttribute('href') || '';
					const isExternal = el.classList.contains('external-link');
					const isInternal = el.classList.contains('internal-link');

					let chosen: IconItem | null = null;
					const ctx = getMatchContext(href, isExternal, isInternal, settings);
					for (const icon of icons) {
						if (iconMatchesContext(icon, ctx)) {
							chosen = icon;
							break;
						}
					}

					const dataIcon = el.getAttribute('data-icon') || '';
					if (!chosen && dataIcon) {
						chosen = icons.find(icon => icon.id === dataIcon) || null;
					}

					if (chosen) {
						const image = iconImages.get(chosen.id);
						if (image) {
							const hideSuffix = chosen.linkType === 'scheme' &&
								(Boolean((DEFAULT_SETTINGS.icons || {})[chosen.id]) ||
									Boolean(settings?.customIcons?.[chosen.id]));

							elementsToUpdate.push({
								el,
								shouldHaveIcon: true,
								iconId: chosen.id,
								image,
								hideSuffix
							});

							let set = newIconElementsByName.get(chosen.id);
							if (!set) {
								set = new Set<HTMLElement>();
								newIconElementsByName.set(chosen.id, set);
							}
							set.add(el);
						} else {
							elementsToUpdate.push({ el, shouldHaveIcon: false });
						}
					} else {
						elementsToUpdate.push({ el, shouldHaveIcon: false });
					}
				}
			}

			if (settingsOrThemeChanged) {
				// Full refresh: use original atomic clear+apply approach
				this.iconElementsByName.clear();

				// Collect elements that currently have icons
				const elementsToClear: HTMLElement[] = [];
				previewRoots.forEach(el => {
					el.querySelectorAll('.external-links-icon-enabled').forEach(child => {
						if (child.instanceOf(HTMLElement)) {
							elementsToClear.push(child);
						}
					});
				});

				// Clear old icons
				for (const el of elementsToClear) {
					el.classList.remove('external-links-icon-enabled');
					el.classList.remove('external-links-icon-hide-suffix');
					el.style.removeProperty('--external-link-icon-image');
				}

				// Apply new icons immediately after clear
				for (const update of elementsToUpdate) {
					if (update.shouldHaveIcon && update.iconId && update.image) {
						try {
							update.el.style.setProperty('--external-link-icon-image', `url("${update.image}")`);
							update.el.classList.add('external-links-icon-enabled');
							if (update.hideSuffix) {
								update.el.classList.add('external-links-icon-hide-suffix');
							}

							let set = this.iconElementsByName.get(update.iconId);
							if (!set) {
								set = new Set<HTMLElement>();
								this.iconElementsByName.set(update.iconId, set);
							}
							set.add(update.el);
						} catch (err) {
							console.warn('Failed to apply icon style for', update.iconId, err);
						}
					}
				}
			} else {
				// Incremental update: only update elements that actually changed
				let hasChanges = false;

				for (const update of elementsToUpdate) {
					const el = update.el;
					const hasIcon = el.classList.contains('external-links-icon-enabled');
					const currentImage = el.style.getPropertyValue('--external-link-icon-image');
					const currentHideSuffix = el.classList.contains('external-links-icon-hide-suffix');

					if (update.shouldHaveIcon) {
						const expectedImage = `url("${update.image}")`;
						const expectedHideSuffix = update.hideSuffix;

						if (!hasIcon || currentImage !== expectedImage || currentHideSuffix !== expectedHideSuffix) {
							// Need to update this element
							el.style.setProperty('--external-link-icon-image', expectedImage);
							el.classList.add('external-links-icon-enabled');
							if (expectedHideSuffix) {
								el.classList.add('external-links-icon-hide-suffix');
							} else {
								el.classList.remove('external-links-icon-hide-suffix');
							}
							hasChanges = true;
						}
					} else {
						if (hasIcon) {
							// Need to remove the icon
							el.classList.remove('external-links-icon-enabled');
							el.classList.remove('external-links-icon-hide-suffix');
							el.style.removeProperty('--external-link-icon-image');
							hasChanges = true;
						}
					}
				}

				if (hasChanges) {
					this.iconElementsByName = newIconElementsByName;
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

}
