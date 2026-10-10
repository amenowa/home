const H = require('./harness');
let fails = 0, passes = 0;
function check(name, cond, extra = '') { if (cond) { passes++; console.log('  ✓ ' + name); } else { fails++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }
function noErrors(page, label) { check(label + ': no JS errors', page.errors.length === 0, page.errors.join(' | ')); page.errors.length = 0; }

(async () => {
  const browser = await H.launch();
  const EMAIL = 'family@example.com', PASS = 'pass1234';

  console.log('\n[1] Fresh device A: sign-up → login → initial state');
  const A = await H.newDevice(browser, 'A-iPad', { viewport: { width: 820, height: 1180 } });
  await H.open(A);
  check('login screen shown', !(await H.loggedIn(A)));
  const m = await H.signup(A, EMAIL, PASS);
  check('sign-up message', /確認メール/.test(m), m);
  await A.click('#backUp');
  await H.login(A, EMAIL, PASS);
  check('logged in', await H.loggedIn(A));
  await H.waitSync(A);
  check('cloud icon ok', (await H.cloudIcon(A)) === '☁️', await H.cloudIcon(A));
  check('date rendered', /がつ/.test(await A.locator('#date').textContent()));
  check('missions rendered (6 or 7)', (await A.locator('#list .tile').count()) >= 6);
  check('single child → switcher hidden', !(await H.kidsVisible(A)));
  check('points 0', (await H.pts(A)) === 0);
  noErrors(A, 'A');

  console.log('\n[2] A: child checks missions, parent approves → points');
  await H.tab(A, 'am');
  await H.tapMission(A, 0); await H.tapMission(A, 1);
  check('2 done', (await H.doneCount(A)) === 2);
  check('approve badge = 2', (await A.locator('#pendBadge').textContent()) === '2');
  check('parent screen opens with PIN', await H.openParent(A));
  await A.click('#approveAll'); await A.waitForTimeout(200);
  await H.closeParent(A);
  check('points = 2', (await H.pts(A)) === 2, String(await H.pts(A)));
  check('2 approved tiles', (await H.okCount(A)) === 2);
  await H.waitSync(A);
  check('cloud saved', (await H.cloudIcon(A)) === '☁️');
  check('server has points', JSON.stringify(H.server.rows).includes('"points":2'));
  noErrors(A, 'A');

  console.log('\n[3] Second device B (iPhone, fresh) logs in → sees A\'s data, never overwrites');
  const B = await H.newDevice(browser, 'B-iPhone');
  await H.open(B);
  await H.login(B, EMAIL, PASS); await H.waitSync(B);
  check('B logged in', await H.loggedIn(B));
  check('no merge dialog on pristine device', !(await H.modalVisible(B)));
  check('B points = 2', (await H.pts(B)) === 2, String(await H.pts(B)));
  check('B shows 2 approved', (await H.okCount(B)) === 2);
  check('server still has points', JSON.stringify(H.server.rows).includes('"points":2'));
  noErrors(B, 'B');

  console.log('\n[4] B (parent phone) adjusts points → A receives via realtime');
  check('B parent opens', await H.openParent(B));
  await B.click('#adjust'); await B.waitForTimeout(100);
  await B.fill('#mIn', '5'); await H.modalOk(B); await B.waitForTimeout(100); await H.modalOk(B); // alert
  await H.closeParent(B);
  check('B points = 7', (await H.pts(B)) === 7, String(await H.pts(B)));
  await H.waitSync(B); await A.waitForTimeout(300);
  check('A points = 7 (realtime)', (await H.pts(A)) === 7, String(await H.pts(A)));
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[5] A checks a mission while B approves → both land (no clobber)');
  await H.tab(A, 'am'); await H.tapMission(A, 2);
  await H.waitSync(A); await B.waitForTimeout(300);
  check('B sees 3rd mission done', (await H.doneCount(B)) === 3, String(await H.doneCount(B)));
  await H.openParent(B); await B.click('#approveAll'); await B.waitForTimeout(200); await H.closeParent(B);
  await H.waitSync(B); await A.waitForTimeout(300);
  check('A points = 8', (await H.pts(A)) === 8, String(await H.pts(A)));
  check('A shows 3 approved', (await H.okCount(A)) === 3);
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[6] Version update: both devices reload → data persists');
  await H.reload(A); await H.waitSync(A);
  await H.reload(B); await H.waitSync(B);
  check('A still logged in', await H.loggedIn(A));
  check('A points = 8 after reload', (await H.pts(A)) === 8);
  check('B points = 8 after reload', (await H.pts(B)) === 8);
  check('no merge dialog after reload', !(await H.modalVisible(A)) && !(await H.modalVisible(B)));
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[7] Offline-then-sync: B goes background with no refresh, A edits, B returns');
  await H.tab(A, 'pm'); await H.tapMission(A, 0); await H.waitSync(A);
  // simulate B having missed realtime: clear its rt handler and refresh on focus
  await B.evaluate(() => { window.__rtOn = false; });
  await H.openParent(A); await A.click('#approveAll'); await A.waitForTimeout(200); await H.closeParent(A); await H.waitSync(A);
  check('B stale before refresh', (await H.pts(B)) === 8);
  await H.refresh(B);
  check('B catches up on focus → 9', (await H.pts(B)) === 9, String(await H.pts(B)));
  await B.evaluate(() => { window.__rtOn = true; });
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[8] Kids: add second child on B → A shows switcher; delete → hidden');
  await H.openParent(B); await B.click('.pnav button[data-p="kids"]'); await B.waitForTimeout(100);
  await B.click('#addKid'); await B.waitForTimeout(100);
  const inputs = B.locator('#kidEdit input'); await inputs.nth(1).fill('うな'); await B.waitForTimeout(100);
  await H.closeParent(B); await H.waitSync(B); await A.waitForTimeout(300);
  check('A switcher visible', await H.kidsVisible(A));
  check('A kid names', (await H.kidNames(A)).join(',').includes('うな'), (await H.kidNames(A)).join(','));
  // switch to うな on A: points 0, missions default
  await A.locator('#kids button').nth(1).click(); await A.waitForTimeout(100);
  check('A うな points 0', (await H.pts(A)) === 0);
  await A.locator('#kids button').nth(0).click(); await A.waitForTimeout(100);
  check('A こども points 9', (await H.pts(A)) === 9);
  // delete うな on B
  await H.openParent(B); await B.click('.pnav button[data-p="kids"]'); await B.waitForTimeout(100);
  await B.locator('#kidEdit .del').nth(1).click(); await B.waitForTimeout(100); await H.modalOk(B);
  await H.closeParent(B); await H.waitSync(B); await A.waitForTimeout(300);
  check('A switcher hidden again', !(await H.kidsVisible(A)));
  check('A points still 9', (await H.pts(A)) === 9, String(await H.pts(A)));
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[9] Gift exchange on A with parent PIN → B sees deduction and log');
  await H.tab(A, 'gift');
  const gift = A.locator('.gifts .gift').first();
  // make a cheap gift: set cost via parent on B
  await H.openParent(B); await B.click('.pnav button[data-p="gifts"]'); await B.waitForTimeout(100);
  await B.locator('#giftEdit .cst').first().fill('5'); await B.waitForTimeout(100); await H.closeParent(B); await H.waitSync(B); await A.waitForTimeout(300);
  await H.tab(A, 'gift');
  check('A sees gift cost 5', (await A.locator('.gifts .gift .c').first().textContent()).includes('5'));
  await A.locator('.gifts .gift').first().click(); await A.waitForTimeout(100); await H.modalOk(A); await A.waitForTimeout(100);
  await H.enterPin(A); await A.waitForTimeout(200);
  check('A points = 4 after exchange', (await H.pts(A)) === 4, String(await H.pts(A)));
  await H.waitSync(A); await B.waitForTimeout(300);
  check('B points = 4', (await H.pts(B)) === 4, String(await H.pts(B)));
  check('B log has spend entry', (await H.logCount(B)) >= 5);
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[10] PIN change on A → B must use new PIN');
  await H.openParent(A); await A.click('.pnav button[data-p="missions"]'); await A.waitForTimeout(100);
  await A.click('#pin'); await A.waitForTimeout(100); await H.enterPin(A, '9999'); await A.waitForTimeout(100); await H.modalOk(A);
  await H.closeParent(A); await H.waitSync(A); await B.waitForTimeout(300);
  await B.click('#gear'); await B.waitForTimeout(100); await H.enterPin(B, '1234'); await B.waitForTimeout(100);
  check('B old PIN rejected', await H.modalVisible(B)); await H.modalOk(B);
  check('B new PIN works', await H.openParent(B, '9999')); await H.closeParent(B);
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log('\n[11] Conflict: device C has its own local history (used offline before login) → asks');
  const C = await H.newDevice(browser, 'C-old');
  await H.open(C);
  // seed C with pre-cloud local data (as from the pre-login era): has history
  await C.evaluate(() => {
    const st = { kids: [{ id: 'k1', name: 'そら', em: '🐣' }], cur: 'k1', k: { k1: { days: {}, points: 3, log: [{ ts: 1, type: 'earn', text: 'x', p: 3 }] } }, updatedAt: 1 };
    localStorage.setItem('missions:v1', JSON.stringify(st));
  });
  await H.reload(C);
  await H.login(C, EMAIL, PASS); await C.waitForTimeout(600);
  check('C asked which to keep', await H.modalVisible(C));
  check('C dialog has cloud option', (await C.locator('#mNo').textContent()) === 'クラウドのデータ');
  await H.modalNo(C); await C.waitForTimeout(300);
  check('C uses cloud (4pt)', (await H.pts(C)) === 4, String(await H.pts(C)));
  check('server untouched (still 4pt)', JSON.stringify(H.server.rows).includes('"points":4'));
  noErrors(C, 'C');

  console.log('\n[12] Second family D is isolated');
  const D = await H.newDevice(browser, 'D-friend');
  await H.open(D); await H.signup(D, 'friend@example.com', 'friend123'); await D.click('#backUp'); await H.login(D, 'friend@example.com', 'friend123'); await H.waitSync(D);
  check('D points 0', (await H.pts(D)) === 0);
  await H.tab(D, 'am'); await H.tapMission(D, 0); await H.openParent(D); await D.click('#approveAll'); await D.waitForTimeout(200); await H.closeParent(D); await H.waitSync(D);
  check('D points 1', (await H.pts(D)) === 1);
  await A.waitForTimeout(300);
  check('A unaffected (4)', (await H.pts(A)) === 4, String(await H.pts(A)));
  noErrors(D, 'D');

  console.log('\n[13] Logout on B → login screen; data remains in cloud; re-login restores');
  await H.openParent(B, '9999'); await B.click('#logout'); await B.waitForTimeout(100); await H.modalOk(B); await B.waitForTimeout(500);
  check('B shows login after logout', !(await H.loggedIn(B)));
  await H.login(B, EMAIL, PASS); await H.waitSync(B);
  check('B restored 4pt', (await H.pts(B)) === 4, String(await H.pts(B)));
  noErrors(B, 'B');

  console.log('\n[14] Bulk approve past range on B → A');
  await H.openParent(B, '9999');
  await B.fill('#fillDate', '2026-10-05'); await B.fill('#fillDateTo', '2026-10-06');
  await B.click('#fillDay'); await B.waitForTimeout(100); await H.modalOk(B); await B.waitForTimeout(100); await H.modalOk(B);
  await H.closeParent(B); await H.waitSync(B); await A.waitForTimeout(300);
  const expect = 4 + 2 * 13;
  check('B points = ' + expect, (await H.pts(B)) === expect, String(await H.pts(B)));
  check('A points = ' + expect, (await H.pts(A)) === expect, String(await H.pts(A)));
  noErrors(A, 'A'); noErrors(B, 'B');

  console.log(`\n==== ${passes} passed, ${fails} failed ====`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
