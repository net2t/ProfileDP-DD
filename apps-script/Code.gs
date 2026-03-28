const SHEET_MESSAGES = 'Messages';
const SHEET_THREAD = 'Thread';

const MSG_COL_MSGID = 1;
const MSG_COL_NICK = 2;
const MSG_COL_PINHASH = 3;
const MSG_COL_CREATED_AT = 4;

const TH_COL_MSGID = 1;
const TH_COL_SENDER = 2;
const TH_COL_MESSAGE = 3;
const TH_COL_TIMESTAMP = 4;

function doGet(e) {
  return handleGet(e);
}

function doPost(e) {
  try {
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
    const msgSheet = getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At']);
    const threadSheet = getOrCreateSheet_(ss, SHEET_THREAD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);

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

    const threadData = threadSheet.getDataRange().getValues();
    const userMsgs = [];
    let lastOwner = null;

    for (let i = 1; i < threadData.length; i++) {
      const rowMsgId = String(threadData[i][TH_COL_MSGID - 1]).trim().toUpperCase();
      if (rowMsgId !== msgId) continue;

      const sender = String(threadData[i][TH_COL_SENDER - 1]).trim().toLowerCase();
      const message = String(threadData[i][TH_COL_MESSAGE - 1]).trim();
      const timestamp = String(threadData[i][TH_COL_TIMESTAMP - 1]).trim();
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
  const msgSheet = getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At']);
  const threadSheet = getOrCreateSheet_(ss, SHEET_THREAD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);

  const pinHash = hashPin_(pin);

  msgSheet.appendRow([
    msgId,
    nickname,
    pinHash,
    timestamp || new Date().toISOString()
  ]);

  threadSheet.appendRow([
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
  const msgSheet = getOrCreateSheet_(ss, SHEET_MESSAGES, ['MSG-ID', 'Nickname', 'PIN Hash', 'Created At']);
  const threadSheet = getOrCreateSheet_(ss, SHEET_THREAD, ['MSG-ID', 'Sender', 'Message', 'Timestamp']);

  const pinHash = hashPin_(pin);
  const msgData = msgSheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < msgData.length; i++) {
    const rowMsgId = String(msgData[i][MSG_COL_MSGID - 1]).trim().toUpperCase();
    if (rowMsgId !== msgId) continue;

    const rowHash = String(msgData[i][MSG_COL_PINHASH - 1]).trim();
    if (rowHash !== pinHash) return makeResponse({ status: 'error', message: 'Wrong PIN' });

    found = true;
    break;
  }

  if (!found) return makeResponse({ status: 'error', message: 'Message ID not found' });

  threadSheet.appendRow([
    msgId,
    'user',
    message,
    timestamp || new Date().toISOString()
  ]);

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
  }

  return sheet;
}
