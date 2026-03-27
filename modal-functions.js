// Modal Functions for OutLawZ Profile
function openModal() {
  document.getElementById("msgModal").style.display = "block";
}

function closeModal() {
  document.getElementById("msgModal").style.display = "none";
}

function toggleCheckPanel() {
  var panel = document.getElementById("replyCheckPanel");
  panel.style.display = panel.style.display === "block" ? "none" : "block";
}

function checkReply() {
  var msgId = document.getElementById("checkMsgIdField").value.trim();
  var pin = document.getElementById("checkPinField").value.trim();
  var statusDiv = document.getElementById("checkStatus");
  var replyDiv = document.getElementById("replyBubble");
  
  if (!msgId || !pin) {
    statusDiv.style.display = "block";
    statusDiv.innerText = "⚠️ Message ID or PIN is incorrect. Please try again.";
    return;
  }
  
  // Here you would normally call your Google Apps Script to check for replies
  // For now, showing a placeholder response
  statusDiv.style.display = "block";
  statusDiv.innerText = "🔍 Checking for reply...";
  
  setTimeout(() => {
    statusDiv.style.display = "none";
    replyDiv.style.display = "block";
    replyDiv.innerHTML = "<strong>Reply from OutLawZ:</strong><br>Thank you for your message! I'll get back to you soon.";
  }, 1500);
}
