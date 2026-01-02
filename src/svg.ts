// SVG utilities: sanitize and prepare SVG strings for use as inline images
export function sanitizeSvg(svg: string): string {
	let s = svg.trim();
	// remove xml prolog and doctype
	s = s.replace(/<\?xml[\s\S]*?\?>/i, '');
	s = s.replace(/<!DOCTYPE[\s\S]*?>/i, '');
	// remove script/style
	s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
	s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
	// Remove SVG <filter> definitions and any inline filter references
	s = s.replace(/<filter[\s\S]*?<\/filter>/gi, '');
	s = s.replace(/<feDropShadow[\s\S]*?>/gi, '');
	s = s.replace(/\sfilter=(?:"|')[^"']*(?:"|')/gi, '');
	s = s.replace(/filter:\s*[^;"']+;?/gi, '');
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

export function prepareSvgForSettings(svg: string, container: HTMLElement): string {
	let s = sanitizeSvg(svg);
	try {
		// Remove embedded media queries that react to system prefers-color-scheme
		s = s.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\}/gi, '');

		const comp = window.getComputedStyle(container);
		const color = comp && comp.color ? comp.color.trim() : '';

		if (color) {
			// replace occurrences of currentColor in attributes and inline styles
			s = s.replace(/currentColor/g, color);
		}

		// replace CSS variables used inside svg e.g. var(--accent)
		s = s.replace(/var\(--([a-zA-Z0-9-_]+)\)/g, (m, varName) => {
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

export function preferDarkThemeFromDocument(): boolean {
	const body = document.body;
	const isDarkByClass = body && body.classList ? body.classList.contains('theme-dark') : false;
	const isLightByClass = body && body.classList ? body.classList.contains('theme-light') : false;
	if (isDarkByClass) return true;
	if (isLightByClass) return false;
	return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
