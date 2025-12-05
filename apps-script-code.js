function doPost(e) {
  try {
    const sheet = SpreadsheetApp.openById('1GgyVtU0KxYjvam8FGAYgm_QhmsFat0MkpuzLLSaD8M4');
    
    // Check if postData exists
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, 
        error: 'No data received'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = JSON.parse(e.postData.contents);
    
    const targetSheet = sheet.getSheetByName(data.sheetName);
    if (!targetSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, 
        error: 'Sheet not found: ' + data.sheetName
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const row = data.rowIndex;
    
    // Update the cells based on what's being changed
    if (data.inspectionDate && data.inspDateColumn) {
      targetSheet.getRange(row, data.inspDateColumn).setValue(data.inspectionDate);
    }
    if (data.history && data.historyColumn) {
      targetSheet.getRange(row, data.historyColumn).setValue(data.history);
    }
    if (data.remarks !== undefined && data.remarksColumn) {
      targetSheet.getRange(row, data.remarksColumn).setValue(data.remarks);
    }
    if (data.rmDeadline && data.rmDeadlineColumn) {
      targetSheet.getRange(row, data.rmDeadlineColumn).setValue(data.rmDeadline);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data updated successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, 
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function - you can run this to verify the script works
function testDoPost() {
  const testData = {
    postData: {
      contents: JSON.stringify({
        sheetName: 'NOV 25',
        rowIndex: 2,
        inspectionDate: '2025-11-28',
        inspDateColumn: 7,
        history: 'Test history',
        historyColumn: 8,
        rmDeadline: '01-12-2025',
        rmDeadlineColumn: 15
      })
    }
  };
  
  const result = doPost(testData);
  Logger.log(result.getContent());
}

