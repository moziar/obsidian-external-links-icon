export type LinkType = 'url' | 'scheme';

export interface IconItem {
	id: string;
	name: string;
	svgData: string;
	order: number;
	linkType: LinkType;
	themeDarkSvgData?: string;
	target?: string;
}

export interface ExternalLinksIconSettings {
	icons: Record<string, IconItem>;
	customIcons: Record<string, IconItem>;
	language: string;
	fancyUrlScheme: boolean;
	fancyWebLink: boolean;
	fancyObsidianWebLink: boolean;
	fancyObsidianNoteLink: 'none' | 'internal' | 'external' | 'both';
	fancyAdvancedUriLink: boolean;
}
