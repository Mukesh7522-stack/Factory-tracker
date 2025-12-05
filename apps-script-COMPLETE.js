// ============================================
// APPS SCRIPT - MAIN HANDLER
// This handles React app requests
// Deploy this as Web App and use the URL in React
// ============================================

function doPost(e) {
    try {
        const sheet = SpreadsheetApp.openById('1GgyVtU0KxYjvam8FGAYgm_QhmsFat0MkpuzLLSaD8M4');

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

        // ✅ ONLY update the SINGLE ROW that was changed - super fast!
        // This prevents timeout because we're not updating the entire sheet
        updateSingleRowRMDeadline(targetSheet, row, data.sheetName);

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

// NEW: Update RM deadline for a SINGLE ROW only (fast!)
function updateSingleRowRMDeadline(sheet, rowIndex, sheetName) {
    try {
        const factoryDeadlines = getFactoryDeadlines();

        if (Object.keys(factoryDeadlines).length === 0) {
            return;
        }

        // Find required columns
        const factoryCol = findColumnIndex(sheet, 'FACTORY');
        const inspDateCol = findColumnIndex(sheet, 'INSPECTION DATE');
        const rmDeadlineCol = findColumnIndex(sheet, 'RM REQ DEADLINE');

        if (factoryCol === -1 || inspDateCol === -1 || rmDeadlineCol === -1) {
            return;
        }

        // Get data for THIS ROW ONLY
        const factory = sheet.getRange(rowIndex, factoryCol).getValue();
        const inspectionDate = sheet.getRange(rowIndex, inspDateCol).getValue();

        if (!factory || !inspectionDate) {
            return;
        }

        const factoryKey = factory.toString().trim().toUpperCase();
        const daysToSubtract = factoryDeadlines[factoryKey];

        if (!daysToSubtract) {
            return;
        }

        // Parse inspection date
        const inspDate = parseDate(inspectionDate);

        if (!inspDate) {
            return;
        }

        // Calculate RM REQ DEADLINE
        const rmDate = new Date(inspDate);
        rmDate.setDate(rmDate.getDate() - daysToSubtract);
        const formattedRMDate = formatDate(rmDate);

        // Update ONLY this row (silently - no log message)
        sheet.getRange(rowIndex, rmDeadlineCol).setValue(formattedRMDate);

    } catch (error) {
        // Silent error handling - no logs
    }
}

// Function to get factory deadlines mapping
function getFactoryDeadlines() {
    const sheet = SpreadsheetApp.openById('1GgyVtU0KxYjvam8FGAYgm_QhmsFat0MkpuzLLSaD8M4');
    const deadlineSheet = sheet.getSheetByName('FACTORY DEADLINES');

    if (!deadlineSheet) {
        return {};
    }

    const data = deadlineSheet.getDataRange().getValues();
    const deadlines = {};

    for (let i = 1; i < data.length; i++) {
        const factory = data[i][0];
        const deadline = data[i][1];

        if (factory && deadline) {
            deadlines[factory.toString().trim().toUpperCase()] = parseInt(deadline);
        }
    }

    return deadlines;
}

// Function to find column index by header name
function findColumnIndex(sheet, headerName) {
    try {
        if (!sheet || typeof sheet.getLastColumn !== 'function') {
            return -1;
        }

        const lastCol = sheet.getLastColumn();

        if (lastCol < 1) {
            return -1;
        }

        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        for (let i = 0; i < headers.length; i++) {
            if (headers[i] && headers[i].toString().trim().toUpperCase() === headerName.toUpperCase()) {
                return i + 1;
            }
        }

        return -1;
    } catch (error) {
        return -1;
    }
}

// Function to parse date string in DD-MM-YYYY format
function parseDate(dateStr) {
    if (!dateStr) return null;

    const str = dateStr.toString().trim();

    const parts = str.split('-');
    if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    }

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    return null;
}

// Function to format date as DD-MM-YYYY
function formatDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
}

function doGet(e) {
    return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Main Data Handler is running'
    })).setMimeType(ContentService.MimeType.JSON);
}

// Test function
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
