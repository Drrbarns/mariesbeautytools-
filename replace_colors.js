const fs = require('fs');
const path = require('path');

function replaceFileContent(filePath, regex, replacement) {
    const content = fs.readFileSync(filePath, 'utf8');
    const replaced = content.replace(regex, replacement);
    if (content !== replaced) {
        fs.writeFileSync(filePath, replaced);
        console.log(`Replaced in ${filePath}`);
    }
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!['node_modules', '.next', '.git'].includes(file)) {
                walkDir(fullPath);
            }
        } else if (/\.(ts|tsx|js|jsx|css)$/.test(file)) {
            replaceFileContent(fullPath, /([a-zA-Z0-9:-]*)blue-(\d+)/g, "$1stone-$2");
        }
    }
}

walkDir(path.join(__dirname, 'app'));
walkDir(path.join(__dirname, 'components'));
walkDir(path.join(__dirname, 'hooks'));
walkDir(path.join(__dirname, 'lib'));

const tailwindConfig = path.join(__dirname, 'tailwind.config.js');
if (fs.existsSync(tailwindConfig)) {
    let twContent = fs.readFileSync(tailwindConfig, 'utf8');
    twContent = twContent.replace(
        /brand:\s*\{[\s\S]*?\}/,
        `brand: {
          DEFAULT: '#1c1917',
          light: '#292524',
          dark: '#0c0a09',
          accent: '#44403c',
          muted: '#78716c',
        }`
    );
    fs.writeFileSync(tailwindConfig, twContent);
    console.log("Updated tailwind config");
}
