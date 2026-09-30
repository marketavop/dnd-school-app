export function showAdminView(document, view) {
  document.querySelector('#leader-content').hidden = view !== 'home';
  document.querySelector('#leader-players').hidden = view !== 'players';
  document.querySelector('#leader-maps').hidden = view !== 'maps';
}

export function navigateAdminView(window, view) {
  const url = new URL(window.location.href);
  if (view === 'home') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  url.hash = '';
  window.history.pushState(null, '', url.href);
}
