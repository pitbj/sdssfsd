const fs = require('fs');
let s = fs.readFileSync('src/main.js', 'utf8');
const closesvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
// Match the close button regardless of what broken char is inside
const before = s.length;
s = s.replace(/(<button class="close" aria-label="Close">)[^<]*(<\/button>)/, `$1${closesvg}$2`);
fs.writeFileSync('src/main.js', s, 'utf8');
console.log('replaced:', before, '->', s.length);
