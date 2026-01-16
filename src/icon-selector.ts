import { IconItem } from './types';
import { ICON_CATEGORIES, CSS_SELECTORS } from './constants';

/**
 * Generates the CSS selector for a given icon based on its type and properties.
 *
 * @param icon The icon item configuration
 * @returns The CSS selector string
 */
export function getIconSelector(icon: IconItem): string {
	if (isSpecialIcon(icon.name)) {
		return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
	}
	if (icon.linkType === 'scheme') {
		const scheme = icon.target || icon.name;
		return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
	}
	if (isSpecialWebIcon(icon.name)) {
		return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
	}
	const domain = getWebDomain(icon.name);
	if (domain) {
		return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
	}
	if (icon.linkType === 'url') {
		const domain = icon.target || icon.name;
		return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
	}
	// This block handles cases where linkType might be missing (legacy data) or if types are looser than defined.
	// We cast to 'any' to check for falsy linkType since TypeScript believes linkType is required.
	if (isUrlSchemeIcon(icon.name) && !(icon as Partial<IconItem>).linkType) {
		const scheme = icon.target || icon.name;
		return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
	}

	// Fix for "Invalid type 'never' of template literal expression".
	// TypeScript Control Flow Analysis determines that icon is 'never' here because 'linkType' is exhaustive ('url' | 'scheme').
	// We cast to IconItem to ensure we can access properties even if unreachable by strict types.
	return `${CSS_SELECTORS.CUSTOM_DATA}[data-icon="${(icon as IconItem).name}"]`;
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
	return ICON_CATEGORIES.WEB[iconName as keyof typeof ICON_CATEGORIES.WEB];
}
