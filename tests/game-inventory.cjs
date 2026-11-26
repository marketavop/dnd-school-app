// Real game layout and panel modules with an isolated backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const alice = '12345678-1234-4321-9876-123456789abc';
const bob = 'abcdefab-1234-4321-9876-abcdefabcdef';
const token = 'ab'.repeat(32);
const name = '<img src=x onerror=alert(1)>';
const note = '<script>alert(1)</script>\n**doslovný text**\n' + 'dlouhý'.repeat(100);
const items = [
  { id: randomUUID(), character_id: alice, name, item_type: 'weapon', quantity: 2, price_gp: 0, not_for_sale: true, note },
  { id: randomUUID(), character_id: alice, name: 'DlouhýNázev'.repeat(40), item_type: 'tool', quantity: 1, price_gp: null },
];
const bobItem = { id: randomUUID(), character_id: bob, name: 'Poslední předmět', item_type: 'other', quantity: 1 };
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, '../public', new URL(req.url, 'http://localhost').pathname);
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png' };
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

async function confirmRemoval(page, activate, name, accepted = true) {
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
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const sheetSession = { user_id: alice, role: 'player', character_id: alice, session_token: token };
    await context.addInitScript(session => {
      sessionStorage.setItem('dnd-school.session.v1', JSON.stringify(session));
    }, sheetSession);
    await context.route('https://example.test/rest/v1/rpc/validate_session', route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      assert.deepEqual(route.request().postDataJSON(), { p_session_token: token });
      return route.fulfill({ headers, json: [sheetSession] });
    });
    const requests = [];
    const aliceRecord = { id: alice, name: 'Postava A', inventory: '- **Původní lano**', class_code: 'wizard', level: 1,
      current_hp: 10, max_hp: 10, spells: [{ english_name: 'Shield', czech_name: 'Štít', level: 1, note: 'Ochrana.' }] };
    const bobRecord = { id: bob, name: 'Postava B', inventory: null };
    const storedItems = [...items, bobItem].map(item => ({ ...item }));
    const readInventory = id => ({ data: storedItems.filter(item => item.character_id === id) });
    let inventory = readInventory;
    let saveInventory = () => true;
    await context.exposeFunction('fixtureGameRpc', async (rpc, args) => {
      assert.equal(args.p_session_token, token);
      requests.push({ rpc, args });
      if (rpc === 'character_section_visibility') return { data: [{ section_id: 'spells', is_visible: true }] };
      if (rpc === 'player_inventory_items') return inventory(args.p_character_id);
      if (rpc === 'player_delete_inventory_item') {
        if (!await saveInventory()) return { data: null, error: { message: 'offline' } };
        const index = storedItems.findIndex(row => row.id === args.p_item_id && row.character_id === args.p_character_id);
        assert.notEqual(index, -1);
        storedItems.splice(index, 1);
        return { data: null, error: null }; // PostgREST returns no row for void.
      }
      if (rpc === 'player_add_inventory_item' || rpc === 'player_update_inventory_item') {
        assert.equal(args.p_character_id, alice);
        if (!await saveInventory()) return { error: { message: 'offline' } };
        if (rpc === 'player_add_inventory_item') {
          const item = { id: randomUUID(), character_id: args.p_character_id };
          for (const field of ['name', 'item_type', 'quantity', 'price_gp', 'not_for_sale', 'note']) item[field] = args['p_' + field];
          storedItems.push(item);
          return { data: [item] };
        }
        const item = storedItems.find(row => row.id === args.p_item_id && row.character_id === args.p_character_id);
        assert.ok(item);
        Object.assign(item, args.p_patch);
        return { data: [item] };
      }
      const character = args.p_character_id === alice ? aliceRecord : bobRecord;
      assert.equal(args.p_character_id, character.id);
      if (rpc === 'player_update_character') {
        assert.equal(Object.hasOwn(args.p_patch, 'inventory'), false);
        Object.assign(character, args.p_patch);
      } else assert.equal(rpc, 'player_character');
      return { data: [character] };
    });
    await context.route('**/session-page.js', route => {
      if (new URL(route.request().frame().url()).pathname === '/character.html') return route.continue();
      return route.fulfill({ contentType: 'application/javascript', body:
        "export async function requireSession() { return {role:'player', session_token:'" + token +
        "', character_id:location.search.includes('fixture=bob') ? '" + bob + "' : '" + alice + "'}; }",
      });
    });
    await context.route('**/game-session.js', route => route.fulfill({ contentType: 'application/javascript', body: [
      "export function installGameSession() {",
      "  window.getGameIdentity = () => ({role:'player', character_id:location.search.includes('fixture=bob') ? '" + bob + "' : '" + alice + "'});",
      "  window.loadGameTokens = async () => []; window.loadNpcs = async () => [];",
      "}",
    ].join('\n') }));
    await context.route('**/config.local.js', route => route.fulfill({ contentType: 'application/javascript',
      body: "export const SUPABASE_URL='https://example.test'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';",
    }));
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: [
      "export function createClient() { return {",
      "  rpc: window.fixtureGameRpc,",
      "  channel() { return { on() { return this; }, subscribe(callback) { queueMicrotask(() => callback?.('SUBSCRIBED')); return this; } }; },",
      "  removeChannel() {},",
      "  from(table) { return { select() { return this; }, eq() { return this; }, async single() {",
      "    if (table === 'game_state') return {data:{active_map_id:'test-map'}};",
      "    if (table === 'map_config') return {data:{cell_size:100}};",
      "    throw new Error('Unexpected table ' + table);",
      "  } }; }",
      "}; }",
    ].join('\n') }));

    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = 'http://127.0.0.1:' + server.address().port + '/game.html?character_id=' + bob;
    const trigger = page.locator('#game-character-name');
    const inventoryTab = page.getByRole('tab', { name: 'Inventář' });
    const spellsTab = page.locator('#spells-tab');
    const status = page.locator('#game-inventory-items-status');
    const list = page.locator('#game-inventory-items-list');
    const add = page.locator('#inventory-item-add');
    const inventoryRequests = () => requests.filter(({ rpc }) => rpc === 'player_inventory_items');
    const loadPage = async (address, characterName) => {
      await page.goto(address);
      await trigger.getByText(characterName, { exact: true }).waitFor();
    };
    await loadPage(url, 'Postava A');
    await page.waitForFunction(() => {
      const map = document.querySelector('#map');
      return !map.hidden && map.complete && map.naturalWidth > 0;
    });
    const viewport = page.locator('#map-viewport');
    const mapBefore = await viewport.boundingBox();
    await trigger.click();
    const mapOpen = await viewport.boundingBox();
    assert.ok(mapOpen.width > 0 && mapOpen.height > 0 && mapOpen.width <= mapBefore.width);
    assert.equal(inventoryRequests().length, 0);

    await spellsTab.click();
    const spell = page.getByRole('button', { name: 'Shield (Štít)' });
    await spell.click();
    await page.getByRole('button', { name: 'Spotřebovat pozici 1. úrovně' }).first().click();
    await page.locator('#game-spells-status').getByText('Uloženo', { exact: true }).waitFor();
    assert.equal(await page.locator('.spell-level-hint').textContent(), '1/2');
    await spell.click();
    assert.equal(await spell.getAttribute('aria-expanded'), 'true');

    let fail;
    const pending = new Promise(resolve => { fail = resolve; });
    inventory = () => pending;
    await inventoryTab.click();
    await status.getByText('Načítám předměty…', { exact: true }).waitFor();
    assert.equal(await add.isHidden(), true);
    assert.equal(await list.getByRole('button', { name: 'Upravit předmět' }).count(), 0);
    await spellsTab.click();
    await inventoryTab.click();
    fail({ error: { message: 'offline' } });
    await status.getByText('Předměty se nepodařilo načíst.', { exact: false }).waitFor();
    assert.equal(inventoryRequests().length, 1);
    assert.equal(await list.isHidden(), true);
    assert.equal(await add.isHidden(), true);

    inventory = readInventory;
    await spellsTab.click();
    assert.equal(await spell.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.spell-level-hint').textContent(), '1/2');
    await inventoryTab.click();
    await list.waitFor();
    assert.deepEqual(inventoryRequests().map(({ args }) => args), [
      { p_session_token: token, p_character_id: alice }, { p_session_token: token, p_character_id: alice },
    ]);
    assert.equal(await status.textContent(), '');
    assert.equal(await list.locator('li').count(), 2);
    const [first, second] = await list.locator('li').all();
    assert.equal(await first.locator('h3').textContent(), name);
    assert.deepEqual(await first.locator('.game-inventory-item-meta span').allTextContents(),
      ['Zbraň (Weapon)', 'Množství: 2', '0 GP / ks', 'Neprodejné']);
    assert.deepEqual(await second.locator('.game-inventory-item-meta span').allTextContents(),
      ['Nástroj nebo pomůcka (Tool)', 'Množství: 1']);
    assert.equal(await first.locator('.game-inventory-item-note').textContent(), note);
    assert.equal(await list.locator('img, script, strong, input, textarea, select').count(), 0);
    assert.equal(await list.getByRole('button', { name: 'Upravit předmět' }).count(), 2);
    assert.equal(await list.getByRole('button', { name: 'Smazat předmět' }).count(), 2);
    const legacyInventory = page.locator('#game-inventory-legacy-title, #game-inventory, #inventory-edit-button, #game-inventory-editor, #game-inventory-status');
    assert.equal(await legacyInventory.count(), 0);
    assert.equal(await page.getByText('Původní lano', { exact: true }).count(), 0);

    await spellsTab.click();
    await inventoryTab.click();
    assert.equal(inventoryRequests().length, 2);
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await list.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    assert.equal(await page.locator('#character-panel').evaluate(element => element.scrollWidth <= element.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    const dialog = page.locator('#inventory-item-dialog');
    const itemName = dialog.getByLabel('Název předmětu');
    const type = dialog.getByLabel('Typ předmětu');
    const quantity = dialog.getByLabel('Množství');
    const price = dialog.getByLabel('Cena (GP / kus)');
    const notForSale = dialog.getByLabel('Neprodejné');
    const itemNote = dialog.getByLabel('Poznámka / popis');
    const save = dialog.locator('#inventory-item-save');
    const error = dialog.getByRole('alert');
    const writes = () => requests.filter(({ rpc }) => /^player_(add|update)_inventory_item$/.test(rpc));
    const itemRow = name => list.locator('li').filter({ has: page.getByRole('heading', { name, exact: true }) });

    const mobileMap = await viewport.boundingBox();
    await add.tap();
    assert.equal(await dialog.getByRole('heading').textContent(), 'Přidat předmět');
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.deepEqual(await viewport.boundingBox(), mobileMap);
    assert.equal(await type.locator('option').count(), 9);
    assert.equal(await type.inputValue(), 'other');
    assert.equal(await quantity.inputValue(), '1');
    await itemName.fill('Zrušený návrh');
    await dialog.getByRole('button', { name: 'Zrušit' }).click();
    assert.equal(writes().length, 0);
    await add.focus();
    await page.keyboard.press('Enter');
    await itemName.fill('Hůl');
    await itemName.press('Enter');
    await itemRow('Hůl').waitFor();
    assert.equal(await dialog.isHidden(), true);
    assert.deepEqual(writes().at(-1), { rpc: 'player_add_inventory_item', args: {
      p_session_token: token, p_character_id: alice, p_name: 'Hůl', p_item_type: 'other', p_quantity: 1,
      p_price_gp: null, p_not_for_sale: false, p_note: null,
    } });

    await page.setViewportSize({ width: 1280, height: 800 });
    await add.click();
    await itemName.fill('   ');
    await save.click();
    assert.match(await error.textContent(), /název/);
    await itemName.fill('Lucerna');
    await quantity.fill('1.5');
    await save.click();
    assert.match(await error.textContent(), /kladné celé číslo/);
    await quantity.fill('2');
    await price.fill('-1');
    await save.click();
    assert.match(await error.textContent(), /nezápornou cenu/);
    assert.equal(writes().length, 1);
    await type.selectOption('adventuring_gear');
    await price.fill('1,25');
    await notForSale.check();
    await itemNote.fill('Přišla z výpravy');
    let finishSave;
    const pendingSave = new Promise(resolve => { finishSave = resolve; });
    saveInventory = () => pendingSave;
    await save.click();
    assert.equal(await save.isDisabled(), true);
    await dialog.locator('form').dispatchEvent('submit');
    finishSave(false);
    await error.getByText('Předmět se nepodařilo uložit.', { exact: false }).waitFor();
    assert.equal(writes().length, 2);
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await itemName.inputValue(), 'Lucerna');
    assert.equal(await type.inputValue(), 'adventuring_gear');
    assert.equal(await quantity.inputValue(), '2');
    assert.equal(await price.inputValue(), '1,25');
    assert.equal(await notForSale.isChecked(), true);
    assert.equal(await itemNote.inputValue(), 'Přišla z výpravy');
    saveInventory = () => true;
    await save.click();
    const lantern = itemRow('Lucerna');
    await lantern.waitFor();
    const editLantern = lantern.getByRole('button', { name: 'Upravit předmět' });
    assert.deepEqual(writes().at(-1).args, {
      p_session_token: token, p_character_id: alice, p_name: 'Lucerna', p_item_type: 'adventuring_gear',
      p_quantity: 2, p_price_gp: 1.25, p_not_for_sale: true, p_note: 'Přišla z výpravy',
    });
    assert.match(await lantern.textContent(), /1,25 GP \/ ks.*Neprodejné.*Přišla z výpravy/s);

    await editLantern.click();
    assert.equal(await dialog.getByRole('heading').textContent(), 'Upravit předmět');
    assert.equal(await itemName.inputValue(), 'Lucerna');
    assert.equal(await type.inputValue(), 'adventuring_gear');
    assert.equal(await quantity.inputValue(), '2');
    assert.equal(await price.inputValue(), '1,25');
    assert.equal(await notForSale.isChecked(), true);
    assert.equal(await itemNote.inputValue(), 'Přišla z výpravy');
    await quantity.fill('4');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes().at(-1), { rpc: 'player_update_inventory_item', args: {
      p_session_token: token, p_character_id: alice,
      p_item_id: storedItems.find(item => item.name === 'Lucerna').id, p_patch: { quantity: 4 },
    } });
    assert.match(await lantern.textContent(), /Množství: 4.*1,25 GP \/ ks.*Neprodejné.*Přišla z výpravy/s);
    await editLantern.click();
    await price.fill('0');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes().at(-1).args.p_patch, { price_gp: 0 });
    assert.match(await lantern.textContent(), /0 GP \/ ks.*Neprodejné/s);
    await editLantern.click();
    await price.fill('');
    await itemNote.fill('');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes().at(-1).args.p_patch, { price_gp: null, note: null });
    assert.doesNotMatch(await lantern.textContent(), /\bGP\b|Přišla z výpravy/);
    assert.equal(inventoryRequests().length, 2);

    const deletes = () => requests.filter(({ rpc }) => rpc === 'player_delete_inventory_item');
    const target = itemRow(name);
    const remove = target.getByRole('button', { name: 'Smazat předmět' });
    const hitArea = await remove.boundingBox();
    assert.ok(hitArea.width >= 44 && hitArea.height >= 44);
    const activateDelete = () => remove.press('Enter');
    await confirmRemoval(page, activateDelete, name, false);
    assert.equal(deletes().length, 0);
    assert.equal(await target.count(), 1);

    let finishDelete;
    const pendingDelete = new Promise(resolve => { finishDelete = resolve; });
    saveInventory = () => pendingDelete;
    await confirmRemoval(page, activateDelete, name);
    await status.getByText('Mažu předmět…', { exact: true }).waitFor();
    assert.equal(await remove.getAttribute('aria-disabled'), 'true');
    assert.equal(await editLantern.getAttribute('aria-disabled'), 'true');
    assert.equal(await add.getAttribute('aria-disabled'), 'true');
    let duplicateConfirmation = false;
    const rejectUnexpected = async dialog => { duplicateConfirmation = true; await dialog.dismiss(); };
    page.on('dialog', rejectUnexpected);
    await remove.dispatchEvent('click');
    await remove.dispatchEvent('click');
    page.off('dialog', rejectUnexpected);
    await editLantern.dispatchEvent('click');
    await add.dispatchEvent('click');
    assert.equal(duplicateConfirmation, false);
    assert.equal(await dialog.isHidden(), true);
    assert.equal(await target.count(), 1);
    finishDelete(false);
    await status.getByText('Předmět se nepodařilo smazat.', { exact: false }).waitFor();
    assert.equal(deletes().length, 1);
    assert.equal(await target.count(), 1);
    assert.equal(await add.getAttribute('aria-disabled'), null);

    saveInventory = () => true;
    await confirmRemoval(page, activateDelete, name);
    await target.waitFor({ state: 'detached' });
    const args = { p_session_token: token, p_character_id: alice, p_item_id: items[0].id };
    assert.deepEqual(deletes().map(call => call.args), [args, args]);
    assert.equal(await list.locator('li').count(), 3);
    assert.equal(await lantern.count(), 1);
    assert.equal(inventoryRequests().length, 2);
    assert.equal(await page.evaluate(() => document.activeElement?.closest('li')?.querySelector('h3')?.textContent), items[1].name);
    await spellsTab.click();
    assert.equal(await page.locator('.spell-level-hint').textContent(), '1/2');
    assert.equal(await spell.getAttribute('aria-expanded'), 'true');
    const dice = page.locator('#dice-toggle');
    await dice.click();
    assert.equal(await page.locator('#dice-panel').isVisible(), true);
    await dice.click();
    await trigger.click();
    assert.equal(await page.locator('#spells-panel').isVisible(), true);
    assert.ok((await viewport.boundingBox()).height > 0);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload();
    await trigger.getByText('Postava A', { exact: true }).waitFor();
    await trigger.tap();
    await inventoryTab.tap();
    await itemRow('Lucerna').waitFor();
    assert.match(await lantern.textContent(), /Množství: 4.*Neprodejné/s);
    assert.doesNotMatch(await lantern.textContent(), /\bGP\b|Přišla z výpravy/);
    await itemRow('Hůl').waitFor();
    assert.equal(await itemRow(name).count(), 0);
    assert.equal(await legacyInventory.count(), 0);
    assert.equal(aliceRecord.inventory, '- **Původní lano**');

    const sheet = await context.newPage();
    sheet.setDefaultTimeout(10000);
    await sheet.goto(new URL('/character.html?character_id=' + alice + '&tab=inventory', url).href);
    const sheetItems = sheet.locator('#inventory-items-list');
    await sheetItems.getByRole('heading', { name: 'Hůl', exact: true }).waitFor();
    const sheetLantern = sheetItems.locator('li').filter({ has: sheet.getByRole('heading', { name: 'Lucerna', exact: true }) });
    assert.match(await sheetLantern.textContent(), /Množství: 4.*Neprodejné/s);
    assert.doesNotMatch(await sheetLantern.textContent(), /\bGP\b|Přišla z výpravy/);
    assert.equal(await sheetItems.getByRole('heading', { name, exact: true }).count(), 0);
    await sheet.close();
    // A response carrying the previous character's rows must never be rendered.
    inventory = () => ({ data: items });
    await loadPage(url + '&fixture=bob', 'Postava B');
    await trigger.tap();
    await inventoryTab.tap();
    await status.getByText('Předměty se nepodařilo načíst.', { exact: false }).waitFor();
    assert.equal(await list.locator('li').count(), 0);
    inventory = readInventory;
    await page.locator('#overview-tab').tap();
    await inventoryTab.tap();
    const lastRemove = list.getByRole('button', { name: 'Smazat předmět' });
    await lastRemove.waitFor();
    let finishLastDelete;
    const pendingLastDelete = new Promise(resolve => { finishLastDelete = resolve; });
    saveInventory = () => pendingLastDelete;
    await confirmRemoval(page, () => lastRemove.tap(), bobItem.name);
    await status.getByText('Mažu předmět…', { exact: true }).waitFor();
    await lastRemove.blur(); // Some browsers leave focus on the body after a tap.
    finishLastDelete(true);
    await status.getByText('Zatím nemáš žádné předměty.', { exact: true }).waitFor();
    assert.equal(await list.locator('li').count(), 0);
    assert.equal(await list.isHidden(), true);
    assert.equal(await add.evaluate(element => element === document.activeElement), true);
    assert.equal(inventoryRequests().at(-1).args.p_character_id, bob);
    assert.deepEqual(deletes().at(-1).args, { p_session_token: token, p_character_id: bob, p_item_id: bobItem.id });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

run().then(() => console.log('PASS: game inventory add/edit/read/delete, validation, shared data, legacy removal, spells and map'))
  .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
