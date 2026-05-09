const fs = require('fs');

let buf = fs.readFileSync('src/main.js');
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) buf = buf.slice(3);
let s = buf.toString('utf8');

const replacements = {
  '\u00f0\u0178\u201d\u00a5': '\uD83D\uDD25', // 🔥
  '\u00f0\u0178\u201c\u2030': '\uD83D\uDCC9', // 📉
  '\u00f0\u0178\u2019\u0178': '\uD83D\uDC8E', // 💎
  '\u00f0\u0178\u201d\u00ac': '\uD83D\uDD2C', // 🔬
  '\u00f0\u0178\u201c\u02c6': '\uD83D\uDCC8', // 📈
  '\u00f0\u0178\u2019\u00a7': '\uD83D\uDCA7', // 💧
  '\u00e2\u0178\u00b3': '\u27F3',             // ⟳ reset
  '\u00e2\u009c\u2022': '\u2715',             // ✕ close
};

for (const [broken, fixed] of Object.entries(replacements)) {
  while (s.includes(broken)) s = s.replace(broken, fixed);
}

s = s.replace(/(<button data-value="newest">)[^<]*New Launches/, '$1\uD83C\uDD95 New Launches');
s = s.replace(/\r\n/g, '\n');

fs.writeFileSync('src/main.js', s, 'utf8');
console.log('Done. Chars:', s.length);
