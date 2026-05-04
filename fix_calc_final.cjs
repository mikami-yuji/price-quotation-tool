const fs = require('fs');
const path = 'src/utils/calculator.ts';
let c = fs.readFileSync(path, 'utf8');
const search = /isSP\s+\?\s+\$\{order\.materialName\}---\s+: isReady \? \$\{order\.materialName\}-\s+: \$\{order\.materialName\}--;/;
const replacement = 'isSP \n      ? `${order.materialName}-${order.weight}-${order.totalColorCount}-${order.printCode}`\n      : isReady ? `${order.materialName}-${order.weight}`\n      : `${order.materialName}-${order.weight}-${order.totalColorCount}`;';
c = c.replace(search, replacement);
fs.writeFileSync(path, c, 'utf8');
console.log('Fixed');
