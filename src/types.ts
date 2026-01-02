// Shared types for the plugin (migrated from top-level `main.ts`)
export type LinkType = 'url' | 'scheme';

export interface IconItem {
	name: string;
	svgData: string;
	order: number;
	linkType: LinkType;
	themeDarkSvgData?: string;
	// target stores website domain (e.g. "baidu.com") or scheme identifier (e.g. "bear")
	target?: string;
}

export interface ExternalLinksIconSettings {
	icons: Record<string, IconItem>;
	customIcons: Record<string, IconItem>;
}

export interface SpecialIconConfig {
	selector: string;
}

export interface IconCategories {
	URL_SCHEME: readonly string[];
	WEB: Record<string, string>;
	SPECIAL: Record<string, SpecialIconConfig>;
}
