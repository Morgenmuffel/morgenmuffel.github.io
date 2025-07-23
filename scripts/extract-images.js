const fs = require('fs');
const path = require('path');

// Get command line arguments
const args = process.argv.slice(2);
const sourceFile = args[0] ? path.resolve(process.cwd(), args[0]) : path.join(__dirname, '../clustered.html');
const targetFile = args[1] ? path.resolve(process.cwd(), args[1]) : 
    sourceFile.replace(/(\.\w+)?$/, '-refactored$&');

// Create assets directory in the same directory as the target file
const targetDir = path.dirname(targetFile);
const assetsDir = path.join(targetDir, 'assets');
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

// Read the HTML file
let htmlContent = fs.readFileSync(sourceFile, 'utf8');

// Find all base64 images (PNG, JPEG, GIF, SVG, etc.)
// Handle both background-image and regular URL patterns
const base64Regex = /(background-image:\s*)?url\(['"]?data:image\/([a-z+]+);base64,([^)'"\s]+)['"]?\)/gi;
let match;
let imageCount = 0;

// Process all matches
let lastIndex = 0;
let output = '';

while ((match = base64Regex.exec(htmlContent)) !== null) {
    // Add the content before the match
    output += htmlContent.slice(lastIndex, match.index);
    
    // Extract image type and data
    const isBackgroundImage = !!match[1];
    const imageType = match[2];
    const base64Data = match[3];
    
    let extension = imageType === 'svg+xml' ? 'svg' : imageType.split('+')[0];
    const imagePath = path.join(assetsDir, `image${imageCount}.${extension}`);
    
    try {
        // Convert base64 to binary and write to file
        const binaryData = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(imagePath, binaryData);
        
        console.log(`Created ${extension.toUpperCase()} image: ${path.basename(imagePath)}`);
        
        // Create the new URL with correct path formatting
        const relativePath = path.relative(
            targetDir,
            imagePath
        ).replace(/\\\\/g, '/');
        
        // Preserve the original format (background-image or url)
        if (isBackgroundImage) {
            // For style attributes, we need to use single quotes for the URL
            output += `background-image: url('${relativePath}')`;
        } else {
            // For regular URLs, use double quotes
            output += `url("${relativePath}")`;
        }
        imageCount++;
    } catch (error) {
        console.error(`Error processing image ${imageCount}:`, error.message);
        // Keep the original URL if there was an error
        output += match[0];
    }
    
    lastIndex = match.index + match[0].length;
}

// Add the remaining content
output += htmlContent.slice(lastIndex);
htmlContent = output;

// Write the modified HTML content to the target file
fs.writeFileSync(targetFile, htmlContent);
console.log(`Created new HTML file: ${targetFile}`);
console.log(`Processed ${imageCount} images.`);
console.log(`Assets saved to: ${assetsDir}`);
