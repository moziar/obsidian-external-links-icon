// 这个是原始的 main.ts 文件，包含插件的主要逻辑和功能实现。

import { Plugin, PluginSettingTab, Setting, App, Modal, Notice } from 'obsidian';

/**
 * Sanitize SVG content: remove XML prolog/doctype, script/style tags,
 * ensure xmlns, and add viewBox if width/height present.
 */
function sanitizeSvg(svg: string): string {
	let s = svg.trim();
	// remove xml prolog and doctype
	s = s.replace(/<\?xml[\s\S]*?\?>/i, '');
	s = s.replace(/<!DOCTYPE[\s\S]*?>/i, '');
	// remove script/style
	s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
	s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
	// ensure xmlns
	if (!/<svg[^>]*xmlns=/.test(s)) {
		s = s.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
	}
	// ensure viewBox if possible
	const svgTagMatch = s.match(/<svg([^>]*)>/);
	if (svgTagMatch) {
		const attrs = svgTagMatch[1];
		if (!/viewBox=/i.test(attrs)) {
			const widthMatch = attrs.match(/width=["']?([0-9.]+)(px)?["']?/i);
			const heightMatch = attrs.match(/height=["']?([0-9.]+)(px)?["']?/i);
			if (widthMatch && heightMatch) {
				const w = parseFloat(widthMatch[1]);
				const h = parseFloat(heightMatch[1]);
				s = s.replace(/<svg([^>]*)>/, `<svg$1 viewBox="0 0 ${w} ${h}">`);
			}
		}
	}
	return s;
}

/**
 * Prepare SVG for Settings preview.
 * - sanitize first
 * - replace `currentColor` with the computed color of the container
 * - replace `var(--name)` with the computed value of that CSS variable if available
 */
function prepareSvgForSettings(svg: string, container: HTMLElement): string {
    let s = sanitizeSvg(svg);
    try {
		// Remove embedded media queries that react to system prefers-color-scheme
		// so Settings preview follows Obsidian's explicit theme classes instead
		// of the host OS preference which may be different.
		s = s.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\}/gi, '');

        const comp = window.getComputedStyle(container);
        const color = comp && comp.color ? comp.color.trim() : '';

        if (color) {
            // replace occurrences of currentColor in attributes and inline styles
            s = s.replace(/currentColor/g, color);
        }

        // replace CSS variables used inside svg e.g. var(--accent)
        s = s.replace(/var\(--([a-zA-Z0-9-_]+)\)/g, (m, varName) => {
            // look up on container first, then documentElement
            const val1 = window.getComputedStyle(container).getPropertyValue(`--${varName}`) || '';
            const val2 = window.getComputedStyle(document.documentElement).getPropertyValue(`--${varName}`) || '';
            const val = (val1 || val2).trim();
            return val || m;
        });
    } catch (e) {
        // ignore
    }
    return s;
}

/**
 * Helper: determine whether we should prefer dark theme for settings previews.
 * Priority:
 * 1. If body has explicit `theme-dark` or `theme-light` class, use that.
 * 2. Otherwise fall back to `prefers-color-scheme` media query.
 */
function preferDarkThemeFromDocument(): boolean {
	const body = document.body;
	const isDarkByClass = body && body.classList ? body.classList.contains('theme-dark') : false;
	const isLightByClass = body && body.classList ? body.classList.contains('theme-light') : false;
	if (isDarkByClass) return true;
	if (isLightByClass) return false;
	return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

// 图标类型定义
type LinkType = 'url' | 'scheme';

interface IconItem {
	name: string;
	svgData: string;
	order: number;
	linkType: LinkType;
	themeDarkSvgData?: string;
	// target stores website domain (e.g. "baidu.com") or scheme identifier (e.g. "bear")
	target?: string;
}

interface ExternalLinksIconSettings {
	icons: Record<string, IconItem>;
	customIcons: Record<string, IconItem>;
}

// 特殊图标配置类型
interface SpecialIconConfig {
	selector: string;
}

// 图标分类类型
interface IconCategories {
	URL_SCHEME: readonly string[];
	WEB: Record<string, string>;
	SPECIAL: Record<string, SpecialIconConfig>;
}

// 图标分类配置常量
const ICON_CATEGORIES: IconCategories = {
	// URL Scheme 类型图标
	URL_SCHEME: [
		'goodlinks', 'zotero', 'snippetslab', 'siyuan', 'eagle', 
		'bear', 'prodrafts', 'things', 'shortcut', 'file'
	] as const,
	
	// Web 域名图标映射
	WEB: {
		'github': 'github.com',
		'sspai': 'sspai.com',
		'mp.weixin.qq': 'mp.weixin.qq.com',  // 修复拼写错误
		'xiaoyuzhoufm': 'xiaoyuzhoufm.com',
		'douban': 'douban.com',
		'bilibili': 'bilibili.com',
		'youtube': 'youtube.com',
		'medium': 'medium.com',
		'ollama': 'ollama.com',
		'modelscope': 'modelscope.cn',
		'huggingface': 'huggingface.co',
		'openrouter': 'openrouter.ai',
		'siliconflow': 'siliconflow.cn',
		'douyin': 'douyin.com',
		'v.douyin': 'v.douyin.com',  // 添加抖音个人页支持
		'tiktok': 'tiktok.com',
		'baidu': 'baidu.com',  // 修复百度域名
		'v.flomo': 'v.flomoapp.com',  // 修复 flomo 域名
		'wikipedia': 'wikipedia.org',
		'archive': 'archive.org',
		'google': 'google.com',
		'docs.google': 'docs.google.com',
		'cloud.google': 'cloud.google.com'
	},
	
	// 特殊选择器图标
	SPECIAL: {
		'obsidianweb': {
			selector: 'body.fancy-obsidian-web-link .external-link[href^="https://"][href*="obsidian.md"]'
		},
		// obsidiannote should match internal note links and obsidian://... external links
		// EXCEPT advanced uri (obsidian://adv-uri) which is handled by advanceduri.
		// only support settingid now.
		'obsidiannote': {
			selector: 'body.fancy-internal-obsidian-link .internal-link, body.fancy-both-obsidian-link .internal-link, body.fancy-external-obsidian-link .external-link[href^="obsidian://"]:not([href^="obsidian://adv-uri"][href*="settingid"]), body.fancy-both-obsidian-link .external-link[href^="obsidian://"]:not([href^="obsidian://adv-uri"][href*="settingid"])'
		},
		'advancedurisetting': {
			selector: 'body.fancy-advanced-uri-link .external-link[href^="obsidian://adv-uri"][href*="settingid"]'
		},
		'google': {
			selector: 'body.fancy-web-link .external-link[href^="https://"][href*="google.com"]:not([href*="docs.google.com"]):not([href*="cloud.google.com"])'
		},
		'googledocs': {
			selector: 'body.fancy-web-link .external-link[href^="https://"][href*="docs.google.com"]'
		},
		'googlecloud': {
			selector: 'body.fancy-web-link .external-link[href^="https://"][href*="cloud.google.com"]'
		}
	}
};

// CSS 选择器常量
const CSS_SELECTORS = {
	URL_SCHEME: 'body.fancy-url-scheme .external-link',  // 依赖 fancy-url-scheme 类
	WEB_LINK: 'body.fancy-web-link .external-link[href^="https://"]',  // 依赖 fancy-web-link 类
	CUSTOM_DATA: '.external-link'
} as const;

// CSS 样式常量
const CSS_CONSTANTS = {
	ICON_SIZE: '0.8em',
	ICON_MARGIN: '3px',
	STYLE_ID: 'external-links-icon-styles'
} as const;

import { BUILTIN_ICONS } from './src/builtin-icons';

const DEFAULT_SETTINGS: ExternalLinksIconSettings = {
	icons: BUILTIN_ICONS,
	customIcons: {}
};


/**
 * 外部链接图标插件主类
 */
export default class ExternalLinksIcon extends Plugin {
	settings!: ExternalLinksIconSettings;
	private styleElement: HTMLStyleElement | null = null;
	private generatedCss: string = '';
	private mutationObserver: MutationObserver | null = null;
	private readonly SCAN_DEBOUNCE_KEY = 'scan-links';
	private observedRoots: Element[] = []; // roots we observe / scan within

	/**
	 * 插件加载
	 */
	async onload(): Promise<void> {
		try {
			await this.loadSettings();
			this.addSettingTab(new ExternalLinksIconSettingTab(this.app, this));
			this.applyIconStyles();
			// Setup a MutationObserver to annotate links dynamically when DOM changes occur
			try {
				this.mutationObserver = new MutationObserver((mutations) => {
				// Ignore mutation batches composed entirely of nodes we added/removed
				// (inline icon spans) to avoid self-triggered re-scans that produce
				// flicker or layout thrash (e.g. <p> re-rendering repeatedly).
				if (this.isOwnMutation(mutations)) return;
				this.scheduleScan();
			});
			// Observe only specific content containers to reduce noisy observations.
			// Common Obsidian view classes: preview/source views and generic view-content.
			const observeSelectors = ['.markdown-preview-view', '.markdown-source-view', '.view-content', '.workspace-leaf-content'];
			const roots = Array.from(document.querySelectorAll(observeSelectors.join(',')));
			if (roots.length) {
				this.observedRoots = roots;
				roots.forEach(r => {
					try { this.mutationObserver!.observe(r, { childList: true, subtree: true }); } catch (e) { /* ignore root observe errors */ }
				});
				// Also observe body class changes (theme/layout toggles)
				try { this.mutationObserver!.observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* ignore */ }
			} else {
				// Fallback: observe body but avoid observing attributes broadly to reduce noise.
				this.observedRoots = [];
				try { this.mutationObserver!.observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
			}
			// Watch workspace events for leaf/layout changes to trigger scans reliably
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleScan()));
			this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleScan()));

				this.scheduleScan();
			} catch (e) {
				// If DOM isn't ready or observation isn't allowed, fallback to a one-off scan
				this.scanAndAnnotateLinks();
			}
		} catch (error) {
			console.error('External Links Icon plugin failed to load:', error);
		}
	}

	/**
	 * 插件卸载
	 */
	onunload(): void {
		this.removeIconStyles();
	}

	/**
	 * 加载设置
	 */
	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.validateAndFixSettings();
	}

	/**
	 * 验证和修复设置
	 */
	private validateAndFixSettings(): void {
		let order = 0;
		for (const key in this.settings.customIcons) {
			if (Object.prototype.hasOwnProperty.call(this.settings.customIcons, key)) {
				const icon = this.settings.customIcons[key];
				
				// 修复缺失的 order 属性
				if (typeof icon.order !== 'number') {
					icon.order = order++;
				}
				
				// 修复缺失的 linkType 属性
				if (!icon.linkType) {
					icon.linkType = 'url';
				}
				
				// 验证 SVG 数据
				if (!icon.svgData || !this.isValidSvgData(icon.svgData)) {
					icon.svgData = this.getDefaultSvgData();
				}
			}
		}
	}

	/**
	 * 验证 SVG 数据是否有效
	 */
	private isValidSvgData(svgData: string): boolean {
		return svgData.trim().startsWith('<svg') || svgData.startsWith('data:image/svg+xml');
	}

	/**
	 * 获取默认 SVG 数据
	 */
	getDefaultSvgData(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>';
	}

	/**
	 * 保存设置
	 */
	async saveSettings(): Promise<void> {
		try {
			await this.saveData(this.settings);
			this.applyIconStyles();
		} catch (error) {
			console.error('Failed to save settings:', error);
		}
	}

	/**
	 * 移除图标样式
	 */
	private removeIconStyles(): void {
		// Do not remove or manage a runtime <style> element. Generated CSS is
		// stored in memory and can be used by a future implementation that avoids
		// creating DOM style nodes.
		this.generatedCss = '';
		// Remove any inserted inline icon elements
		document.querySelectorAll('.external-links-icon-inline').forEach(el => el.remove());
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
	}

	/**
	 * 应用图标样式
	 */
	private applyIconStyles(): void {
		// Avoid creating and appending <style> elements at runtime. For now we
		// generate CSS into a string that can be reviewed or used by a future
		// mechanism that does not rely on inserting DOM style nodes.
		this.generatedCss = this.generateCSS();
		// After settings or icons change, re-scan the document and inject per-link
		// inline icon elements (this avoids creating a <style> element with
		// per-icon background rules at runtime).
		this.scheduleScan();
	}

	/**
	 * 生成完整的 CSS 内容
	 */
	private generateCSS(): string {
		const cssRules: string[] = [];
		
		// 添加基础样式
		cssRules.push(this.getBaseCSSRules());
		
		// 按顺序生成预定义图标CSS
		const predefinedIcons = this.getSortedIcons(DEFAULT_SETTINGS.icons || {});
		predefinedIcons.forEach(icon => {
			cssRules.push(this.generateIconCSS(icon));
		});
		
		// 按顺序生成自定义图标CSS
		const customIcons = this.getSortedIcons(this.settings.customIcons || {});
		customIcons.forEach(icon => {
			cssRules.push(this.generateIconCSS(icon));
		});
		
		return cssRules.filter(rule => rule.trim()).join('\n');
	}

	/**
	 * 获取基础 CSS 规则
	 */
	private getBaseCSSRules(): string {
		// The global `body .external-link::after` rule has been removed so that
		// only links with an associated icon receive the pseudo-element. The
		// per-icon generator emits the ::after base rules next to each matching
		// selector in `generateSingleThemeCSS` / `generateThemeSpecificCSS`.
		return '';
	}

	/**
	 * 获取按顺序排列的图标列表
	 */
	private getSortedIcons(icons: Record<string, IconItem>): IconItem[] {
		return Object.values(icons).sort((a, b) => (a.order || 0) - (b.order || 0));
	}

	/**
	 * 为单个图标生成 CSS 规则
	 */
	private generateIconCSS(icon: IconItem): string {
		try {
			const encodedSvg = this.encodeSvgData(icon.svgData);
			
			// 处理深色主题图标
			if (icon.themeDarkSvgData) {
				return this.generateThemeSpecificCSS(icon, encodedSvg);
			}
			
			return this.generateSingleThemeCSS(icon, encodedSvg);
		} catch (error) {
			console.warn(`Failed to generate CSS for icon '${icon.name}':`, error);
			return '';
		}
	}

	/**
	 * 生成支持主题切换的 CSS
	 */
	private generateThemeSpecificCSS(icon: IconItem, lightEncodedSvg: string): string {
		try {
			const darkEncodedSvg = icon.themeDarkSvgData ? this.encodeSvgData(icon.themeDarkSvgData) : undefined;
			const selector = this.getIconSelector(icon);

			// Also emit rules to remove the default background/padding on matched links
			// so the icon can replace the link suffix. These are emitted per-selector
			// rather than globally to preserve Obsidian defaults for non-matching links.
			const baseAfter = `content: " "; display: inline-block; width: ${CSS_CONSTANTS.ICON_SIZE}; height: ${CSS_CONSTANTS.ICON_SIZE}; margin-left: ${CSS_CONSTANTS.ICON_MARGIN}; background-size: contain; background-repeat: no-repeat; background-position: center; vertical-align: middle;`;

			// Helper: if a selector already targets the <body> (e.g. starts with "body.")
			// we should merge the theme class into that same body selector (so that
			// we end up with `body.theme-light.fancy-...` instead of
			// `body.theme-light body.fancy-...`). Support comma-separated selectors.
			const wrapWithTheme = (sel: string, themeClass: string) => {
				return sel.split(',').map(s => {
					s = s.trim();
					if (/^body\b/.test(s)) {
						return s.replace(/^body\b/, `body.${themeClass}`);
					}
					return `body.${themeClass} ${s}`;
				}).join(', ');
			};

			const lightSelector = wrapWithTheme(selector, 'theme-light');
			const darkSelector = wrapWithTheme(selector, 'theme-dark');

			return `
				${lightSelector} { background: none; padding-right: 0; }
				${darkSelector} { background: none; padding-right: 0; }
				${lightSelector}::after { ${baseAfter} background-image: url("${lightEncodedSvg}"); }
				${darkSelector}::after { ${baseAfter} background-image: url("${darkEncodedSvg}"); }
			`;
		} catch (error) {
			console.warn(`Failed to generate theme-specific CSS for icon '${icon.name}':`, error);
			return this.generateSingleThemeCSS(icon, lightEncodedSvg);
		}
	}

	/**
	 * 生成单主题 CSS
	 */
	private generateSingleThemeCSS(icon: IconItem, encodedSvg: string): string {
		const selector = this.getIconSelector(icon).trim();
		// Emit per-selector padding/background removal so only matched links lose
		// the default suffix. Also emit the full ::after base rules so only
		// matched selectors receive the pseudo-element (and its sizing).
		const baseAfter = `content: " "; display: inline-block; width: ${CSS_CONSTANTS.ICON_SIZE}; height: ${CSS_CONSTANTS.ICON_SIZE}; margin-left: ${CSS_CONSTANTS.ICON_MARGIN}; background-size: contain; background-repeat: no-repeat; background-position: center; vertical-align: middle;`;

		// If the selector contains commas, emit rules for each part cleanly.
		const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
		const rules: string[] = [];
		for (const p of parts) {
			rules.push(`${p} { background: none; padding-right: 0; }`);
			rules.push(`${p}::after { ${baseAfter} background-image: url("${encodedSvg}"); }`);
		}
		return rules.join('\n');
	}

	/**
	 * Determine whether the provided MutationRecords are only changes created
	 * by this plugin (adding/removing our `.external-links-icon-inline` nodes).
	 * If so, the observer can safely ignore them to avoid infinite scan loops.
	 */
	private isOwnMutation(mutations: MutationRecord[]): boolean {
		for (const m of mutations) {
			if (m.type === 'childList') {
				for (const n of Array.from(m.addedNodes)) {
					if (n.nodeType !== Node.ELEMENT_NODE) return false;
					const el = n as Element;
					// If the added node is our inline icon (or contains one), treat as own
					if (el.matches && (el.matches('.external-links-icon-inline') || el.querySelector('.external-links-icon-inline'))) {
						continue;
					}
					// Any other added node => not our own mutation
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
				// attributes or other mutation types: don't ignore (be conservative)
				return false;
			}
		}
		return true;
	}

	/**
	 * Schedule a debounced scan of the document to annotate links with icon
	 * elements. We reuse the existing debounceTimers map to avoid introducing
	 * a new debounce implementation.
	 */
	private scanTimerId: number | null = null;

	private scheduleScan(delay: number = 180): void {
		if (this.scanTimerId) {
			window.clearTimeout(this.scanTimerId);
			this.scanTimerId = null;
		}
		this.scanTimerId = window.setTimeout(() => {
			this.scanTimerId = null;
			this.scanAndAnnotateLinks();
		}, delay);
	}

	/**
	 * Scan the document and annotate matching links with an inline icon
	 * element (a <span><img/></span>). This avoids runtime style injection by
	 * attaching actual elements with data-uris for SVG.
	 */
	private scanAndAnnotateLinks(): void {
		try {
			// Remove any previous inline icon elements and rebuild fresh.
			document.querySelectorAll('.external-links-icon-inline').forEach(el => el.remove());
			// Remove any suffix-hiding class previously added to links
			document.querySelectorAll('.external-link.external-links-icon-hide-suffix').forEach(el => el.classList.remove('external-links-icon-hide-suffix'));

			// Combine built-in and custom icons in order
			const applied = new Set<Element>();
			const icons = this.getSortedIcons(DEFAULT_SETTINGS.icons || {}).concat(this.getSortedIcons(this.settings.customIcons || {}));

			// If there are no icons configured anywhere (unlikely), skip scanning.
			if (!icons.length) return;

			for (const icon of icons) {
				const selector = this.getIconSelector(icon).trim();
				if (!selector) continue;
				// If we have specific roots observed, scope the query inside them; otherwise query document-wide
				const rootSources = (this.observedRoots && this.observedRoots.length) ? this.observedRoots : [document];
				for (const root of rootSources) {
					let elements: NodeListOf<Element> = (root === document ? document.querySelectorAll(selector) : (root as Element).querySelectorAll(selector));
					if (!elements || elements.length === 0) continue;
					for (const el of Array.from(elements)) {
						if (applied.has(el)) continue; // earlier icon takes precedence
						if (!(el instanceof HTMLElement)) continue;
						// create icon span
						const span = document.createElement('span');
						span.className = 'external-links-icon-inline';
						span.setAttribute('data-icon', icon.name);

						// prepare SVG for current link container (respect theme)
						const svgSource = (preferDarkThemeFromDocument() && icon.themeDarkSvgData) ? icon.themeDarkSvgData : icon.svgData || '';
						const prepared = prepareSvgForSettings(svgSource, el as HTMLElement);
						const img = document.createElement('img');
						// Decorative image: hide from assistive tech and avoid focusability
						img.alt = '';
						img.setAttribute('aria-hidden', 'true');
						img.setAttribute('role', 'presentation');
						img.setAttribute('focusable', 'false');
						img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
						span.appendChild(img);
						span.setAttribute('aria-hidden', 'true');
						span.setAttribute('role', 'presentation');
						span.tabIndex = -1;

						// Prefer inserting the icon as a sibling immediately after the link
					// so link internals are not mutated and click areas remain stable.
					try {
						(el as HTMLElement).insertAdjacentElement('afterend', span);
						// If this icon is a URL scheme (built-in or custom), hide the default suffix on the link
						if (icon.linkType === 'scheme') {
							const isBuiltInScheme = Boolean((DEFAULT_SETTINGS.icons || {})[icon.name]);
							const isCustomScheme = Boolean(this.settings?.customIcons?.[icon.name]);
							if (isBuiltInScheme || isCustomScheme) {
								(el as HTMLElement).classList.add('external-links-icon-hide-suffix');
							}
						}
					} catch (e) {
						// Fallback: append inside link (older behavior)
						try { (el as HTMLElement).appendChild(span); } catch (e2) { continue; }
					}

					applied.add(el);
					}
				}
			}
		} catch (e) {
			console.error('Failed to scan and annotate links for icons:', e);
		}
	}

	/**
	 * 获取图标的 CSS 选择器
	 */
	private getIconSelector(icon: IconItem): string {
		// Special icons (advanced handling via predefined selectors) should
		// take precedence over generic scheme matching so that advanced-uri
		// selectors (which target specific query params) are favored.
		if (this.isSpecialIcon(icon.name)) {
			// Return the stored selector but strip any trailing `:after` markers
			// because the per-icon generator will attach ::after itself.
			return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
		}

		// URL Scheme 类型 - 使用 target 作为 scheme 标识符
		if (icon.linkType === 'scheme') {
			const scheme = icon.target || icon.name;
			return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
		}

		// Web 图标 - 检查是否为特殊 Web 图标
		// 先检查 SPECIAL 配置，如果存在则使用特殊选择器
		if (this.isSpecialWebIcon(icon.name)) {
			return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
		}

		// Web 图标 - 预定义的映射
		const domain = this.getWebDomain(icon.name);
		if (domain) {
			return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
		}

		// URL 类型的自定义图标 - 使用 target 作为域名匹配
		if (icon.linkType === 'url') {
			const domain = icon.target || icon.name;
			return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
		}

		// URL Scheme 图标（兼容遗留）- 但只针对未明确指定 linkType 的情况
		if (this.isUrlSchemeIcon(icon.name) && !icon.linkType) {
			const scheme = icon.target || icon.name;
			return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
		}

		// 兜底：自定义数据属性
		return `${CSS_SELECTORS.CUSTOM_DATA}[data-icon="${icon.name}"]`;
	}

	/**
	 * 检查是否为特殊图标
	 */
	private isSpecialIcon(iconName: string): iconName is keyof typeof ICON_CATEGORIES.SPECIAL {
		return iconName in ICON_CATEGORIES.SPECIAL;
	}

	/**
	 * 检查是否为特殊 Web 图标
	 */
	private isSpecialWebIcon(iconName: string): boolean {
		// 检查是否在 SPECIAL 配置中且不是 URL Scheme
		return iconName in ICON_CATEGORIES.SPECIAL && !ICON_CATEGORIES.URL_SCHEME.includes(String(iconName));
	}

	/**
	 * 检查是否为 URL Scheme 图标
	 */
	private isUrlSchemeIcon(iconName: string): boolean {
	return ICON_CATEGORIES.URL_SCHEME.includes(String(iconName));
	}

	/**
	 * 获取 Web 图标的域名
	 */
	private getWebDomain(iconName: string): string | undefined {
		return ICON_CATEGORIES.WEB[iconName as keyof typeof ICON_CATEGORIES.WEB];
	}

	/**
	 * 编码 SVG 数据为数据 URL
	 */
	private encodeSvgData(svgData: string): string {
		if (!svgData) {
			throw new Error('SVG data is empty');
		}

		// 已经是数据 URL
		if (svgData.startsWith('data:image/svg+xml')) {
			return svgData;
		}
		
		// SVG 标签
		if (svgData.trim().startsWith('<svg')) {
			try {
				return `data:image/svg+xml,${encodeURIComponent(svgData.trim())}`;
			} catch (error) {
				console.warn('Failed to encode SVG data:', error);
				throw new Error('Invalid SVG data format');
			}
		}
		
		// 不支持的格式
		throw new Error(`Unsupported SVG data format: ${svgData.substring(0, 50)}...`);
	}
}

/**
 * 外部链接图标设置面板
 */
class ExternalLinksIconSettingTab extends PluginSettingTab {
	plugin: ExternalLinksIcon;
	private debounceTimers: Map<string, number> = new Map();

	constructor(app: App, plugin: ExternalLinksIcon) {
		super(app, plugin);
		this.plugin = plugin;
	}



	/**
	 * 显示设置界面
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 主标题
		containerEl.createEl('h2', { text: 'External Links Icon Settings' });

		// 第一板块：Add new icon（标题 + 右侧按钮）和说明
		this.createAddIconButton(containerEl);
		containerEl.createEl('div', { text: 'Add website or URL scheme icon. Name must be unique.' });

		// 第二板块：WebSite
		this.displayWebsiteSection(containerEl);

		// 第三板块：URL Scheme
		this.displayURLSchemeSection(containerEl);
	}

	/**
	 * 显示 Website 类型图标区域
	 */
	private displayWebsiteSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'WebSite' });
		containerEl.createEl('div', { text: 'WebSite icons are matched by domain. When adding a website-type icon, provide a unique name and the domain (e.g. "baidu.com").' });
		

	// 内置 Website 图标（只读，默认折叠）
	const builtInWrap = containerEl.createDiv({ cls: 'website-builtins' });
	const builtinsDetails = builtInWrap.createEl('details', { cls: 'builtin-list' });
	builtinsDetails.createEl('summary', { text: 'Built-in' });
	const builtinRow = builtinsDetails.createDiv({ cls: 'builtin-row' });


		// Render built-in website icons from DEFAULT_SETTINGS only (built-ins are read-only in Settings)
		// This ensures Settings preview matches official built-in variants and is not affected by user overrides.
		const builtinIconsMap: Record<string, IconItem> = Object.assign({}, DEFAULT_SETTINGS.icons || {});
		const builtinIcons = Object.values(builtinIconsMap)
			.sort((a: IconItem, b: IconItem) => (a.order || 0) - (b.order || 0))
			.filter((ic: IconItem) => ic.linkType === 'url');
		builtinIcons.forEach((icon: IconItem) => {
			const box = builtinRow.createDiv({ cls: 'website-item' });

			const iconEl = box.createDiv({ cls: 'item-icon' });
			try {
				// Prefer explicit document theme: when document indicates light, always use svgData;
				// when document indicates dark, prefer themeDarkSvgData if available.
				const preferDark = preferDarkThemeFromDocument();
				let svgSource: string;
				if (!preferDark) {
					svgSource = icon.svgData || icon.themeDarkSvgData || '';
				} else {
					svgSource = icon.themeDarkSvgData || icon.svgData || '';
				}
				const img = document.createElement('img');
				const prepared = prepareSvgForSettings(svgSource, iconEl);
				img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
				img.alt = icon.name || '';
				iconEl.appendChild(img);
			} catch (e) {
				console.warn('Failed to render builtin website preview', e);
				iconEl.textContent = '🔗';
			}

			box.createSpan({ text: icon.name });
		});

		// 自定义 Website 图标（可编辑）
		const customIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'url');
		if (customIcons.length > 0) {
			const customWrap = containerEl.createDiv({ cls: 'website-custom' });
			customWrap.createEl('h4', { text: 'Custom' });
			customIcons.forEach((icon, idx) => {
				this.createIconSetting(customWrap, icon, idx);
			});
		} else {
			containerEl.createEl('div', { text: 'No custom website icons yet.' });
		}
	}

	/**
	 * 显示 URL Scheme 说明区域
	 */
	private displayURLSchemeSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'URL Scheme' });
		containerEl.createEl('div', { text: 'URL Scheme icons are matched by a scheme identifier. When adding a scheme-type icon, provide a unique name and the scheme identifier (e.g. "zotero").' });

	// Built-in scheme icons (read-only, default collapsed)
	const builtInWrap = containerEl.createDiv({ cls: 'scheme-builtins' });
	const builtinsDetails = builtInWrap.createEl('details', { cls: 'builtin-list' });
	builtinsDetails.createEl('summary', { text: 'Built-in' });
	const builtinRow = builtinsDetails.createDiv({ cls: 'builtin-row' });


		// For built-in scheme icons use DEFAULT_SETTINGS first (built-ins are read-only in Settings)
		(ICON_CATEGORIES.URL_SCHEME || []).forEach(key => {
			const icon = (DEFAULT_SETTINGS.icons || {})[key] || (this.plugin.settings.icons || {})[key];
			if (icon) {
				const box = builtinRow.createDiv({ cls: 'scheme-item' });

				const iconEl = box.createDiv({ cls: 'item-icon' });
				try {
					const preferDark = preferDarkThemeFromDocument();
					// Explicitly prefer the light `svgData` when the document indicates light theme
					// to avoid accidentally showing a dark variant in the Settings preview.
					let svgSource: string;
					if (!preferDark) {
						svgSource = icon.svgData || icon.themeDarkSvgData || '';
					} else {
						svgSource = icon.themeDarkSvgData || icon.svgData || '';
					}
					const img = document.createElement('img');
					const prepared = prepareSvgForSettings(svgSource, iconEl);
					img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
					img.alt = icon.name || '';

					iconEl.appendChild(img);
				} catch (e) {
					console.warn('Failed to render builtin scheme preview', e);
					iconEl.textContent = '🔗';
				}
				box.createSpan({ text: icon.name + (icon.target ? ` — ${icon.target}` : '') });
			}
		});

		// Custom scheme icons (editable)
		const customSchemeIcons = this.getSortedCustomIcons().filter(ic => ic.linkType === 'scheme');
		if (customSchemeIcons.length > 0) {
			const customWrap = containerEl.createDiv({ cls: 'scheme-custom' });
			customWrap.createEl('h4', { text: 'Custom' });
			customSchemeIcons.forEach((icon, idx) => {
				this.createIconSetting(customWrap, icon, idx);
			});
		} else {
			containerEl.createEl('div', { text: 'No custom URL Scheme icons yet.' });
		}
	}

	/**
	 * 创建添加图标按钮
	 */
	private createAddIconButton(containerEl: HTMLElement): void {
		const s = new Setting(containerEl).setName('Add new icon').setHeading();
		const btnContainer = s.controlEl.createDiv({ cls: 'add-buttons' });

		const addWebsiteBtn = document.createElement('button');
		addWebsiteBtn.textContent = 'Add Website';
		addWebsiteBtn.onclick = () => {
			const modal = new NewIconModal(this.app, (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => this.addIconWithData(data), 'url');
			modal.open();
		};
		btnContainer.appendChild(addWebsiteBtn);

		const addSchemeBtn = document.createElement('button');
		addSchemeBtn.textContent = 'Add URL Scheme';
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
		const maxOrder = Object.values(customIcons).reduce((max, ic) => Math.max(max, ic.order || 0), -1);

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
	 * 获取按顺序排列的自定义图标
	 */
	private getSortedCustomIcons(): IconItem[] {
		return Object.values(this.plugin.settings.customIcons || {})
			.sort((a, b) => (a.order || 0) - (b.order || 0));
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

		// Prefer theme-specific dark svg if document indicates dark theme.
		// Explicitly prefer the light `svgData` when the document indicates light theme to avoid
		// accidentally selecting a dark variant when the Settings page is in light mode.
		const preferDark = preferDarkThemeFromDocument();
		let svgToRender: string;
		if (!preferDark) {
			// Document explicitly light: always use svgData (fallback to themeDarkSvgData only if svgData absent)
			svgToRender = effectiveIcon.svgData || effectiveIcon.themeDarkSvgData || '';
		} else {
			// Document dark or system prefers dark: use themeDarkSvgData when available
			svgToRender = effectiveIcon.themeDarkSvgData || effectiveIcon.svgData || '';
		}

		try {
			const prepared = prepareSvgForSettings(svgToRender || effectiveIcon.svgData || '', previewIcon);
			// (diagnostic logging removed)
			// insert as an <img> so that IDs/defs inside the svg won't conflict with page
			const img = document.createElement('img');
			img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
			img.alt = icon.name || '';
			previewIcon.appendChild(img);
			// no debug badge
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
				text.setPlaceholder('example.com')
					.setValue(icon.target || '')
					.onChange((value) => {
						this.debounceUpdateTarget(icon.name, value);
					});
			});
		} else {
			// Scheme custom icons: only editable scheme identifier (protocol).
			// Icon ID (name) is shown in the preview area and should not be editable here.
			settingItem.addText(text => {
				text.setPlaceholder('scheme (e.g. zotero)')
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

		const newTimerId = window.setTimeout(async () => {
			const icons = this.plugin.settings.customIcons || {};
			if (icons[name]) {
				icons[name].target = newTarget.trim();
				await this.plugin.saveSettings();
				this.display();
			}
			this.debounceTimers.delete(`target-${name}`);
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
		
		const newTimerId = window.setTimeout(async () => {
			if (newName !== oldName && newName.trim()) {
				await this.renameIcon(oldName, newName.trim());
				this.display();
			}
			this.debounceTimers.delete(oldName);
		}, 500);
		
		this.debounceTimers.set(oldName, newTimerId);
	}

	/**
	 * 添加链接类型下拉框
	 */
	private addLinkTypeDropdown(settingItem: Setting, icon: IconItem): void {
		settingItem.addDropdown(dropdown => dropdown
			.addOption('url', 'Website')
			.addOption('scheme', 'URL Scheme')
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

		// reassign orders within this group starting from 0 (but we'll offset to avoid overlap with other group's orders)
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
		// Keep groups contiguous by linkType: url first, then scheme
		const linkOrder: LinkType[] = ['url', 'scheme'];
		let idx = 0;
		linkOrder.forEach(lt => {
			combined
				.filter(i => i.linkType === lt)
				.sort((a, b) => (a.order || 0) - (b.order || 0))
				.forEach(it => {
					it.order = idx++;
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

	/**
	 * 验证是否为有效的 SVG 文件
	 */
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

	/**
	 * 添加新图标
	 */
	private async addIcon(): Promise<void> {
		const timestamp = Date.now();
		const newIconName = `new-icon-${timestamp}`;
		const customIcons = this.plugin.settings.customIcons || {};
		
		// 计算新图标的顺序
		const maxOrder = Object.values(customIcons)
			.reduce((max, icon) => Math.max(max, icon.order || 0), -1);

		// 创建新图标
		customIcons[newIconName] = {
			name: newIconName,
			svgData: this.plugin.getDefaultSvgData(),
			order: maxOrder + 1,
			linkType: 'url'
		};

		this.plugin.settings.customIcons = customIcons;
		await this.plugin.saveSettings();
		this.display();
	}

	/**
	 * 清理资源
	 */
	onunload(): void {
		// 清理防抖动定时器
		this.debounceTimers.forEach(timerId => {
			window.clearTimeout(timerId);
		});
		this.debounceTimers.clear();
	}
}

/**
 * 简单确认模态，用于替换 window.confirm
 */
class ConfirmModal extends Modal {
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
		// ensure resolver called if modal closed by other means
		this._resolver(false);
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 新增图标弹窗
 */
class NewIconModal extends Modal {
	onSubmit: (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => void;

	constructor(app: App, onSubmit: (data: { linkType: LinkType; name: string; target: string; svgData?: string }) => void, defaultLinkType?: LinkType) {
		super(app);
		this.onSubmit = onSubmit;
		this._defaultLinkType = defaultLinkType || 'url';
	}

	private _defaultLinkType: LinkType = 'url';

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// 直接在 contentEl 上创建模态窗口内容，避免多层嵌套
		contentEl.createEl('h3', { text: 'Add new icon' });
		
		const descEl = contentEl.createEl('div', { text: 'Provide icon information. Name must be unique.', cls: 'external-links-icon-desc' });

		// Icon name input
		const nameInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		nameInput.placeholder = 'Icon name (unique)';
		nameInput.type = 'text';

		// Target input
		const targetInput = contentEl.createEl('input', { cls: 'external-links-icon-modal-input' });
		targetInput.placeholder = 'Website (e.g. baidu.com) or scheme (e.g. zotero)';
		targetInput.type = 'text';

		// Upload SVG controls
		let uploadedSvgData: string | undefined;
		const uploadRow = contentEl.createDiv({ cls: 'external-links-icon-upload-row' });

		const uploadBtn = uploadRow.createEl('button', { text: 'Upload SVG' });
		
		const uploadName = uploadRow.createSpan({ text: 'No file chosen' });
		
		const previewDiv = uploadRow.createDiv({ cls: 'external-links-icon-preview-div small' });

		const hiddenInput = document.createElement('input');
		hiddenInput.type = 'file';
		hiddenInput.accept = '.svg,image/svg+xml';
		hiddenInput.classList.add('external-links-icon-hidden-input');
		hiddenInput.onchange = async (ev) => {
			const files = (ev.target as HTMLInputElement).files;
			if (!files || files.length === 0) return;
			const file = files[0];
			// basic validation
			if (!(file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
				new Notice('Please select a valid SVG file.');
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const content = (typeof reader.result === 'string') ? reader.result : '';
				if (content.trim().startsWith('<svg') && content.includes('</svg>')) {
					const sanitized = sanitizeSvg(content);
					uploadedSvgData = sanitized;
					uploadName.textContent = file.name;
					try {
						const prepared = prepareSvgForSettings(sanitized, previewDiv);
						const img = document.createElement('img');
						img.src = `data:image/svg+xml;utf8,${encodeURIComponent(prepared)}`;
						img.alt = file.name;
						
						
						
						
						// Clear preview safely instead of assigning to innerHTML
					while (previewDiv.firstChild) {
						previewDiv.removeChild(previewDiv.firstChild);
					}
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

		// set placeholder based on default type
		const defaultType = this._defaultLinkType || 'url';
		targetInput.placeholder = defaultType === 'url' ? 'Domain (e.g. baidu.com or https://baidu.com)' : 'Scheme identifier (e.g. zotero)';

		// Action buttons
		const buttonContainer = contentEl.createDiv({ cls: 'external-links-icon-modal-actions' });

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => { this.close(); };

		const addBtn = buttonContainer.createEl('button', { text: 'Add icon' });
		addBtn.onclick = () => {
			const name = (nameInput as HTMLInputElement).value.trim();
			let target = (targetInput as HTMLInputElement).value.trim();
			if (!name) { new Notice('Name is required'); return; }
			if (!target) { new Notice('Target is required'); return; }
			// Normalize website target by removing leading protocol and trailing slash
			if (this._defaultLinkType === 'url') {
				target = target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
			}
			this.onSubmit({ linkType: this._defaultLinkType, name, target, svgData: uploadedSvgData });
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
