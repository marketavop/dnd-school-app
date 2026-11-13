const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const registry = readFileSync('public/character-sections.js', 'utf8').replace('export const', 'const');
const source = readFileSync('public/leader-players.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
function element() {
  return { children: [], handlers: {}, classList: { add() {}, remove() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    removeAttribute() {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
  };
}
(async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    createElement: element, createTextNode: text => ({ textContent: text }),
  };
  const calls = [];
  const context = vm.createContext({ document, URL,
    window: { location: { href: 'https://example.test/?view=players' } },
    getCurrentUser: () => ({ role: 'leader' }), showAdminView() {},
    call: async (name, args) => {
      calls.push({ name, args });
      return name === 'leader_set_character_section_visibility'
        ? [{ section_id: args.p_section_id, is_visible: args.p_is_visible }] : [];
    },
  });
  vm.runInContext(registry + '\n' + source.replace('mountLeaderPlayers(document, window);', 'mountLeaderPlayers(document, window, call);'), context);
  await document.querySelector('#leader-players-link').handlers.click({ preventDefault() {} });
  const label = document.querySelector('#character-visibility-controls').children.find(item => item.children[1].textContent.includes('Schopnosti'));
  const checkbox = label.children[0];
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.handlers.change();
  const saved = calls.find(call => call.name === 'leader_set_character_section_visibility');
  assert.equal(saved.args.p_section_id, 'features');
  assert.equal(saved.args.p_is_visible, true);
  assert.equal(checkbox.checked, true);
  console.log('PASS: leader GUI exposes features as hidden by default and saves visibility');
})().catch(error => { console.error(error); process.exitCode = 1; });
