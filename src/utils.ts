const iconImageCache = new Map<string, { svgData: string; darkSvgData: string; light?: string; dark?: string }>();

export function minifySvg(svgData: string): string {
	if (!svgData) return '';
	return svgData
		.replace(/[\n\r\t]/g, '') // Remove newlines and tabs
		.replace(/\s+/g, ' ') // Collapse spaces
		.replace(/>\s+</g, '><') // Remove spaces between tags
		.replace(/<!--[\s\S]*?-->/g, '') // Remove comments
		.replace(/\s*xmlns:v="[^"]*"/g, '') // Remove Vecta namespace
		.trim();
}

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
			// Minify before encoding to save space
			const minified = minifySvg(svgData);
			return `data:image/svg+xml;utf8,${encodeURIComponent(minified)}`;
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
	if (!preferDark) {
		if (!existing.light) existing.light = encodeSvgData(normalizedSvg || normalizedDark);
		return existing.light;
	}
	if (!existing.light) existing.light = encodeSvgData(normalizedSvg || normalizedDark);
	return existing.light;
}
