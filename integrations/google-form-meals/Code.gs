// Bind this script to the 115-1 meal request Google Form.
// Store MEAL_SYNC_URL and MEAL_SYNC_SECRET in Script Properties, not in this file.
function onMealFormSubmit(e) {
  if (!e || !e.response || !e.source) throw new Error('請由表單提交觸發器執行');
  syncMealResponse_(e.source.getId(), e.response);
}

function syncMealResponse_(formId, response) {
  var answers = response.getItemResponses();
  var name = '';
  var grade = '';
  var dates = [];
  answers.forEach(function (item) {
    var title = item.getItem().getTitle().replace(/\s/g, '');
    var value = item.getResponse();
    if (title === '孩子就讀姓名') name = String(value || '').trim();
    if (title === '就讀年級') grade = String(value || '').trim();
    if (title === '訂餐日期') dates = dates.concat(Array.isArray(value) ? value : value ? [value] : []);
  });

  var properties = PropertiesService.getScriptProperties();
  var url = properties.getProperty('MEAL_SYNC_URL');
  var secret = properties.getProperty('MEAL_SYNC_SECRET');
  if (!url || !secret) throw new Error('請先在專案設定填入 MEAL_SYNC_URL 與 MEAL_SYNC_SECRET');

  var result = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify({
      formId: formId,
      responseId: response.getId(),
      studentName: name,
      gradeGroup: grade,
      selectedDateLabels: dates,
      submittedAt: response.getTimestamp().toISOString(),
    }),
    muteHttpExceptions: true,
  });
  if (result.getResponseCode() < 200 || result.getResponseCode() >= 300) {
    throw new Error('訂餐同步失敗（HTTP ' + result.getResponseCode() + '）：' + result.getContentText().slice(0, 300));
  }
}

function installMealFormTrigger() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('請從原表單的 Apps Script 編輯器執行');
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onMealFormSubmit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onMealFormSubmit').forForm(form).onFormSubmit().create();
}

// Run once after reviewing existing replies. Replays are safe by response ID.
function syncExistingMealResponses() {
  var form = FormApp.getActiveForm();
  form.getResponses().forEach(function (response) { syncMealResponse_(form.getId(), response); });
}
