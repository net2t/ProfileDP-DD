const SHEET_MESSAGES = 'Messages';
const SHEET_RECORD = 'Record';

const MSG_COL_MSGID = 1;
const MSG_COL_NICK = 2;
const MSG_COL_PINHASH = 3;
const MSG_COL_CREATED_AT = 4;
const MSG_COL_MESSAGE = 5;
const MSG_COL_REPLIED = 6;

const REC_COL_MSGID = 1;
const REC_COL_SENDER = 2;
const REC_COL_MESSAGE = 3;
const REC_COL_TIMESTAMP = 4;

const PROP_LAST_NOTIFIED_ROW = 'LAST_NOTIFIED_ROW';
const PROP_PUSHBULLET_TOKEN = 'PUSHBULLET_TOKEN';

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('OutLawZ')
    .addItem('Setup Sheets', 'setup')
    .addSeparator()
    .addItem('Set Pushbullet Token', 'setPushbulletToken')
    .addItem('Enable Message Notifications', 'enableMessageNotifications')
    .addItem('Disable Message Notifications', 'disableMessageNotifications')
    .addSeparator()
    .addItem('Clear Replied Messages', 'clearRepliedMessages')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At', 'Message', 'Replied?']);
  getOrCreateSheet_(ss, SHEET_RECORD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);
}

function setPushbulletToken() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const res = ui.prompt('Pushbullet Access Token', 'Enter Pushbullet Access Token:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = String(res.getResponseText() || '').trim();
  if (!token) {
    ui.alert('Invalid token.');
    return;
  }
  props.setProperty(PROP_PUSHBULLET_TOKEN, token);
  props.deleteProperty(PROP_LAST_NOTIFIED_ROW);
  ui.alert('Saved.');
}

function enableMessageNotifications() {
  setup();
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(PROP_PUSHBULLET_TOKEN);
  if (!token) {
    SpreadsheetApp.getUi().alert('Set Pushbullet Token first.');
    return;
  }
  disableMessageNotifications();
  ScriptApp.newTrigger('notifyNewMessages')
    .timeBased()
    .everyMinutes(1)
    .create();
  SpreadsheetApp.getUi().alert('Enabled.');
}

function disableMessageNotifications() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'notifyNewMessages') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function notifyNewMessages() {
  setup();
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(PROP_PUSHBULLET_TOKEN);
  if (!token) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recordSheet = ss.getSheetByName(SHEET_RECORD);
  const lastRow = recordSheet.getLastRow();
  if (lastRow < 2) return;

  const lastNotified = Number(props.getProperty(PROP_LAST_NOTIFIED_ROW) || 1);
  if (lastRow <= lastNotified) return;

  const start = Math.max(2, lastNotified + 1);
  const values = recordSheet.getRange(start, 1, lastRow - start + 1, 4).getValues();

  let newestUser = null;
  for (let i = 0; i < values.length; i++) {
    const msgId = String(values[i][REC_COL_MSGID - 1]).trim().toUpperCase();
    const sender = String(values[i][REC_COL_SENDER - 1]).trim().toLowerCase();
    const message = String(values[i][REC_COL_MESSAGE - 1]).trim();
    const ts = String(values[i][REC_COL_TIMESTAMP - 1]).trim();
    if (!msgId || !message) continue;
    if (sender !== 'user') continue;
    newestUser = { msgId, message, ts };
  }

  props.setProperty(PROP_LAST_NOTIFIED_ROW, String(lastRow));
  if (!newestUser) return;

  const subject = 'New Message: ' + newestUser.msgId;
  const body = 'MSG-ID: ' + newestUser.msgId + '\n' +
    'Time: ' + (newestUser.ts || '') + '\n\n' +
    newestUser.message;
  pushbulletPush_(token, subject, body);
}

function pushbulletPush_(token, title, body) {
  const url = 'https://api.pushbullet.com/v2/pushes';
  const payload = {
    type: 'note',
    title: String(title || ''),
    body: String(body || '')
  };

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      'Access-Token': token
    },
    muteHttpExceptions: true
  });
}

function doGet(e) {
  setup();
  return handleGet(e);
}

function doPost(e) {
  try {
    setup();
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const action = String(body.action || '');

    if (action === 'sendMessage') return handleSendMessage(body);
    if (action === 'addReply') return handleAddReply(body);

    return makeResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return makeResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function handleGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const action = String(p.action || '');

    if (action !== 'getConversation') {
      return makeResponse({ status: 'error', message: 'Unknown action: ' + action });
    }

    const msgId = String(p.msgId || '').trim().toUpperCase();
    const pin = String(p.pin || '').trim();

    if (!msgId || pin.length !== 4 || isNaN(pin)) {
      return makeResponse({ status: 'error', message: 'Invalid input' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const msgSheet = getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At', 'Message', 'Replied?']);
    const recordSheet = getOrCreateSheet_(ss, SHEET_RECORD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);

    const pinHash = hashPin_(pin);

    const msgData = msgSheet.getDataRange().getValues();
    let nickname = '';
    let found = false;

    for (let i = 1; i < msgData.length; i++) {
      const rowMsgId = String(msgData[i][MSG_COL_MSGID - 1]).trim().toUpperCase();
      if (rowMsgId !== msgId) continue;

      const rowHash = String(msgData[i][MSG_COL_PINHASH - 1]).trim();
      if (rowHash !== pinHash) return makeResponse({ status: 'error', message: 'Wrong PIN' });

      nickname = String(msgData[i][MSG_COL_NICK - 1]).trim();
      found = true;
      break;
    }

    if (!found) return makeResponse({ status: 'error', message: 'Message ID not found' });

    const recordData = recordSheet.getDataRange().getValues();
    const userMsgs = [];
    let lastOwner = null;

    for (let i = 1; i < recordData.length; i++) {
      const rowMsgId = String(recordData[i][REC_COL_MSGID - 1]).trim().toUpperCase();
      if (rowMsgId !== msgId) continue;

      const sender = String(recordData[i][REC_COL_SENDER - 1]).trim().toLowerCase();
      const message = String(recordData[i][REC_COL_MESSAGE - 1]).trim();
      const timestamp = String(recordData[i][REC_COL_TIMESTAMP - 1]).trim();
      if (!message) continue;

      if (sender === 'owner') {
        lastOwner = { sender: 'owner', message, timestamp };
      } else {
        userMsgs.push({ sender: 'user', message, timestamp });
      }
    }

    const messages = lastOwner ? userMsgs.concat([lastOwner]) : userMsgs;

    return makeResponse({
      status: 'ok',
      msgId,
      nickname,
      messages
    });
  } catch (err) {
    return makeResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function handleSendMessage(body) {
  const msgId = String(body.msgId || '').trim().toUpperCase();
  const nickname = String(body.nickname || '').trim();
  const pin = String(body.pin || '').trim();
  const message = String(body.message || '').trim();
  const timestamp = String(body.timestamp || '').trim();

  if (!msgId || !nickname || pin.length !== 4 || isNaN(pin) || !message) {
    return makeResponse({ status: 'error', message: 'Missing fields' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const msgSheet = getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At', 'Message', 'Replied?']);
  const recordSheet = getOrCreateSheet_(ss, SHEET_RECORD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);

  const pinHash = hashPin_(pin);

  msgSheet.appendRow([
    msgId,
    nickname,
    pinHash,
    timestamp || new Date().toISOString(),
    message,
    false
  ]);

  recordSheet.appendRow([
    msgId,
    'user',
    message,
    timestamp || new Date().toISOString()
  ]);

  return makeResponse({ status: 'ok', msgId });
}

function handleAddReply(body) {
  const msgId = String(body.msgId || '').trim().toUpperCase();
  const pin = String(body.pin || '').trim();
  const message = String(body.message || '').trim();
  const timestamp = String(body.timestamp || '').trim();

  if (!msgId || pin.length !== 4 || isNaN(pin) || !message) {
    return makeResponse({ status: 'error', message: 'Missing fields' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const msgSheet = getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At', 'Message', 'Replied?']);
  const recordSheet = getOrCreateSheet_(ss, SHEET_RECORD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);

  const pinHash = hashPin_(pin);
  const msgData = msgSheet.getDataRange().getValues();
  let found = false;
  let rowIndex = -1;

  for (let i = 1; i < msgData.length; i++) {
    const rowMsgId = String(msgData[i][MSG_COL_MSGID - 1]).trim().toUpperCase();
    if (rowMsgId !== msgId) continue;

    const rowHash = String(msgData[i][MSG_COL_PINHASH - 1]).trim();
    if (rowHash !== pinHash) return makeResponse({ status: 'error', message: 'Wrong PIN' });

    found = true;
    rowIndex = i + 1;
    break;
  }

  if (!found) return makeResponse({ status: 'error', message: 'Message ID not found' });

  recordSheet.appendRow([
    msgId,
    'user',
    message,
    timestamp || new Date().toISOString()
  ]);

  msgSheet.getRange(rowIndex, MSG_COL_REPLIED).setValue(true);

  return makeResponse({ status: 'ok' });
}

function makeResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function hashPin_(pin) {
  const str = 'outlawz_' + String(pin) + '_salt';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).toUpperCase();
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    if (name === SHEET_MESSAGES && headers.length > 5) {
      sheet.getRange(1, MSG_COL_REPLIED).insertCheckboxes();
    }
  }

  return sheet;
}

function clearRepliedMessages() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('Clear Replied Messages', 'Delete all rows where Replied? is checked?', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MESSAGES);
  if (!sheet) {
    ui.alert('Messages sheet not found.');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][MSG_COL_REPLIED - 1] === true) {
      rowsToDelete.push(i + 1);
    }
  }

  rowsToDelete.forEach(row => sheet.deleteRow(row));
  ui.alert('Deleted ' + rowsToDelete.length + ' replied message(s).');
}
