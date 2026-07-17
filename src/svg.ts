import type { IconItem } from './types';

export function minifySvg(svgData: string): string {
	if (!svgData) return '';
	return svgData
		.replace(/[\n\r\t]/g, ' ') // Replace newlines and tabs with space
		.replace(/\s+/g, ' ') // Collapse spaces
		.replace(/>\s+</g, '><') // Remove spaces between tags
		.replace(/<!--[\s\S]*?-->/g, '') // Remove comments
		.replace(/\s*xmlns:v="[^"]*"/g, '') // Remove Vecta namespace
		.trim();
}

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
	return minifySvg(s);
}

export function prepareSvgForSettings(svg: string, container: HTMLElement): string {
	let s = sanitizeSvg(svg);
	try {
		// Remove embedded media queries that react to system prefers-color-scheme
		s = s.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\}/gi, '');

		const comp = activeWindow.getComputedStyle(container);
		const color = comp && comp.color ? comp.color.trim() : '';

		if (color) {
			// replace occurrences of currentColor in attributes and inline styles
			s = s.replace(/currentColor/g, color);
		}

		// replace CSS variables used inside svg e.g. var(--accent)
		s = s.replace(/var\(--([a-zA-Z0-9-_]+)\)/g, (m, varName) => {
			const val1 = activeWindow.getComputedStyle(container).getPropertyValue(`--${varName}`) || '';
			const val2 = activeWindow.getComputedStyle(activeDocument.documentElement).getPropertyValue(`--${varName}`) || '';
			const val = (val1 || val2).trim();
			return val || m;
		});
	} catch {
		// ignore
	}
	return s;
}

export function preferDarkThemeFromDocument(): boolean {
	const body = activeDocument.body;
	const isDarkByClass = body && body.classList ? body.classList.contains('theme-dark') : false;
	const isLightByClass = body && body.classList ? body.classList.contains('theme-light') : false;
	if (isDarkByClass) return true;
	if (isLightByClass) return false;
	return !!(activeWindow.matchMedia && activeWindow.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function getSvgSourceForTheme(icon: IconItem, preferDark: boolean): string {
	if (!preferDark) {
		return icon.svgData || icon.themeDarkSvgData || '';
	}
	return icon.themeDarkSvgData || icon.svgData || '';
}

// ─── Background detection & removal ──────────────────────────────────────────

interface ViewBox { x: number; y: number; w: number; h: number }

let _normalizeCtx: CanvasRenderingContext2D | null = null;

/** Normalize any CSS color string to `#rrggbb`. Returns null for non-solid/non-opaque colors. */
function normalizeColor(color: string): string | null {
	if (!color) return null;
	const c = color.trim().toLowerCase();
	if (!c || c === 'none' || c === 'transparent' || c === 'currentcolor' || c === 'inherit' || c.startsWith('url(')) {
		return null;
	}
	try {
		if (!_normalizeCtx) {
			const canvas = activeDocument.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			_normalizeCtx = canvas.getContext('2d');
		}
		if (!_normalizeCtx) return null;
		_normalizeCtx.fillStyle = '#abcdef'; // sentinel
		_normalizeCtx.fillStyle = c;
		const result = _normalizeCtx.fillStyle;
		if (result === '#abcdef') return null; // invalid, kept previous
		// Modern browsers return #rrggbb for opaque, rgba(...) for alpha < 1
		const rgbaMatch = result.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
		if (rgbaMatch) {
			const alpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
			if (alpha < 1) return null; // skip semi-transparent
			const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
			const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
			const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
			return `#${r}${g}${b}`;
		}
		return result.toLowerCase();
	} catch {
		return null;
	}
}

function getViewBox(svg: Element): ViewBox | null {
	const viewBoxAttr = svg.getAttribute('viewBox');
	if (viewBoxAttr) {
		const parts = viewBoxAttr.split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts.every(n => !isNaN(n))) {
			return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
		}
	}
	const w = parseFloat(svg.getAttribute('width') || '');
	const h = parseFloat(svg.getAttribute('height') || '');
	if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
		return { x: 0, y: 0, w, h };
	}
	return null;
}

function bboxCoversViewBox(bbox: { x: number; y: number; w: number; h: number }, vb: ViewBox): boolean {
	const eps = 0.01;
	return bbox.x <= vb.x + eps
		&& bbox.y <= vb.y + eps
		&& bbox.x + bbox.w >= vb.x + vb.w - eps
		&& bbox.y + bbox.h >= vb.y + vb.h - eps;
}

function rectBBox(rect: Element, vb: ViewBox): { x: number; y: number; w: number; h: number } | null {
	const x = parseFloat(rect.getAttribute('x') || '0');
	const y = parseFloat(rect.getAttribute('y') || '0');
	if (isNaN(x) || isNaN(y)) return null;
	const wAttr = rect.getAttribute('width');
	const hAttr = rect.getAttribute('height');
	const w = wAttr === '100%' ? vb.w : parseFloat(wAttr || '');
	const h = hAttr === '100%' ? vb.h : parseFloat(hAttr || '');
	if (isNaN(w) || isNaN(h)) return null;
	return { x, y, w, h };
}

/**
 * Compute bounding box of a `<path>` by parsing its `d` attribute.
 * Only handles line commands (M/L/H/V/Z) — returns null if curve commands
 * (C/Q/A/S/T) are present, since control points give unreliable bounds.
 */
function pathBBox(d: string): { x: number; y: number; w: number; h: number } | null {
	// Skip paths with curve commands — bbox would be unreliable
	if (/[CcQqAaSsTt]/.test(d)) return null;

	const tokens = d.match(/([a-zA-Z]+)|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi);
	if (!tokens || tokens.length < 3) return null;

	let x = 0, y = 0;
	let startX = 0, startY = 0;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

	const update = (px: number, py: number) => {
		if (px < minX) minX = px;
		if (py < minY) minY = py;
		if (px > maxX) maxX = px;
		if (py > maxY) maxY = py;
	};

	let prevCmd = '';
	let i = 0;

	while (i < tokens.length) {
		const tok = tokens[i];
		if (/^[a-zA-Z]+$/.test(tok)) {
			prevCmd = tok;
			i++;
			if (prevCmd === 'Z' || prevCmd === 'z') {
				x = startX;
				y = startY;
				continue;
			}
		} else {
			// implicit command repetition — keep prevCmd
		}

		const cmd = prevCmd;
		if (!cmd) break;
		const isUpper = cmd === cmd.toUpperCase();

		// collect all numbers for this command
		const nums: number[] = [];
		while (i < tokens.length && /^-?\d*\.?\d/.test(tokens[i])) {
			nums.push(parseFloat(tokens[i]));
			i++;
		}

		switch (cmd.toUpperCase()) {
			case 'M': {
				for (let j = 0; j + 1 < nums.length; j += 2) {
					const nx = isUpper ? nums[j] : x + nums[j];
					const ny = isUpper ? nums[j + 1] : y + nums[j + 1];
					x = nx; y = ny;
					if (j === 0) { startX = x; startY = y; }
					update(x, y);
				}
				prevCmd = isUpper ? 'L' : 'l';
				break;
			}
			case 'L': {
				for (let j = 0; j + 1 < nums.length; j += 2) {
					const nx = isUpper ? nums[j] : x + nums[j];
					const ny = isUpper ? nums[j + 1] : y + nums[j + 1];
					x = nx; y = ny;
					update(x, y);
				}
				break;
			}
			case 'H': {
				for (let j = 0; j < nums.length; j++) {
					x = isUpper ? nums[j] : x + nums[j];
					update(x, y);
				}
				break;
			}
			case 'V': {
				for (let j = 0; j < nums.length; j++) {
					y = isUpper ? nums[j] : y + nums[j];
					update(x, y);
				}
				break;
			}
			default:
				break;
		}
	}

	if (minX === Infinity) return null;
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Structure-based detection: parse SVG XML, find a `<rect>`/`<path>` (or `<svg>` background style)
 * that covers the entire viewBox with a solid opaque fill. Synchronous, fast.
 */
function detectBackgroundByStructure(svgString: string): { color: string; element: Element; doc: Document } | null {
	let doc: Document;
	try {
		doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
	} catch {
		return null;
	}
	if (doc.querySelector('parsererror')) return null;
	const svg = doc.documentElement;
	if (!svg || svg.tagName.toLowerCase() !== 'svg') return null;

	const viewBox = getViewBox(svg);
	if (!viewBox) return null;

	// Check <svg> own background style
	const svgStyle = svg.getAttribute('style') || '';
	if (svgStyle) {
		const bgMatch = svgStyle.match(/background(?:-color)?\s*:\s*([^;]+)/i);
		if (bgMatch) {
			const color = normalizeColor(bgMatch[1].trim());
			if (color) return { color, element: svg, doc };
		}
	}

	// Check <rect> and <path> elements
	const filledShapes = svg.querySelectorAll('rect, path');
	let found: { color: string; element: Element; doc: Document } | null = null;
	filledShapes.forEach(el => {
		if (found) return;
		const fill = el.getAttribute('fill');
		if (!fill || fill.toLowerCase() === 'none') return;
		const color = normalizeColor(fill);
		if (!color) return; // skip gradients/patterns/currentColor

		const tag = el.tagName.toLowerCase();
		let bbox: { x: number; y: number; w: number; h: number } | null = null;
		if (tag === 'rect') {
			bbox = rectBBox(el, viewBox);
		} else if (tag === 'path') {
			const d = el.getAttribute('d');
			if (!d) return;
			bbox = pathBBox(d);
		}
		if (bbox && bboxCoversViewBox(bbox, viewBox)) {
			found = { color, element: el, doc };
		}
	});
	return found;
}

/**
 * Structure-based background removal: parse SVG XML and remove any `<rect>`/`<path>`
 * (or `<svg>` background style) that covers the entire viewBox with a solid opaque fill.
 * Synchronous. For bitmap icons (.ico/.png) a separate pixel-based removal would be needed.
 */
export function removeBackground(svgString: string): { svg: string; removed: boolean; color: string | null } {
	const structResult = detectBackgroundByStructure(svgString);
	if (!structResult) return { svg: svgString, removed: false, color: null };

	const { element, doc, color } = structResult;
	if (element === doc.documentElement) {
		// Background is <svg>'s own style — strip background/background-color
		const style = element.getAttribute('style') || '';
		const newStyle = style
			.replace(/background-color\s*:[^;]+;?/gi, '')
			.replace(/background\s*:[^;]+;?/gi, '')
			.trim();
		if (newStyle) element.setAttribute('style', newStyle);
		else element.removeAttribute('style');
	} else {
		element.remove();
	}
	const serializer = new XMLSerializer();
	return { svg: serializer.serializeToString(doc), removed: true, color };
}
