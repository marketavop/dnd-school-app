// Local presentation only: never replace the card DOM or change its editor/tab state.
const trigger = document.querySelector('#supplementary-info');
const dialog = document.querySelector('#study-guide');
const overview = document.querySelector('#study-guide-overview');
const detail = document.querySelector('#study-guide-detail');
const topics = [...overview.querySelectorAll('[data-study-guide-topic]')];
let selectedTopic;
const content = dialog.querySelector('.study-guide-content');

function showOverview() {
  overview.hidden = false;
  detail.hidden = true;
  content.scrollTop = 0;
}

trigger.addEventListener('click', () => {
  showOverview();
  dialog.showModal();
});
for (const topic of topics) {
  topic.addEventListener('click', () => {
    selectedTopic = topic;
    for (const item of topics) {
      document.getElementById(item.getAttribute('aria-controls')).hidden = item !== topic;
    }
    overview.hidden = true;
    detail.hidden = false;
    content.scrollTop = 0;
    document.querySelector(`#study-guide-${topic.dataset.studyGuideTopic}-title`).focus({ preventScroll: true });
  });
}
document.querySelector('#study-guide-back').addEventListener('click', () => {
  showOverview();
  // Let the browser reveal a topic near the bottom of the list on small screens.
  selectedTopic.focus();
});
document.querySelector('#study-guide-close').addEventListener('click', () => dialog.close());
// Native modal behavior handles Escape and keeps keyboard focus inside the dialog.
dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
