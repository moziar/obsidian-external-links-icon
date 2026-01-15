// Utility helpers

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
