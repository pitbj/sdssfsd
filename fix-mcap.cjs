const fs = require('fs');
let s = fs.readFileSync('src/main.js', 'utf8');
// Replace whatever is between data-value="mcap"> and " Market Cap" with the correct diamond emoji
s = s.replace(/data-value="mcap">[^\x00-\x7F\u0080-\u00FF]*[\x80-\xFF\u0080-\u00FF]+\s*Market Cap/, 'data-value="mcap">\uD83D\uDC8E Market Cap');
// Broader fallback: match anything between mcap"> and Market Cap
s = s.replace(/data-value="mcap">[^<]*Market Cap/, 'data-value="mcap">\uD83D\uDC8E Market Cap');
fs.writeFileSync('src/main.js', s, 'utf8');
console.log('done');
