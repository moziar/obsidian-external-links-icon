import { IconItem } from './types';
import { ICON_CATEGORIES, CSS_SELECTORS } from './constants';

/**
 * Generates the CSS selector for a given icon based on its type and properties.
 *
 * @param icon The icon item configuration
 * @returns The CSS selector string
 */
export function getIconSelector(icon: IconItem): string {
	const name = icon.name;
	if (isSpecialIcon(name)) {
		return ICON_CATEGORIES.SPECIAL[name].selector.replace(/:?:after/g, '');
	}
	const linkType = (icon as Partial<IconItem>).linkType;
	if (linkType === 'scheme') {
		const scheme = icon.target || name;
		return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
	}
	if (isSpecialWebIcon(name)) {
		return ICON_CATEGORIES.SPECIAL[name as keyof typeof ICON_CATEGORIES.SPECIAL].selector.replace(/:?:after/g, '');
	}
	const domain = getWebDomain(name);
	if (domain) {
		return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
	}
	if (linkType === 'url') {
		const domain = icon.target || name;
		return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
	}
	// This block handles cases where linkType might be missing (legacy data) or if types are looser than defined.
	// We cast to 'any' to check for falsy linkType since TypeScript believes linkType is required.
	if (isUrlSchemeIcon(name) && !linkType) {
		const scheme = icon.target || name;
		return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
	}
	return `${CSS_SELECTORS.CUSTOM_DATA}[data-icon="${name}"]`;
}

function isSpecialIcon(iconName: string): iconName is keyof typeof ICON_CATEGORIES.SPECIAL {
	return iconName in ICON_CATEGORIES.SPECIAL;
}

function isSpecialWebIcon(iconName: string): boolean {
	return iconName in ICON_CATEGORIES.SPECIAL && !ICON_CATEGORIES.URL_SCHEME.includes(String(iconName));
}

function isUrlSchemeIcon(iconName: string): boolean {
	return ICON_CATEGORIES.URL_SCHEME.includes(String(iconName));
}

function getWebDomain(iconName: string): string | undefined {
	return ICON_CATEGORIES.WEB[iconName];
}
