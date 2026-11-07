const fs = require('fs');

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace(/review-fisheye\.js\?v=lux-v3/g, 'review-fisheye.js?v=autoscroll-v4');
index = index.replace(/review-fisheye\.css\?v=lux-v3/g, 'review-fisheye.css?v=autoscroll-v4');
fs.writeFileSync('index.html', index, 'utf8');

console.log('Bumped review-fisheye cache busters to ?v=autoscroll-v4 in index.html');
