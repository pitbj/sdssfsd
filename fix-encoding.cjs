const fs = require('fs');

// Read as raw bytes to understand the actual encoding
let buf = fs.readFileSync('src/main.js');

// Remove BOM if present
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  buf = buf.slice(3);
}

let s = buf.toString('utf8');

// The PowerShell Set-Content re-encoded the file, corrupting multi-byte chars.
// Fix the known corrupted emoji sequences by replacing the broken text.
const replacements = {
  // Filter buttons
  '\u00f0\u0178\u201d\u00a5': '\uD83D\uDD25', // 🔥
  '\u00f0\u0178\u201c\u2030': '\uD83D\uDCC9', // 📉
  '\u00f0\u0178\u2019\u0178': '\uD83D\uDC8E', // 💎
  '\u00f0\u0178\u201d\u00ac': '\uD83D\uDD2C', // 🔬
  '\u00f0\u0178\u201c\u02c6': '\uD83D\uDCC8', // 📈
  '\u00f0\u0178\u2019\u00a7': '\uD83D\uDCA7', // 💧
  '\u00e2\u0178\u00b3': '\u27F3',             // ⟳
};

for (const [broken, fixed] of Object.entries(replacements)) {
  while (s.includes(broken)) {
    s = s.replace(broken, fixed);
  }
}

// Fix the 🆕 emoji - it has a special corruption pattern
// Find "newest" button line and fix it
s = s.replace(
  /(<button data-value="newest">)[^<]*New Launches/,
  '$1\uD83C\uDD95 New Launches'
);

// Also check for any remaining \u00b7 (middle dot) corruption
// The middle dot in canvas text should be fine as it's a standard char

// Fix CRLF consistency
s = s.replace(/\r\n/g, '\n');

fs.writeFileSync('src/main.js', s, 'utf8');
console.log('Fixed encoding. File size:', s.length, 'chars');
