import type { IconItem } from './types';

// ─── SVG parsing, sanitization & serialization (DOM-based) ────────────────────

/**
 * Parse an SVG string into an XML document. Returns null when the input is
 * not well-formed XML or the root element is not <svg>.
 */
function parseSvgDocument(svgString: string): Document | null {
	try {
		const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
		if (doc.querySelector('parsererror')) return null;
		const root = doc.documentElement;
		if (!root || root.tagName.toLowerCase() !== 'svg') return null;
		return doc;
	} catch {
		return null;
	}
}

/** Remove comments and inter-tag formatting whitespace; collapse runs of spaces inside text. */
function compactWhitespace(node: Node): void {
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.COMMENT_NODE) {
			child.remove();
		} else if (child.nodeType === Node.TEXT_NODE) {
			const collapsed = (child.nodeValue || '').replace(/\s+/g, ' ');
			if (collapsed.trim() === '') {
				child.remove();
			} else {
				child.nodeValue = collapsed.trim();
			}
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			compactWhitespace(child);
		}
	}
}

/** Elements stripped entirely: unsafe (script/style) or heavy (filters). */
const STRIP_ELEMENTS = new Set(['script', 'style', 'filter', 'fedropshadow']);

const FILTER_STYLE_PROP_RE = /(^|;)\s*filter\s*:[^;]*;?/gi;

/**
 * Sanitize in place: remove <script>/<style>/<filter>/<feDropShadow> elements,
 * `filter` attributes and CSS filter properties, and derive a viewBox from
 * width/height when missing.
 */
function sanitizeSvgElement(svg: Element): void {
	svg.querySelectorAll('*').forEach(el => {
		if (STRIP_ELEMENTS.has(el.tagName.toLowerCase())) el.remove();
	});
	svg.querySelectorAll('[filter]').forEach(el => el.removeAttribute('filter'));
	svg.querySelectorAll('[style]').forEach(el => {
		const style = el.getAttribute('style') || '';
		const next = style.replace(FILTER_STYLE_PROP_RE, '').trim();
		if (next !== style) {
			if (next) el.setAttribute('style', next);
			else el.removeAttribute('style');
		}
	});

	if (!svg.getAttribute('viewBox')) {
		const w = parseFloat(svg.getAttribute('width') || '');
		const h = parseFloat(svg.getAttribute('height') || '');
		if (!isNaN(w) && !isNaN(h)) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
	}
}

const CSS_VAR_RE = /var\(--([a-zA-Z0-9-_]+)\s*(?:,\s*([^)]+))?\)/g;

/**
 * Prepare a stored SVG for settings-preview rendering: sanitize, resolve
 * currentColor and CSS variables against the container's computed style,
 * compact, and serialize.
 *
 * Malformed input (not well-formed XML) falls back to the trimmed raw string —
 * the link-render path consumes raw stored data the same way.
 */
export function prepareSvgForSettings(svg: string, container: HTMLElement): string {
	if (!svg) return '';
	const doc = parseSvgDocument(svg);
	if (!doc) return svg.trim();

	const svgEl = doc.documentElement;
	sanitizeSvgElement(svgEl);

	try {
		const containerStyle = activeWindow.getComputedStyle(container);
		const rootStyle = activeWindow.getComputedStyle(activeDocument.documentElement);
		const color = containerStyle.color ? containerStyle.color.trim() : '';
		const varValues = new Map<string, string>();

		const resolveVar = (name: string): string => {
			if (!varValues.has(name)) {
				const value = (containerStyle.getPropertyValue(`--${name}`)
					|| rootStyle.getPropertyValue(`--${name}`) || '').trim();
				varValues.set(name, value);
			}
			return varValues.get(name) || '';
		};

		const transformAttrValue = (value: string): string => {
			let next = value;
			if (color) next = next.split('currentColor').join(color);
			return next.replace(CSS_VAR_RE, (match, varName: string, fallback?: string) => {
				const resolved = resolveVar(varName);
				if (resolved) return resolved;
				if (fallback !== undefined) return fallback.trim();
				return match;
			});
		};

		for (const el of [svgEl, ...Array.from(svgEl.querySelectorAll('*'))]) {
			for (const attr of Array.from(el.attributes)) {
				const next = transformAttrValue(attr.value);
				if (next !== attr.value) el.setAttribute(attr.name, next);
			}
		}
	} catch {
		// unresolved colors are fine — the preview still renders
	}

	compactWhitespace(svgEl);
	return new XMLSerializer().serializeToString(svgEl);
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
			const canvas = createEl('canvas');
			canvas.width = 1;
			canvas.height = 1;
			_normalizeCtx = canvas.getContext('2d');
		}
		if (!_normalizeCtx) return null;
		_normalizeCtx.fillStyle = '#abcdef'; // sentinel
		_normalizeCtx.fillStyle = c;
		const result = _normalizeCtx.fillStyle;
		if (typeof result !== 'string') return null;
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
	const doc = parseSvgDocument(svgString);
	if (!doc) return null;
	const svg = doc.documentElement;

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

// ─── Fit viewBox to content ──────────────────────────────────────────────────

/**
 * Refit SVG viewBox to its content bbox if the content fills too little of the canvas.
 * Uses native getBBox() for accuracy (handles curves). Synchronous within a microtask,
 * but requires temporary DOM insertion. Returns refit=true if viewBox was changed.
 *
 * Judgement is based on the LONG edge fill ratio (max(fillW, fillH)), because SVG
 * preserves aspect ratio by default — a thin icon that already fills its long edge
 * should not be stretched.
 *
 * @param paddingRatio Padding around content as a fraction of content size (default 0.025 = 2.5%).
 *                     With 0.025, content fills ~95.2% of the new viewBox long edge.
 * @param minFillRatio Trigger refit if content's LONG edge fills less than this (default 0.9)
 */
export function fitSvgToContent(
	svgString: string,
	paddingRatio = 0.025,
	minFillRatio = 0.9
): { svg: string; refit: boolean } {
	const doc = parseSvgDocument(svgString);
	if (!doc) return { svg: svgString, refit: false };
	const svg = doc.documentElement;

	const viewBox = getViewBox(svg);
	if (!viewBox) return { svg: svgString, refit: false };

	// Compute content bbox via native getBBox() — accurate for curves/transforms.
	// Requires the SVG to be attached to a rendered DOM tree.
	let contentBBox: { x: number; y: number; w: number; h: number };
	const host = createSvg('svg');
	host.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	host.setCssProps({
		position: 'absolute',
		left: '-9999px',
		top: '0',
		width: '1px',
		height: '1px',
		visibility: 'hidden',
	});
	activeDocument.body.appendChild(host);
	try {
		host.appendChild(svg);
		const bbox = (svg as unknown as SVGSVGElement).getBBox();
		contentBBox = { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
	} catch {
		return { svg: svgString, refit: false };
	} finally {
		host.remove();
	}

	// Guard: skip if content is empty
	if (contentBBox.w <= 0 || contentBBox.h <= 0) {
		return { svg: svgString, refit: false };
	}

	// Skip if content's LONG edge already fills enough of viewBox
	const fillW = contentBBox.w / viewBox.w;
	const fillH = contentBBox.h / viewBox.h;
	if (Math.max(fillW, fillH) >= minFillRatio) {
		return { svg: svgString, refit: false };
	}

	// Refit: pad content by paddingRatio of content size, set new viewBox
	const padX = contentBBox.w * paddingRatio;
	const padY = contentBBox.h * paddingRatio;
	const newX = contentBBox.x - padX;
	const newY = contentBBox.y - padY;
	const newW = contentBBox.w + 2 * padX;
	const newH = contentBBox.h + 2 * padY;

	svg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
	svg.removeAttribute('width');
	svg.removeAttribute('height');

	const serializer = new XMLSerializer();
	return { svg: serializer.serializeToString(svg), refit: true };
}
