// Render the small character-content Markdown subset using DOM nodes only.
function appendInline(parent, source) {
  const token = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let offset = 0, match;
  while ((match = token.exec(source))) {
    parent.append(document.createTextNode(source.slice(offset, match.index)));
    const element = document.createElement(match[1] === undefined ? 'em' : 'strong');
    element.textContent = match[1] ?? match[2];
    parent.append(element);
    offset = token.lastIndex;
  }
  parent.append(document.createTextNode(source.slice(offset)));
}

function heading(line) {
  const match = /^(#{1,3})[ \t]+(.+)$/.exec(line);
  return match ? { level: match[1].length, text: match[2] } : null;
}

function listItem(line) {
  const task = /^-[ \t]+\[([ xX])\][ \t]+(.*)$/.exec(line);
  if (task) return { kind: 'task', text: task[2], checked: task[1].toLowerCase() === 'x' };
  const bullet = /^-[ \t]+(.*)$/.exec(line);
  if (bullet) return { kind: 'ul', text: bullet[1] };
  const ordered = /^\d+\.[ \t]+(.*)$/.exec(line);
  return ordered ? { kind: 'ol', text: ordered[1] } : null;
}

export function renderBasicMarkdown(container, source) {
  container.replaceChildren();
  if (!source) return;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph = [], list = null, listKind = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement('p');
    paragraph.forEach((line, index) => {
      if (index) p.append(document.createElement('br'));
      appendInline(p, line);
    });
    container.append(p);
    paragraph = [];
  };
  const flushList = () => { list = null; listKind = null; };
  for (const line of lines) {
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const title = heading(line);
    if (title) {
      flushParagraph(); flushList();
      const h = document.createElement(`h${title.level + 1}`);
      appendInline(h, title.text);
      container.append(h);
      continue;
    }
    const item = listItem(line);
    if (item) {
      flushParagraph();
      const kind = item.kind === 'task' ? 'ul' : item.kind;
      if (!list || listKind !== kind) {
        flushList();
        listKind = kind;
        list = document.createElement(kind);
        if (item.kind === 'task') list.className = 'markdown-tasks';
        container.append(list);
      }
      const li = document.createElement('li');
      if (item.kind === 'task') {
        const box = document.createElement('span');
        box.className = 'markdown-checkbox';
        box.setAttribute('aria-hidden', 'true');
        box.textContent = item.checked ? '☑' : '☐';
        li.append(box, document.createTextNode(' '));
      }
      appendInline(li, item.text);
      list.append(li);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
}
