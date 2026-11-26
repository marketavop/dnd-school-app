// Browser regression with the production character sheet and mocked Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const idA = '12345678-1234-4321-9876-123456789abc';
const idB = 'abcdefab-1234-4321-9876-abcdefabcdef';
const categories = {
  weapon: 'Zbraň (Weapon)',
  armor_shield: 'Zbroj a štít (Armor & Shield)',
  adventuring_gear: 'Dobrodružná výbava (Adventuring Gear)',
  tool: 'Nástroj nebo pomůcka (Tool)',
  consumable: 'Spotřební předmět (Consumable)',
  magic_item: 'Kouzelný předmět (Magic Item)',
  valuable: 'Cennost (Valuable)',
  quest_item: 'Úkolový předmět (Quest Item)',
  other: 'Ostatní (Other)',
};
const unsafeName = '<img src=x onerror=alert(1)>';
const unsafeNote = '<script>alert(1)</script>\n**doslovný text**';
const items = Object.keys(categories).map((type, i) => ({
  id: randomUUID(), character_id: idA, name: i ? 'Předmět A' + i : unsafeName, item_type: type, quantity: i + 1,
  price_gp: i === 0 ? 0 : i === 2 ? 1.25 : null, not_for_sale: i === 0,
  note: i === 0 ? unsafeNote : i === 1 ? 'dlouhá'.repeat(100) : null,
}));
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, '../public', new URL(req.url, 'http://localhost').pathname);
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png' };
  try {
    const contents = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(contents);
  } catch { res.writeHead(404); res.end(); }
});

async function fixture(browser, role, width, storedItems) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: role === 'player' });
  const session = { user_id: idB, character_id: role === 'player' ? idA : null, role, session_token: 'ab'.repeat(32) };
  await context.addInitScript(user => {
    sessionStorage.setItem('dnd-school.session.v1', JSON.stringify(user));
  }, session);
  await context.route('**/config.local.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "export const SUPABASE_URL='https://fixture.test'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';",
  }));
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: "export function createClient(url) { return { async rpc(name, args) { const res = await fetch(url + '/rest/v1/rpc/' + name, {method: 'POST', body: JSON.stringify(args)}); const data = res.status === 204 ? null : await res.json(); return res.ok ? {data} : {error: data}; } }; }",
  }));
  const requests = [];
  const control = { inventory: id => storedItems.filter(item => item.character_id === id), saveInventory: () => true };
  const legacy = '**Původní lano**';
  await context.route('https://fixture.test/rest/v1/rpc/*', async route => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const rpc = route.request().url().split('/').at(-1);
    const args = route.request().postDataJSON();
    requests.push({ rpc, args });
    assert.equal(args.p_session_token, session.session_token);
    let data;
    const characterId = args.p_character_id;
    switch (rpc) {
      case 'validate_session': data = [session]; break;
      case 'character_section_visibility': data = []; break;
      case 'leader_players':
        data = [{ character_id: idA, name: 'Postava A' }, { character_id: idB, name: 'Postava B' }];
        break;
      case 'player_update_character':
        assert.equal(Object.hasOwn(args.p_patch, 'inventory'), false);
        data = [{ id: characterId, name: 'Postava A', inventory: legacy, ...args.p_patch }];
        break;
      case 'player_character':
      case 'leader_character':
        data = [{ id: characterId, name: characterId === idA ? 'Postava A' : 'Postava B', inventory: legacy, notes: 'Text sešitu', spells: [] }];
        break;
      case 'player_inventory_items':
      case 'leader_inventory_items':
        assert.equal(rpc, role + '_inventory_items');
        data = await control.inventory(characterId);
        break;
      case 'player_add_inventory_item':
      case 'player_update_inventory_item':
      case 'player_delete_inventory_item': {
        assert.equal(role, 'player');
        assert.equal(characterId, idA);
        if (!await control.saveInventory()) { data = null; break; }
        if (rpc === 'player_add_inventory_item') {
          const item = { id: randomUUID(), character_id: characterId };
          for (const field of ['name', 'item_type', 'quantity', 'price_gp', 'not_for_sale', 'note']) item[field] = args['p_' + field];
          storedItems.push(item);
          data = [item];
        } else {
          const index = storedItems.findIndex(item => item.id === args.p_item_id && item.character_id === characterId);
          assert.notEqual(index, -1);
          if (rpc === 'player_delete_inventory_item') {
            storedItems.splice(index, 1);
            return route.fulfill({ status: 204, headers: cors });
          }
          storedItems[index] = { ...storedItems[index], ...args.p_patch };
          data = [storedItems[index]];
        }
        break;
      }
      default: assert.fail('Unexpected RPC ' + rpc);
    }
    await route.fulfill({ status: data === null ? 503 : 200, headers: cors, json: data ?? { message: 'Test failure' } });
  });
  return { context, page: await context.newPage(), requests, control };
}

async function confirmDeletion(page, activate, name, accepted = true) {
  await Promise.all([
    page.waitForEvent('dialog').then(async dialog => {
      assert.equal(dialog.type(), 'confirm');
      assert.equal(dialog.message(), 'Opravdu smazat předmět „' + name + '“?');
      if (accepted) await dialog.accept();
      else await dialog.dismiss();
    }),
    activate(),
  ]);
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const storedItems = items.map(item => ({ ...item }));
    const player = await fixture(browser, 'player', 1280, storedItems);
    const { page } = player;
    const sheetUrl = origin + '/character.html?character_id=' + idA;
    await page.goto(sheetUrl);
    await page.locator('#student-pages').waitFor();
    assert.equal(player.requests.some(({ rpc }) => rpc === 'player_inventory_items'), false);
    let complete;
    const loading = page.waitForRequest(request => request.url().endsWith('/player_inventory_items'));
    const pendingInventory = new Promise(resolve => { complete = resolve; });
    player.control.inventory = () => pendingInventory;
    await page.locator('#tab-inventory').click();
    await page.getByText('Načítám předměty…', { exact: true }).waitFor();
    await loading;
    complete(items);
    const list = page.locator('#inventory-items-list');
    await list.waitFor();
    const rows = list.locator('li');
    assert.equal(await rows.count(), 9);
    for (const [i, label] of Object.values(categories).entries()) {
      assert.equal(await rows.nth(i).locator('.inventory-item-meta span').first().textContent(), label);
    }
    assert.equal(await rows.first().locator('h4').textContent(), unsafeName);
    assert.equal(await rows.first().locator('.inventory-item-note').textContent(), unsafeNote);
    assert.equal(await list.locator('img, script, strong').count(), 0);
    assert.match(await rows.first().textContent(), /Množství: 1.*0 GP \/ ks.*Neprodejné/s);
    assert.doesNotMatch(await rows.nth(1).locator('.inventory-item-meta').textContent(), /\bGP\b/);
    assert.match(await rows.nth(2).textContent(), /1,25 GP \/ ks/);
    const legacySelectors = '#inventory-legacy-title, #character-inventory, #edit-inventory, #inventory-toggle, #inventory-help';
    assert.equal(await page.locator(legacySelectors).count(), 0);
    assert.equal(await page.getByText('Původní lano').count(), 0);
    await page.locator('#tab-notes').click();
    await page.getByText('Text sešitu', { exact: true }).waitFor();
    await page.locator('#tab-spells').click();
    await page.locator('#panel-spells').waitFor();
    await page.locator('#tab-inventory').click();
    assert.deepEqual(player.requests.filter(({ rpc }) => rpc === 'player_inventory_items').map(({ args }) => args.p_character_id), [idA]);
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await list.evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }

    player.control.inventory = () => [];
    await page.goto(sheetUrl + '&tab=inventory');
    await page.getByText('Zatím nemáš žádné předměty.', { exact: true }).waitFor();
    assert.equal(await list.isHidden(), true);
    player.control.inventory = () => null;
    await page.goto(sheetUrl);
    await page.locator('#tab-inventory').click();
    await page.getByText('Předměty se nepodařilo načíst.', { exact: false }).waitFor();
    const inventoryStatus = page.locator('#inventory-items-status');
    const inventoryRequests = () => player.requests.filter(({ rpc }) => rpc === 'player_inventory_items').length;
    const failedRequestCount = inventoryRequests();
    assert.equal(await inventoryStatus.getAttribute('data-error'), 'true');
    assert.equal(await list.isHidden(), true);
    assert.equal(await page.locator(legacySelectors).count(), 0);

    let completeRetry;
    const pendingRetry = new Promise(resolve => { completeRetry = resolve; });
    player.control.inventory = () => pendingRetry;
    const retryRequest = page.waitForRequest(request => request.url().endsWith('/player_inventory_items'));
    await page.locator('#tab-notes').click();
    await page.locator('#tab-inventory').click();
    await page.getByText('Načítám předměty…', { exact: true }).waitFor();
    await retryRequest;
    assert.equal(await inventoryStatus.getAttribute('data-error'), null);
    await page.locator('#tab-card').click();
    await page.locator('#tab-inventory').click();
    completeRetry(items);
    await list.waitFor();
    assert.equal(await rows.count(), items.length);
    assert.equal(await inventoryStatus.textContent(), '');
    assert.equal(await inventoryStatus.getAttribute('data-error'), null);

    await page.locator('#tab-notes').click();
    await page.locator('#tab-inventory').click();
    assert.equal(await rows.count(), items.length);
    assert.equal(await inventoryStatus.textContent(), '');
    assert.equal(inventoryRequests(), failedRequestCount + 1);

    player.control.inventory = () => [items[0], null];
    await page.reload();
    await page.locator('#tab-inventory').click();
    await page.getByText('Předměty se nepodařilo načíst.', { exact: false }).waitFor();
    assert.equal(await list.isHidden(), true);
    assert.equal(await rows.count(), 0, 'a rendering error must not leave partial rows');
    player.control.inventory = () => storedItems;
    await page.reload();
    await page.locator('#tab-inventory').click();
    await list.waitFor();

    await page.setViewportSize({ width: 1280, height: 800 });
    const add = page.locator('#inventory-item-add');
    const dialog = page.getByRole('dialog', { name: /předmět/ });
    const name = dialog.getByLabel('Název předmětu');
    const type = dialog.getByLabel('Typ předmětu');
    const amount = dialog.getByLabel('Množství');
    const price = dialog.getByLabel('Cena (GP / kus)');
    const notForSale = dialog.getByLabel('Neprodejné');
    const note = dialog.getByLabel('Poznámka / popis');
    const save = dialog.locator('#inventory-item-save');
    const error = dialog.locator('#inventory-item-error');
    const writes = () => player.requests.filter(({ rpc }) => /^player_(add|update)_inventory_item$/.test(rpc));
    const lantern = list.locator('li').filter({ has: page.getByRole('heading', { name: 'Lucerna', exact: true }) });
    const editLantern = lantern.getByRole('button', { name: 'Upravit předmět' });

    await add.click();
    assert.equal(await dialog.getAttribute('aria-labelledby'), 'inventory-item-form-title');
    await page.getByRole('dialog', { name: 'Přidat předmět', exact: true }).waitFor();
    assert.deepEqual(await type.locator('option').allTextContents(), Object.values(categories));
    assert.equal(await type.inputValue(), 'other');
    assert.equal(await amount.inputValue(), '1');
    assert.equal(await notForSale.isChecked(), false);
    await name.fill('   ');
    await save.click();
    assert.equal(await error.textContent(), 'Vyplň název předmětu.');
    await name.fill('Lucerna');
    await amount.fill('1.9');
    await save.click();
    assert.match(await error.textContent(), /kladné celé číslo/);
    await amount.fill('2');
    await price.fill('-1');
    await save.click();
    assert.match(await error.textContent(), /nezápornou cenu/);
    assert.equal(writes().length, 0);
    await type.selectOption('adventuring_gear');
    await price.fill('1,25');
    await notForSale.check();
    await note.fill('Náhradní plamen');
    let finishSave;
    const pendingSave = new Promise(resolve => { finishSave = resolve; });
    player.control.saveInventory = () => pendingSave;
    await save.click();
    await dialog.getByText('Ukládám…', { exact: true }).waitFor();
    assert.equal(await save.isDisabled(), true);
    await dialog.locator('form').dispatchEvent('submit');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true);
    finishSave(false);
    await dialog.getByText('Předmět se nepodařilo uložit.', { exact: false }).waitFor();
    assert.equal(writes().length, 1);
    assert.equal(await name.inputValue(), 'Lucerna');
    assert.equal(await type.inputValue(), 'adventuring_gear');
    assert.equal(await amount.inputValue(), '2');
    assert.equal(await price.inputValue(), '1,25');
    assert.equal(await notForSale.isChecked(), true);
    assert.equal(await note.inputValue(), 'Náhradní plamen');
    assert.equal(await lantern.count(), 0);

    player.control.saveInventory = () => true;
    await save.click();
    await lantern.waitFor();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes().at(-1), { rpc: 'player_add_inventory_item', args: {
      p_session_token: 'ab'.repeat(32), p_character_id: idA, p_name: 'Lucerna',
      p_item_type: 'adventuring_gear', p_quantity: 2, p_price_gp: 1.25, p_not_for_sale: true, p_note: 'Náhradní plamen',
    } });
    assert.match(await lantern.textContent(), /1,25 GP \/ ks.*Neprodejné.*Náhradní plamen/s);

    await editLantern.click();
    await page.getByRole('dialog', { name: 'Upravit předmět', exact: true }).waitFor();
    assert.equal(await name.inputValue(), 'Lucerna');
    assert.equal(await price.inputValue(), '1,25');
    await amount.fill('4');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    const itemId = storedItems.find(item => item.name === 'Lucerna').id;
    assert.deepEqual(writes().at(-1), { rpc: 'player_update_inventory_item', args: {
      p_session_token: 'ab'.repeat(32), p_character_id: idA, p_item_id: itemId, p_patch: { quantity: 4 },
    } });
    assert.match(await lantern.textContent(), /Množství: 4.*1,25 GP \/ ks.*Neprodejné.*Náhradní plamen/s);

    await editLantern.click();
    await price.fill('0');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes().at(-1).args.p_patch, { price_gp: 0 });
    assert.match(await lantern.textContent(), /0 GP \/ ks.*Neprodejné/s);
    await editLantern.click();
    await price.fill('');
    await note.fill('');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes().at(-1).args.p_patch, { price_gp: null, note: null });
    assert.doesNotMatch(await lantern.textContent(), /\bGP\b|Náhradní plamen/);

    await page.setViewportSize({ width: 320, height: 800 });
    await add.tap();
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await name.fill('Rozpracovaná položka');
    const beforeCancel = writes().length;
    await dialog.getByRole('button', { name: 'Zrušit' }).click();
    assert.equal(writes().length, beforeCancel);
    await add.focus();
    await page.keyboard.press('Enter');
    await name.fill('Hůl');
    await name.press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(writes().length, beforeCancel + 1);
    assert.deepEqual(writes().at(-1).args, {
      p_session_token: 'ab'.repeat(32), p_character_id: idA, p_name: 'Hůl',
      p_item_type: 'other', p_quantity: 1, p_price_gp: null, p_not_for_sale: false, p_note: null,
    });
    await list.getByRole('heading', { name: 'Hůl', exact: true }).waitFor();
    await page.reload();
    await page.locator('#tab-inventory').click();
    await list.getByRole('heading', { name: 'Hůl', exact: true }).waitFor();
    assert.match(await lantern.textContent(), /Množství: 4.*Neprodejné/s);
    assert.equal(await page.locator(legacySelectors).count(), 0);

    const deletedItem = storedItems.find(item => item.name === 'Předmět A1');
    const deleteRow = rows.filter({ has: page.getByRole('heading', { name: deletedItem.name, exact: true }) });
    const remove = deleteRow.getByRole('button', { name: 'Smazat předmět' });
    const targetSize = await remove.boundingBox();
    assert.ok(targetSize.width >= 44 && targetSize.height >= 44);
    const deletes = () => player.requests.filter(({ rpc }) => rpc === 'player_delete_inventory_item');
    const activateDelete = () => remove.press('Enter');
    await confirmDeletion(page, activateDelete, deletedItem.name, false);
    assert.equal(deletes().length, 0);
    assert.equal(await deleteRow.count(), 1);

    let finishDelete;
    const pendingDelete = new Promise(resolve => { finishDelete = resolve; });
    player.control.saveInventory = () => pendingDelete;
    const deleteRequest = page.waitForRequest(request => request.url().endsWith('/player_delete_inventory_item'));
    await confirmDeletion(page, activateDelete, deletedItem.name);
    await deleteRequest;
    assert.equal(await remove.getAttribute('aria-disabled'), 'true');
    await remove.dispatchEvent('click');
    assert.equal(await deleteRow.count(), 1);
    finishDelete(false);
    await page.getByText('Předmět se nepodařilo smazat.', { exact: false }).waitFor();
    assert.equal(deletes().length, 1);
    assert.equal(await deleteRow.count(), 1);

    player.control.saveInventory = () => true;
    const countBeforeDelete = await rows.count();
    const readsBeforeDelete = inventoryRequests();
    await confirmDeletion(page, activateDelete, deletedItem.name);
    await deleteRow.waitFor({ state: 'detached' });
    assert.deepEqual(deletes().at(-1).args, {
      p_session_token: 'ab'.repeat(32), p_character_id: idA, p_item_id: deletedItem.id,
    });
    assert.equal(deletes().length, 2);
    assert.equal(await rows.count(), countBeforeDelete - 1);
    assert.equal(storedItems.some(item => item.id === deletedItem.id), false);
    assert.equal(inventoryRequests(), readsBeforeDelete);
    assert.equal(await lantern.count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement?.closest('li')?.querySelector('h4')?.textContent), 'Předmět A2');
    await player.context.close();

    const lastItem = { ...items[0], name: 'Poslední předmět' };
    const single = await fixture(browser, 'player', 320, [lastItem]);
    await single.page.goto(sheetUrl + '&tab=inventory');
    await confirmDeletion(single.page, () => single.page.getByRole('button', { name: 'Smazat předmět' }).tap(), lastItem.name);
    await single.page.getByText('Zatím nemáš žádné předměty.', { exact: true }).waitFor();
    assert.equal(await single.page.locator('#inventory-items-list').isHidden(), true);
    assert.equal(await single.page.evaluate(() => document.activeElement?.id), 'inventory-item-add');
    await single.context.close();

    const leader = await fixture(browser, 'leader', 1100, storedItems);
    await leader.page.goto(origin + '/index.html?view=players');
    const playerA = leader.page.getByRole('button', { name: 'Postava A' });
    const playerB = leader.page.getByRole('button', { name: 'Postava B' });
    const iframe = leader.page.frameLocator('#leader-sheet');
    const leaderList = iframe.locator('#inventory-items-list');
    await playerA.click();
    await iframe.locator('#tab-inventory').click();
    await leaderList.waitFor();
    assert.equal(await leaderList.locator('li').count(), 10);
    assert.match(await leaderList.locator('li').filter({ hasText: 'Lucerna' }).textContent(), /Množství: 4.*Neprodejné/s);
    assert.equal(await iframe.locator('#inventory-item-add').isHidden(), true);
    assert.equal(await iframe.locator('#inventory-item-dialog').isHidden(), true);
    assert.equal(await leaderList.getByRole('button', { name: 'Upravit předmět' }).count(), 0);
    assert.equal(await leaderList.getByRole('button', { name: 'Smazat předmět' }).count(), 0);
    assert.equal(await iframe.locator(legacySelectors).count(), 0);
    await leader.page.waitForFunction(() => {
      const sheet = document.querySelector('#leader-sheet');
      return +sheet.dataset.iframeHeight >= +sheet.dataset.contentHeight && +sheet.dataset.contentHeight > 100;
    });

    let finishStale;
    let startedStale;
    const started = new Promise(resolve => { startedStale = resolve; });
    const shield = { ...items[1], character_id: idB, name: 'Štít postavy B', note: null };
    leader.control.inventory = id => id === idA ? new Promise(resolve => {
      finishStale = resolve;
      startedStale();
    }) : [shield];
    // Start a pending read for the current selection through the same parent bridge.
    await leader.page.evaluate(id => {
      window.staleInventory = window.loadLeaderInventoryItems(id).then(() => 'accepted', () => 'rejected');
    }, idA);
    await started;
    await playerB.click();
    await iframe.getByText('Postava B', { exact: true }).waitFor();
    await iframe.locator('#tab-inventory').click();
    await leaderList.getByText(shield.name).waitFor();
    finishStale(items);
    assert.equal(await leader.page.evaluate(() => window.staleInventory), 'rejected');
    assert.equal(await leaderList.locator('li').count(), 1);
    await leader.page.setViewportSize({ width: 390, height: 800 });
    assert.equal(await leaderList.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.deepEqual(leader.requests.filter(({ rpc }) => rpc === 'leader_inventory_items').map(({ args }) => args.p_character_id), [idA, idA, idB]);
    await leader.context.close();
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('PASS: inventory read, add, edit, delete, retry, mobile, legacy removal, and leader preview'))
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => server.close());
