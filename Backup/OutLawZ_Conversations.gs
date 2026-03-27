// ═══════════════════════════════════════════════════════════════════
//  OutLawZ — Conversation Message System (Apps Script)
//
//  SHEET STRUCTURE — each row = one message in a thread:
//  A: MSG-ID      — conversation identifier (same for all replies)
//  B: Nickname    — visitor's nickname (same for all in thread)
//  C: PIN-Hash    — hashed PIN (same for all in thread)
//  D: Sender      — 'user' or 'owner'
//  E: Message     — the actual message text
//  F: Timestamp   — when sent (PK time)
//
//  HOW IT WORKS:
//  - First message: new row, new MSG-ID, PIN hashed and stored
//  - Visitor reply: new row, SAME MSG-ID — appended to thread
//  - Owner reply:   you type in Google Sheets — new row, sender='owner'
//  - getConversation: returns all rows with matching MSG-ID + valid PIN
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME = "Conversations";

// Column positions (1-indexed)
const COL_MSGID     = 1;  // A — Conversation ID
const COL_NICKNAME  = 2;  // B — Visitor nickname
const COL_PINHASH   = 3;  // C — Hashed 4-digit PIN
const COL_SENDER    = 4;  // D — 'user' or 'owner'
const COL_MESSAGE   = 5;  // E — Message text
const COL_TIMESTAMP = 6;  // F — Timestamp


// ══════════════════════════════════════════════════════════════
//  onOpen — Custom menu when you open the Sheet
// ══════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💬 OutLawZ Conversations')
    .addItem('📋 Setup Sheet', 'setupSheet')
    .addItem('📊 View Stats', 'showStats')
    .addItem('✏️ How to Reply', 'showReplyHelp')
    .addItem('🗑️ Clear All Data', 'clearAll')
    .addSeparator()
    .addItem('ℹ️ Deploy Help', 'showDeployHelp')
    .addToUi();
}


// ══════════════════════════════════════════════════════════════
//  doPost — Receives new messages from the HTML page
//  Handles two actions:
//    sendMessage — first message, creates new thread
//    addReply    — visitor follow-up, appends to existing thread
// ══════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || '';

    if (action === 'sendMessage') {
      return handleSendMessage(data);
    }

    if (action === 'addReply') {
      return handleAddReply(data);
    }

    return makeResponse({ status: 'error', message: 'Unknown action: ' + action });

  } catch (err) {
    return makeResponse({ status: 'error', message: err.message });
  }
}


// ── handleSendMessage: Creates first row of a new conversation
function handleSendMessage(data) {
  // Validate required fields
  if (!data.msgId || !data.nickname || !data.pin || !data.message) {
    return makeResponse({ status: 'error', message: 'Missing fields' });
  }

  const sheet   = getOrCreateSheet();
  const pinHash = hashPin(String(data.pin).trim());

  // Append first message row of this conversation
  sheet.appendRow([
    data.msgId,                    // A — MSG-ID
    data.nickname,                 // B — Nickname (stored once, reused for whole thread)
    pinHash,                       // C — Hashed PIN
    'user',                        // D — Sender = visitor
    data.message,                  // E — Message text
    data.timestamp || now()        // F — Timestamp
  ]);

  return makeResponse({ status: 'ok', msgId: data.msgId });
}


// ── handleAddReply: Visitor sends another message in existing thread
function handleAddReply(data) {
  if (!data.msgId || !data.pin || !data.message) {
    return makeResponse({ status: 'error', message: 'Missing fields' });
  }

  const sheet   = getOrCreateSheet();
  const pinHash = hashPin(String(data.pin).trim());

  // First verify MSG-ID + PIN exist in sheet
  const rows     = sheet.getDataRange().getValues();
  let   verified = false;
  let   nickname = '';

  for (let i = 1; i < rows.length; i++) {
    const rowId   = String(rows[i][COL_MSGID - 1]).trim().toUpperCase();
    const rowHash = String(rows[i][COL_PINHASH - 1]).trim();

    if (rowId === data.msgId.toUpperCase() && rowHash === pinHash) {
      verified = true;
      nickname = String(rows[i][COL_NICKNAME - 1]).trim();
      break;
    }
  }

  if (!verified) {
    return makeResponse({ status: 'error', message: 'Invalid MSG-ID or PIN' });
  }

  // Append new row to the same thread (same MSG-ID)
  sheet.appendRow([
    data.msgId.toUpperCase(),      // A — same MSG-ID
    nickname,                      // B — same nickname
    pinHash,                       // C — same hash
    'user',                        // D — sender = visitor
    data.message,                  // E — new message
    data.timestamp || now()        // F — timestamp
  ]);

  return makeResponse({ status: 'ok' });
}


// ══════════════════════════════════════════════════════════════
//  doGet — Returns conversation thread to the HTML page
//  URL params: ?action=getConversation&msgId=MSG-XXX&pin=1234
//  Returns: { status:'ok', nickname, messages: [{sender,message,timestamp}] }
// ══════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const params = e.parameter;
    const action = params.action || '';

    if (action !== 'getConversation') {
      return makeResponse({ status: 'error', message: 'Unknown action: ' + action });
    }

    const msgId = (params.msgId || '').trim().toUpperCase();
    const pin   = (params.pin   || '').trim();

    if (!msgId || pin.length !== 4 || isNaN(pin)) {
      return makeResponse({ status: 'error', message: 'Invalid input' });
    }

    const pinHash = hashPin(pin);
    const sheet   = getOrCreateSheet();
    const rows    = sheet.getDataRange().getValues();

    // Collect all rows that match this MSG-ID + PIN
    const messages = [];
    let   nickname = '';
    let   found    = false;

    for (let i = 1; i < rows.length; i++) {
      const rowId   = String(rows[i][COL_MSGID - 1]).trim().toUpperCase();
      const rowHash = String(rows[i][COL_PINHASH - 1]).trim();

      if (rowId === msgId) {
        // Verify PIN on first match
        if (!found) {
          if (rowHash !== pinHash) {
            // MSG-ID found but PIN wrong
            return makeResponse({ status: 'error', message: 'Wrong PIN' });
          }
          found    = true;
          nickname = String(rows[i][COL_NICKNAME - 1]).trim();
        }

        // Add this message to the thread
        messages.push({
          sender:    String(rows[i][COL_SENDER - 1]).trim(),    // 'user' or 'owner'
          message:   String(rows[i][COL_MESSAGE - 1]).trim(),
          timestamp: String(rows[i][COL_TIMESTAMP - 1]).trim()
        });
      }
    }

    if (!found) {
      return makeResponse({ status: 'error', message: 'Message ID not found' });
    }

    // Return full thread
    return makeResponse({ status: 'ok', nickname: nickname, messages: messages });

  } catch (err) {
    return makeResponse({ status: 'error', message: err.message });
  }
}


// ══════════════════════════════════════════════════════════════
//  HOW YOU (NADEEM) REPLY IN GOOGLE SHEETS
//
//  Simply add a new row below the conversation you want to reply to:
//  A: Same MSG-ID (copy from above row)
//  B: Same Nickname (copy from above)
//  C: Same PIN Hash (copy from above)
//  D: owner          ← IMPORTANT — must be exactly 'owner'
//  E: Your reply text
//  F: Timestamp (you can leave blank — or type the date)
//
//  The visitor will see it as a green bubble in their conversation.
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

// Hash the PIN — same algorithm in send and check, never changes
function hashPin(pin) {
  const str = 'outlawz_' + String(pin) + '_salt_2024';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).toUpperCase();
}

// Current Pakistan time as string
function now() {
  return new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
}

// Wrap response as JSON output with CORS headers
function makeResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Get or create the Conversations sheet
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupHeaders(sheet);
  } else if (sheet.getLastRow() === 0) {
    setupHeaders(sheet);
  }
  return sheet;
}

// Create header row with styling
function setupHeaders(sheet) {
  const headers = ['MSG-ID', 'Nickname', 'PIN Hash', 'Sender', 'Message', 'Timestamp'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const hr = sheet.getRange(1, 1, 1, headers.length);
  hr.setBackground('#0d1117');
  hr.setFontColor('#FFE600');
  hr.setFontWeight('bold');
  hr.setFontSize(11);

  // Highlight sender column so you know where to type 'owner'
  sheet.getRange(1, COL_SENDER).setBackground('#1a1f00');
  sheet.getRange(1, COL_SENDER).setFontColor('#FFE600');

  // Message column widest
  sheet.setColumnWidth(COL_MSGID, 130);
  sheet.setColumnWidth(COL_NICKNAME, 120);
  sheet.setColumnWidth(COL_PINHASH, 100);
  sheet.setColumnWidth(COL_SENDER, 80);
  sheet.setColumnWidth(COL_MESSAGE, 400);
  sheet.setColumnWidth(COL_TIMESTAMP, 160);
  sheet.setFrozenRows(1);

  Logger.log('Conversations sheet created.');
}


// ── Menu: Setup
function setupSheet() {
  getOrCreateSheet();
  SpreadsheetApp.getUi().alert(
    '✅ Sheet is ready!\n\n' +
    'To reply to a visitor:\n' +
    '1. Add a new row below their message\n' +
    '2. Copy MSG-ID, Nickname, PIN Hash from above\n' +
    '3. Column D = owner (exactly)\n' +
    '4. Column E = your reply text\n' +
    '5. Column F = timestamp (optional)\n\n' +
    'The visitor will see your reply as a green bubble!'
  );
}

// ── Menu: Stats
function showStats() {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();

  // Count unique MSG-IDs (unique conversations)
  const ids    = new Set();
  let   user   = 0;
  let   owner  = 0;

  for (let i = 1; i < rows.length; i++) {
    ids.add(String(rows[i][COL_MSGID - 1]).trim());
    if (String(rows[i][COL_SENDER - 1]).trim() === 'owner') owner++;
    else user++;
  }

  SpreadsheetApp.getUi().alert(
    `💬 Conversation Stats\n\n` +
    `Unique threads : ${ids.size}\n` +
    `Visitor msgs   : ${user}\n` +
    `Your replies   : ${owner}\n` +
    `Total rows     : ${Math.max(0, rows.length - 1)}`
  );
}

// ── Menu: Reply help
function showReplyHelp() {
  SpreadsheetApp.getUi().alert(
    '✏️ HOW TO REPLY TO A VISITOR\n\n' +
    'Add a new row in the sheet:\n\n' +
    'Column A (MSG-ID)   → Copy from visitor\'s row\n' +
    'Column B (Nickname) → Copy from visitor\'s row\n' +
    'Column C (PIN Hash) → Copy from visitor\'s row\n' +
    'Column D (Sender)   → Type exactly: owner\n' +
    'Column E (Message)  → Type your reply\n' +
    'Column F (Time)     → Optional timestamp\n\n' +
    '✅ Visitor will see it as a green bubble!'
  );
}

// ── Menu: Clear all
function clearAll() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('⚠️ Delete ALL conversations?', 'Cannot be undone!', ui.ButtonSet.YES_NO) === ui.Button.YES) {
    const sheet = getOrCreateSheet();
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    ui.alert('✅ All conversations cleared.');
  }
}

// ── Menu: Deploy help
function showDeployHelp() {
  SpreadsheetApp.getUi().alert(
    '🚀 DEPLOY STEPS\n\n' +
    '1. Deploy → New deployment\n' +
    '2. ⚙️ Gear → Web app\n' +
    '3. Execute as: Me\n' +
    '4. Who has access: Anyone\n' +
    '5. Click Deploy → Copy URL\n\n' +
    '⚠️ IMPORTANT:\n' +
    'After EVERY code change you MUST\n' +
    'create a NEW deployment.\n' +
    'Old deployments keep old code!\n\n' +
    'Update SHEET_URL in outlawz.html\n' +
    'with the new URL.'
  );
}
