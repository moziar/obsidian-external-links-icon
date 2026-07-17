const iconImageCache = new Map<string, { svgData: string; darkSvgData: string; light?: string; dark?: string }>();

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
			return `data:image/svg+xml;utf8,${encodeURIComponent(svgData)}`;
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

export function clearIconCache(key?: string): void {
	if (key) {
		iconImageCache.delete(key);
	} else {
		iconImageCache.clear();
	}
}

export function getCachedIconImage(
	key: string,
	svgData: string,
	darkSvgData: string | undefined,
	preferDark: boolean
): string {
	const normalizedSvg = svgData || '';
	const normalizedDark = darkSvgData || '';
	let existing = iconImageCache.get(key);
	if (!existing || existing.svgData !== normalizedSvg || existing.darkSvgData !== normalizedDark) {
		existing = { svgData: normalizedSvg, darkSvgData: normalizedDark };
		iconImageCache.set(key, existing);
	}
	if (preferDark && normalizedDark) {
		if (!existing.dark) existing.dark = encodeSvgData(normalizedDark);
		return existing.dark;
	}
	if (!existing.light) existing.light = encodeSvgData(normalizedSvg || normalizedDark);
	return existing.light;
}
