const fs = require('fs');
const path = 'src/utils/calculator.ts';
let c = fs.readFileSync(path, 'utf8');
const searchPattern = /const groupKey = isSP[\s\S]*?const group =/;
const replacement = `const groupKey = isSP 
      ? \`\${order.materialName}-\${order.weight}-\${order.totalColorCount}-\${order.printCode}\`
      : isReady ? \`\${order.materialName}-\${order.weight}\`
      : \`\${order.materialName}-\${order.weight}-\${order.totalColorCount}\`;
    const group =`;
c = c.replace(searchPattern, replacement);
fs.writeFileSync(path, c, 'utf8');
console.log('Fixed');
