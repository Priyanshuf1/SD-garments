const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const col = fs.readFileSync('collections.html', 'utf8');

function extractNav(html, filename) {
  console.log(`\n=================== ${filename} ===================`);
  const navIdx = html.indexOf('<nav');
  const navEnd = html.indexOf('</nav>', navIdx);
  if (navIdx === -1 || navEnd === -1) {
    console.log('No <nav> found');
    return;
  }
  const navContent = html.substring(navIdx, navEnd + 6);
  console.log('Nav length:', navContent.length);

  // Find all top level nav links and their dropdown menus
  const liMatches = navContent.match(/<li[\s\S]*?<\/li>/gi) || [];
  console.log('Total <li> in nav:', liMatches.length);
  liMatches.forEach((li, i) => {
    const aMatch = li.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const hasDropdown = li.includes('dropdown') || li.includes('mega-menu') || li.includes('<ul');
    const title = aMatch ? aMatch[1].replace(/<[^>]*>/g, '').trim() : 'NO <a>';
    console.log(`  [${i+1}] ${title} (hasDropdown: ${hasDropdown})`);
  });
}

extractNav(index, 'index.html');
extractNav(col, 'collections.html');
