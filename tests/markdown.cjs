const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/markdown.js', 'utf8').replace('export function', 'function');
function makeNode(tagName = 'div', text = '') {
  let ownText = text;
  const node = { tagName, children: [], attributes: {}, className: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; ownText = ''; },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
  Object.defineProperty(node, 'textContent', {
    get() { return ownText + (tagName === 'br' ? '\n' : node.children.map(child => child.textContent).join('')); },
    set(value) { ownText = String(value); node.children = []; },
  });
  return node;
}
const document = { createElement: tag => makeNode(tag), createTextNode: text => makeNode('#text', String(text)) };
const context = vm.createContext({ document });
vm.runInContext(source, context);
const render = (text) => {
  const container = makeNode();
  context.target = container; context.input = text;
  vm.runInContext('renderBasicMarkdown(target, input)', context);
  return container;
};
const walk = node => [node, ...(node.children || []).flatMap(walk)];
const plain = render('První odstavec\ns dalším řádkem.\n\nDruhý odstavec.');
assert.deepEqual(plain.children.map(node => node.tagName), ['p', 'p']);
assert.deepEqual(plain.children.map(node => node.textContent), ['První odstavec\ns dalším řádkem.', 'Druhý odstavec.']);
assert.equal(walk(plain).filter(node => node.tagName === 'br').length, 1);
const formatted = render('# Jeden\n## **Dva**\n### *Tři*\n\n**tučně** a *kurzíva*\n- odrážka\n- [ ] úkol\n- [x] hotovo\n1. první\n2. druhý');
assert.deepEqual(walk(formatted).filter(node => /^h[2-4]$/.test(node.tagName)).map(node => node.tagName), ['h2', 'h3', 'h4']);
assert.deepEqual(walk(formatted).filter(node => ['strong', 'em'].includes(node.tagName)).map(node => node.tagName), ['strong', 'em', 'strong', 'em']);
assert.equal(walk(formatted).filter(node => node.tagName === 'ul').length, 1);
assert.equal(walk(formatted).filter(node => node.tagName === 'ol').length, 1);
assert.deepEqual(walk(formatted).filter(node => node.className === 'markdown-checkbox').map(node => node.textContent), ['☐', '☑']);
assert.ok(walk(formatted).every(node => !['input', 'button', 'a', 'img', 'script'].includes(node.tagName)));
const attack = render('<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n[link](javascript:alert(1))\n> citace\n```kód```\n| tabulka |');
assert.equal(attack.textContent, '<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n[link](javascript:alert(1))\n> citace\n```kód```\n| tabulka |');
assert.ok(walk(attack).every(node => !['img', 'script', 'a', 'table'].includes(node.tagName)));
assert.equal(render('').children.length, 0);
assert.ok(!source.includes('innerHTML'));
console.log('PASS: Markdown subset, plain paragraphs and line breaks, unsupported syntax as text, no HTML interpretation');
