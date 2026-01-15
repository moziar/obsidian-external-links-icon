const iconImageCache = new Map<string, { svgData: string; darkSvgData: string; light: string; dark: string }>();

export function encodeSvgData(svgData: string): string {
	if (!svgData) {
		throw new Error('SVG data is empty');
	}

	// Already a data URL
	if (svgData.startsWith('data:image/svg+xml')) {
		return svgData;
	}

	// Raw SVG
	if (svgData.trim().startsWith('<svg')) {
		try {
			return `data:image/svg+xml;utf8,${encodeURIComponent(svgData.trim())}`;
		} catch (error) {
			console.warn('Failed to encode SVG data:', error);
			throw new Error('Invalid SVG data format');
		}
	}

	throw new Error(`Unsupported SVG data format: ${svgData.substring(0, 50)}...`);
}

export function isValidSvgData(svgData: string): boolean {
	if (!svgData) return false;
	const s = svgData.trim();
	return s.startsWith('<svg') || s.startsWith('data:image/svg+xml');
}

export function getCachedIconImages(
	key: string,
	svgData: string,
	darkSvgData?: string
): { light: string; dark: string } {
	const normalizedSvg = svgData || '';
	const normalizedDark = darkSvgData || '';
	const existing = iconImageCache.get(key);
	if (existing && existing.svgData === normalizedSvg && existing.darkSvgData === normalizedDark) {
		return { light: existing.light, dark: existing.dark };
	}
	const encodedLight = encodeSvgData(normalizedSvg);
	const encodedDark = normalizedDark ? encodeSvgData(normalizedDark) : encodedLight;
	iconImageCache.set(key, {
		svgData: normalizedSvg,
		darkSvgData: normalizedDark,
		light: encodedLight,
		dark: encodedDark
	});
	return { light: encodedLight, dark: encodedDark };
}
