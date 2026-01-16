import fs from 'fs';
import { optimize } from 'svgo';

const FILE_PATH = 'src/builtin-icons.ts';

if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
}

let content = fs.readFileSync(FILE_PATH, 'utf8');

const svgoConfig = {
    plugins: [
        {
            name: 'preset-default',
            params: {
                overrides: {
                    removeUnknownsAndDefaults: false,
                },
            },
        },
        'removeDimensions',
    ],
    multipass: true,
};

let totalSavings = 0;

// Robust regex for string literals (matches '...' or "...")
// Captures:
// 1. Key (svgData|themeDarkSvgData)
// 2. Quote ( ' or " )
// 3. Content (escaped)
const regex = /(?:["']?)(svgData|themeDarkSvgData)(?:["']?)\s*:\s*(['"])((?:(?!\2|\\).|\\.)*)\2/g;

content = content.replace(regex, (match, key, quote, rawContent) => {
    // 1. Unescape the content to get actual SVG
    // If quote is ", then \" becomes "
    // If quote is ', then \' becomes '
    let svgContent = rawContent;
    if (quote === '"') {
        svgContent = svgContent.replace(/\\"/g, '"');
    } else {
        svgContent = svgContent.replace(/\\'/g, "'");
    }
    
    // Also handle general escapes like \\ -> \ if necessary, but usually simple quote unescaping is enough for SVG strings
    svgContent = svgContent.replace(/\\\\/g, '\\'); 

    if (!svgContent.trim().startsWith('<svg')) return match;

    try {
        const result = optimize(svgContent, svgoConfig);
        const optimizedSvg = result.data;
        
        // 2. Re-escape for the file
        let escapedSvg = optimizedSvg.replace(/\\/g, '\\\\'); // Escape backslashes first
        if (quote === '"') {
            escapedSvg = escapedSvg.replace(/"/g, '\\"');
        } else {
            escapedSvg = escapedSvg.replace(/'/g, "\\'");
        }
        
        // Normalize newlines just in case (SVGO usually removes them)
        escapedSvg = escapedSvg.replace(/\n/g, '\\n');

        const savings = rawContent.length - escapedSvg.length;
        totalSavings += savings;
        
        console.log(`Optimized ${key}: ${rawContent.length} -> ${escapedSvg.length} chars (${savings > 0 ? '-' : '+'}${Math.abs(savings)})`);
        
        return `${key}: ${quote}${escapedSvg}${quote}`;
    } catch (err) {
        console.error(`Error optimizing ${key}:`, err);
        return match;
    }
});

fs.writeFileSync(FILE_PATH, content);
console.log(`\nTotal savings: ${totalSavings} chars`);
console.log('Done.');
