// Local presentation only: never replace the card DOM or change its editor/tab state.
const trigger = document.querySelector('#supplementary-info');
const dialog = document.querySelector('#study-guide');
const overview = document.querySelector('#study-guide-overview');
const detail = document.querySelector('#study-guide-detail');
const topics = [...overview.querySelectorAll('[data-study-guide-topic]')];
const categoryTabs = [...overview.querySelectorAll('[role="tab"]')];
const categoryPanels = [...overview.querySelectorAll('[data-study-guide-category-panel]')];
const detailCategory = document.querySelector('#study-guide-detail-category');
const back = document.querySelector('#study-guide-back');
let selectedTopic;
let selectedCategory = 'races';
const content = dialog.querySelector('.study-guide-content');
const mechanicsTab = document.querySelector('#study-guide-category-mechanics');
const mechanicsPanel = document.querySelector('#study-guide-mechanics-panel');
const mechanicTopics = topics.filter(topic => topic.dataset.studyGuideSection);

function categoryOf(topic) {
  const target = topic.getAttribute('aria-controls');
  if (target.startsWith('study-guide-background-')) return 'backgrounds';
  if (target.startsWith('study-guide-class-')) return 'classes';
  return 'races';
}

function categoryLabel(category) {
  return category === 'backgrounds' ? 'zázemí' : category === 'classes' ? 'povolání'
    : category === 'mechanics' ? 'mechaniky' : 'rasy';
}

function categoryTitle(category) {
  return category === 'backgrounds' ? 'Zázemí' : category === 'classes' ? 'Povolání'
    : category === 'mechanics' ? 'Mechaniky' : 'Rasy';
}

function showCategory(category) {
  selectedCategory = category;
  for (const tab of categoryTabs) {
    const selected = tab.dataset.studyGuideCategory === category;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of categoryPanels) panel.hidden = panel.dataset.studyGuideCategoryPanel !== category;
}

function showOverview() {
  showCategory(selectedCategory);
  overview.hidden = false;
  detail.hidden = true;
  content.scrollTop = 0;
}

trigger.addEventListener('click', () => {
  showOverview();
  dialog.showModal();
});
for (const tab of categoryTabs) {
  tab.dataset.studyGuideCategory = tab.id.endsWith('backgrounds') ? 'backgrounds'
    : tab.id.endsWith('classes') ? 'classes' : tab.id.endsWith('mechanics') ? 'mechanics' : 'races';
  tab.addEventListener('click', () => showCategory(tab.dataset.studyGuideCategory));
}
for (const topic of topics) {
  topic.addEventListener('click', () => {
    selectedTopic = topic;
    const category = categoryOf(topic);
    showCategory(category);
    for (const item of topics) {
      document.getElementById(item.getAttribute('aria-controls')).hidden = item !== topic;
    }
    overview.hidden = true;
    detail.hidden = false;
    back.textContent = `← Zpět na ${categoryLabel(category)}`;
    detailCategory.textContent = `${categoryTitle(category)} · D&D 5e (2014)`;
    content.scrollTop = 0;
    document.querySelector(`#study-guide-${topic.dataset.studyGuideTopic}-title`).focus({ preventScroll: true });
  });
}
back.addEventListener('click', () => {
  showOverview();
  // Let the browser reveal a topic near the bottom of the list on small screens.
  selectedTopic.focus();
});
document.querySelector('#study-guide-close').addEventListener('click', () => dialog.close());
// Native modal behavior handles Escape and keeps keyboard focus inside the dialog.
dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));

function applyMechanicVisibility(rows) {
  const visible = new Set(rows.filter(row => row?.is_visible === true).map(row => row.section_id));
  let anyVisible = false;
  for (const topic of mechanicTopics) {
    const isVisible = visible.has(topic.dataset.studyGuideSection);
    topic.closest('li').hidden = !isVisible;
    anyVisible ||= isVisible;
  }
  mechanicsTab.hidden = !anyVisible;
  mechanicsPanel.hidden = !anyVisible;
  if (!anyVisible && selectedCategory === 'mechanics') showCategory('races');
}

document.addEventListener?.('study-guide-section-visibility', event => {
  applyMechanicVisibility(Array.isArray(event.detail) ? event.detail : []);
});
