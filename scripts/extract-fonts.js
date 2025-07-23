const fs = require('fs');
const path = require('path');

// Get command line arguments
const args = process.argv.slice(2);
const sourceFile = args[0] ? path.resolve(process.cwd(), args[0]) : path.join(__dirname, '../clustered-refactored.html');
const targetFile = args[1] ? path.resolve(process.cwd(), args[1]) : 
    path.join(path.dirname(sourceFile), 'clustered-final.html');

// Create assets directory in the same directory as the target file
const targetDir = path.dirname(targetFile);
const assetsDir = path.join(targetDir, 'assets');
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

// Read the HTML file
let htmlContent = fs.readFileSync(sourceFile, 'utf8');

// Find all base64 fonts (WOFF2)
const fontRegex = /@font-face\s*\{[^}]*?font-family:\s*(["'])(.*?)\1[^}]*?src:\s*url\(['"]?data:font\/woff2;base64,([^\s'")]+)['"]?\)[^}]*\}/gis;
let match;
let fontCount = 0;

// Process all matches
let lastIndex = 0;
let output = '';

while ((match = fontRegex.exec(htmlContent)) !== null) {
    // Add the content before the match
    output += htmlContent.slice(lastIndex, match.index);
    
    const fontFamily = match[2].replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const base64Data = match[3];
    const fontWeightMatch = match[0].match(/font-weight:\s*(\d+)/i);
    const fontWeight = fontWeightMatch ? fontWeightMatch[1] : '400';
    const fontStyleMatch = match[0].match(/font-style:\s*([^;\n}]+)/i);
    const fontStyle = fontStyleMatch ? fontStyleMatch[1].trim().toLowerCase() : 'normal';
    
    const fontFileName = `${fontFamily}-${fontWeight}-${fontStyle}.woff2`;
    const fontPath = path.join(assetsDir, fontFileName);
    
    try {
        // Convert base64 to binary and write to file
        const binaryData = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(fontPath, binaryData);
        
        console.log(`Created font file: ${fontFileName}`);
        
        // Create the new @font-face rule with the file reference
        const relativePath = path.relative(targetDir, fontPath).replace(/\\/g, '/');
        const newFontFace = match[0].replace(
            /src:\s*url\(['"]?data:font\/woff2;base64,[^\s'")]+['"]?\)/i, 
            `src: url("${relativePath}") format('woff2')`
        );
        
        output += newFontFace;
        fontCount++;
    } catch (error) {
        console.error(`Error processing font ${fontFamily}:`, error.message);
        // Keep the original @font-face if there was an error
        output += match[0];
    }
    
    lastIndex = match.index + match[0].length;
}

// Add the remaining content
output += htmlContent.slice(lastIndex);

// Write the modified HTML content to the target file
fs.writeFileSync(targetFile, output);
console.log(`Created new HTML file: ${targetFile}`);
console.log(`Processed ${fontCount} font files.`);
console.log(`Fonts saved to: ${assetsDir}`);
