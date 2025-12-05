import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Edit2,
  Filter,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  ArrowDown,
} from 'lucide-react';

const SPREADSHEET_ID = '1GgyVtU0KxYjvam8FGAYgm_QhmsFat0MkpuzLLSaD8M4';
const API_KEY = 'AIzaSyDVp7Ipt6Rpgmuu_uOJB2uT5NgGTwpFN0U';
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzkrqhnHbqvB8JluPy5HQYd1EwLIeIFd2RkiBjS-jsRZpXgX3yxWCveoWidMozW522y2g/exec';
const APPS_SCRIPT_ENDPOINT = `${APPS_SCRIPT_URL}?key=${API_KEY}`;

const SHEETS = {
  NOV: { name: 'NOV 25', gid: '0' },
  DEC: { name: 'DEC 25', gid: '1644213918' },
  CONSOL: { name: 'FACTORY CONSOL', gid: '1623348583' },
};

const DEADLINES_SHEET = { name: 'FACTORY DEADLINES', gid: '2120670686' };
const normalizeHeader = (value = '') => value.trim().toUpperCase();
const findColumnIndex = (headers, target) =>
  headers.findIndex((header) => normalizeHeader(header) === target);
const findColumnIndexMulti = (headers, targets = []) => {
  for (const target of targets) {
    const idx = findColumnIndex(headers, target);
    if (idx !== -1) {
      return idx;
    }
  }
  return -1;
};

const excelSerialToDate = (serial) => {
  if (Number.isNaN(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  return new Date(utcValue);
};

const parseSheetDate = (raw) => {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) return raw;

  if (typeof raw === 'number') {
    return excelSerialToDate(raw);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && trimmed.length <= 5) {
      return excelSerialToDate(numeric);
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return new Date(trimmed);
    }

    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmed)) {
      const parts = trimmed.split(/[/-]/);
      let [first, second, yearPart] = parts;
      let year = yearPart.length === 2 ? `20${yearPart}` : yearPart.padStart(4, '0');
      let day = parseInt(first, 10);
      let month = parseInt(second, 10);

      if (Number.isNaN(day) || Number.isNaN(month)) {
        return null;
      }

      if (month > 12 && day <= 12) {
        [day, month] = [month, day];
      }

      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;

      const monthStr = String(month).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      return new Date(`${year}-${monthStr}-${dayStr}`);
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
};

const formatDateForInput = (value) => {
  const date = parseSheetDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatDateForDisplay = (value) => {
  const date = value instanceof Date ? value : parseSheetDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const calculateRMDeadline = (inspectionDate, offsetDays = 0) => {
  const date = parseSheetDate(inspectionDate);
  if (!date || Number.isNaN(date.getTime())) return '';
  const deadline = new Date(date);
  const days = Number(offsetDays) || 0;
  deadline.setDate(deadline.getDate() - days);
  return formatDateForDisplay(deadline);
};

const getMonthYear = (dateValue) => {
  const date = parseSheetDate(dateValue);
  if (!date || Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const safeText = (value) => {
  if (value === null || value === undefined) return 'NA';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : 'NA';
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return String(value);
  }
  return 'NA';
};

const buildOverrideKey = (factory, reference, style) =>
  [factory, reference, style].map((value) => normalizeHeader(value || 'NA')).join('__');

const sortByInspectionThenStyle = (a, b) => {
  const dateA = parseSheetDate(a.inspectionDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const dateB = parseSheetDate(b.inspectionDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (dateA !== dateB) return dateA - dateB;
  return safeText(a.style).localeCompare(safeText(b.style));
};

const monthSortValue = (label) => {
  const parsed = Date.parse(label);
  if (!Number.isNaN(parsed)) return parsed;
  const fallback = Date.parse(`${label} 1`);
  return Number.isNaN(fallback) ? Number.POSITIVE_INFINITY : fallback;
};

const fetchFactoryDeadlineMap = async () => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${DEADLINES_SHEET.name}?key=${API_KEY}`;
  const response = await fetch(url);
  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.values || result.values.length === 0) {
    return {};
  }

  const headers = result.values[0];
  const rows = result.values.slice(1);
  const factoryIdx = findColumnIndex(headers, 'FACTORY');
  const deadlineIdx = findColumnIndexMulti(headers, ['INSPECTION - DEADLINES', 'INSPECTION DEADLINES', 'DEADLINES']);
  const mailIdIdx = findColumnIndexMulti(headers, ['MAIL ID', 'EMAIL', 'MAIL']);
  const passIdx = findColumnIndexMulti(headers, ['PASS', 'PASSWORD', 'KEY']);

  if (factoryIdx === -1) {
    return {};
  }

  const deadlinesMap = {};
  rows.forEach((row) => {
    const factory = row[factoryIdx];
    if (!factory) return;
    const normalizedFactory = normalizeHeader(factory);
    const days = Number(row[deadlineIdx]) || 0;

    // Parse Mail IDs - handle pipe-separated emails
    const rawMail = mailIdIdx !== -1 ? (row[mailIdIdx] || '') : '';
    const emails = rawMail
      .split('|')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    // Parse Password - keep original case for password
    const password = passIdx !== -1 && row[passIdx] ? String(row[passIdx]).trim() : '';

    deadlinesMap[normalizedFactory] = {
      days,
      label: `${days || 0}-day offset`,
      emails, // Store allowed emails as array for this factory
      password, // Store factory password (case-sensitive)
    };
  });

  return deadlinesMap;
};

const AUTHORIZED_USERS = {
  // Super Admins (full access)
  'mukesh@technosport.in': {
    password: 'Muk@123',
    display: 'Mukesh@technosport.in',
    role: 'SUPER_ADMIN'
  },
  'sanjaykannan@technosport.in': {
    password: 'San@123',
    display: 'Sanjaykannan@technosport.in',
    role: 'SUPER_ADMIN'
  },
  // Normal Admins (view only)
  'narasimman.s@technosport.in': {
    password: 'Nar@123',
    display: 'Narasimman.s@technosport.in',
    role: 'NORMAL_ADMIN'
  },
  'arjit@technosport.in': {
    password: 'Arj@123',
    display: 'Arjit@technosport.in',
    role: 'NORMAL_ADMIN'
  }
};

const App = () => {
  const [data, setData] = useState([]);
  const [factoryDeadlines, setFactoryDeadlines] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedFactories, setExpandedFactories] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});
  const [openStyleCards, setOpenStyleCards] = useState({});
  const [editModal, setEditModal] = useState(null);
  const [remarksModal, setRemarksModal] = useState(null);
  const [hoveredStyleKey, setHoveredStyleKey] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFactory, setFilterFactory] = useState('');
  const [filterReference, setFilterReference] = useState('');
  const [filterStyle, setFilterStyle] = useState('');
  const [columnIndices, setColumnIndices] = useState({});
  const [authUser, setAuthUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginProcessing, setLoginProcessing] = useState(false);
  const rmSyncRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const loadProductionSheets = async () => {
      const sheets = [SHEETS.NOV.name, SHEETS.DEC.name];
      const allData = [];
      const colIndices = {};

      for (const sheetName of sheets) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}?key=${API_KEY}`;
        const response = await fetch(url);
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error.message);
        }

        if (result.values && result.values.length > 0) {
          const headers = result.values[0];
          const rows = result.values.slice(1);

          const factoryIdx = findColumnIndex(headers, 'FACTORY');
          const styleIdx = findColumnIndex(headers, 'STYLE#');
          const descIdx = findColumnIndex(headers, 'DESC');
          const fabricIdx = findColumnIndex(headers, 'FABRIC DESC');
          const qtyIdx = findColumnIndex(headers, 'O QTY');
          const refIdx = findColumnIndex(headers, 'REFERENCE');
          const inspDateIdx = findColumnIndex(headers, 'INSPECTION DATE');
          const historyIdx = findColumnIndex(headers, 'HISTORY');
          const dateIdx = findColumnIndex(headers, 'DATE');
          const remarksIdx = findColumnIndex(headers, 'REMARKS');
          const productStatusIdx = findColumnIndexMulti(headers, ['PROD STATUS', 'PRODUCT STATUS']);
          const rmDeadlineIdx = findColumnIndexMulti(headers, ['RM REQ DATE', 'RM REQ DEADLINE', 'RM DEADLINE']);
          const refSortIdx = findColumnIndex(headers, 'REF SORT');

          colIndices[sheetName] = {
            factory: factoryIdx + 1,
            style: styleIdx + 1,
            desc: descIdx + 1,
            fabricDesc: fabricIdx + 1,
            qty: qtyIdx + 1,
            reference: refIdx + 1,
            inspectionDate: inspDateIdx + 1,
            history: historyIdx + 1,
            date: dateIdx + 1,
            remarks: remarksIdx + 1,
            productStatus: productStatusIdx !== -1 ? productStatusIdx + 1 : null,
            rmDeadline: rmDeadlineIdx !== -1 ? rmDeadlineIdx + 1 : null,
            refSort: refSortIdx !== -1 ? refSortIdx + 1 : null,
          };

          rows.forEach((row, idx) => {
            const factoryValue = row[factoryIdx];
            if (factoryValue) {
              allData.push({
                factory: factoryValue || '',
                style: row[styleIdx] || '',
                desc: row[descIdx] || '',
                fabricDesc: row[fabricIdx] || '',
                qty: row[qtyIdx] || '',
                reference: row[refIdx] || '',
                inspectionDate: row[inspDateIdx] || '',
                history: row[historyIdx] || '',
                date: row[dateIdx] || '',
                remarks: row[remarksIdx] || '',
                productStatus: productStatusIdx !== -1 ? row[productStatusIdx] || '' : '',
                rmColumnValue: rmDeadlineIdx !== -1 ? row[rmDeadlineIdx] || '' : '',
                refSort: refSortIdx !== -1 ? row[refSortIdx] || '' : '999',
                sheetName,
                rowIndex: idx + 2,
              });
            }
          });
        }
      }

      return { records: allData, colIndices };
    };

    try {
      const { records, colIndices } = await loadProductionSheets();
      setData(records);
      setColumnIndices(colIndices);
      setOpenStyleCards({});

      rmSyncRef.current = false;

      if (records.length === 0) {
        setError('No data found in the sheets. Please check if the sheet names and columns are correct.');
      }
    } catch (err) {
      setError(`Error loading data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) {
      fetchData();
    }
  }, [authUser, fetchData]);

  // Fetch Factory Deadlines on Mount (Required for Login)
  useEffect(() => {
    const loadDeadlines = async () => {
      try {
        const deadlines = await fetchFactoryDeadlineMap();
        setFactoryDeadlines(deadlines);
      } catch (err) {
        // Silent error - don't expose data
      }
    };
    loadDeadlines();
  }, []);

  const syncRmReqDateColumn = useCallback(async () => {
    if (rmSyncRef.current) {
      return;
    }
    if (!data.length) {
      return;
    }
    if (!Object.keys(factoryDeadlines).length) {
      return;
    }

    const updates = [];
    let skippedNoColumn = 0;
    let skippedNoFactory = 0;
    let skippedNoDeadline = 0;
    let skippedAlreadyCorrect = 0;

    data.forEach((item) => {
      const sheetColumns = columnIndices[item.sheetName];
      if (!sheetColumns?.rmDeadline) {
        skippedNoColumn++;
        return;
      }

      const normalizedFactory = normalizeHeader(item.factory || '');
      const offsetDays = factoryDeadlines[normalizedFactory]?.days;
      if (offsetDays === undefined) {
        skippedNoFactory++;
        return;
      }

      const dynamicDeadline = calculateRMDeadline(item.inspectionDate, offsetDays);
      if (!dynamicDeadline) {
        skippedNoDeadline++;
        return;
      }

      const currentCellValue = (item.rmColumnValue || '').trim();
      // Always update if cell is blank or if value doesn't match calculated deadline
      if (currentCellValue && currentCellValue === dynamicDeadline) {
        skippedAlreadyCorrect++;
        return;
      }

      updates.push({
        sheetName: item.sheetName,
        rowIndex: item.rowIndex,
        rmDeadlineColumn: sheetColumns.rmDeadline,
        rmDeadline: dynamicDeadline,
      });
    });

    if (!updates.length) {
      return;
    }

    rmSyncRef.current = true;
    let successCount = 0;
    let failCount = 0;
    const failedUpdates = [];
    const BATCH_SIZE = 10; // Process 10 rows at a time
    const DELAY_BETWEEN_REQUESTS = 1500; // 1.5 seconds between each request
    const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds pause between batches

    try {
      // Process in batches to avoid rate limiting
      for (let batchStart = 0; batchStart < updates.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, updates.length);
        const batch = updates.slice(batchStart, batchEnd);

        for (let i = 0; i < batch.length; i++) {
          const update = batch[i];
          const globalIndex = batchStart + i;
          const payload = {
            sheetName: update.sheetName,
            rowIndex: update.rowIndex,
            rmDeadline: update.rmDeadline,
            rmDeadlineColumn: update.rmDeadlineColumn,
          };

          let retries = 3;
          let success = false;

          while (retries > 0 && !success) {
            try {
              await saveToGoogleSheets(payload);
              successCount++;
              success = true;
            } catch (err) {
              retries--;
              if (retries > 0) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              } else {
                failCount++;
                failedUpdates.push(update);
              }
            }
          }

          // Delay between requests within a batch
          if (i < batch.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
          }
        }

        // Longer pause between batches
        if (batchEnd < updates.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      if (failedUpdates.length > 0) {
      }

      if (failCount > 0) {
        const retry = window.confirm(
          `⚠️ Sync completed with ${failCount} errors.\n\n` +
          `✅ ${successCount} rows updated successfully\n` +
          `❌ ${failCount} rows failed (likely due to rate limiting)\n\n` +
          `Would you like to retry the failed rows now?`
        );

        if (retry && failedUpdates.length > 0) {
          // Retry failed updates
          let retrySuccess = 0;
          let retryFail = 0;

          for (const update of failedUpdates) {
            const payload = {
              sheetName: update.sheetName,
              rowIndex: update.rowIndex,
              rmDeadline: update.rmDeadline,
              rmDeadlineColumn: update.rmDeadlineColumn,
            };

            try {
              await saveToGoogleSheets(payload);
              retrySuccess++;
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } catch (err) {
              retryFail++;
            }
          }

          successCount += retrySuccess;
          failCount = retryFail;
        }
      }

      // Update local state with all updates (both successful and failed will be retried later)
      // Only update the ones that succeeded
      const successfulUpdateMap = new Map();
      updates.forEach(update => {
        const key = `${update.sheetName}-${update.rowIndex}`;
        successfulUpdateMap.set(key, update);
      });

      // Remove failed ones from the map
      failedUpdates.forEach(failed => {
        const key = `${failed.sheetName}-${failed.rowIndex}`;
        successfulUpdateMap.delete(key);
      });

      setData((prev) =>
        prev.map((item) => {
          const key = `${item.sheetName}-${item.rowIndex}`;
          const update = successfulUpdateMap.get(key);
          if (!update) return item;
          return {
            ...item,
            rmColumnValue: update.rmDeadline,
          };
        }),
      );
    } catch (err) {
      // Silent error
    } finally {
      rmSyncRef.current = false;
    }
  }, [columnIndices, data, factoryDeadlines]);

  useEffect(() => {
    if (authUser) {
      syncRmReqDateColumn();
    }
  }, [authUser, syncRmReqDateColumn]);


  const [canEdit, setCanEdit] = useState(false);
  const [allowedFactories, setAllowedFactories] = useState(null); // null = all, array = specific

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    setLoginProcessing(true);

    try {
      const rawEmail = loginForm.email.trim();
      const password = loginForm.password;
      const normalizedEmail = rawEmail.toLowerCase();
      const domain = normalizedEmail.split('@')[1] || '';

      // 1. SUPER ADMIN CHECK (Hardcoded)
      if (AUTHORIZED_USERS[normalizedEmail]?.role === 'SUPER_ADMIN') {
        const userRecord = AUTHORIZED_USERS[normalizedEmail];
        if (userRecord.password !== password) {
          setLoginError('Invalid password for Super Admin.');
          setLoginProcessing(false);
          return;
        }
        setAuthUser({
          email: normalizedEmail,
          role: 'SUPER_ADMIN',
          display: userRecord.display
        });
        setCanEdit(true); // Full edit access
        setAllowedFactories(null); // All factories
        setLoginProcessing(false);
        return;
      }

      // 2. NORMAL ADMIN CHECK (Any @technosport.in user)
      if (domain === 'technosport.in') {
        // Check if it's a hardcoded normal admin
        if (AUTHORIZED_USERS[normalizedEmail]) {
          const userRecord = AUTHORIZED_USERS[normalizedEmail];
          if (userRecord.password !== password) {
            setLoginError('Invalid password for Admin.');
            setLoginProcessing(false);
            return;
          }
        } else {
          // Default password for non-hardcoded @technosport.in users
          if (password !== 'Techno@123') {
            setLoginError('Invalid password. Default is Techno@123');
            setLoginProcessing(false);
            return;
          }
        }

        setAuthUser({
          email: normalizedEmail,
          role: 'NORMAL_ADMIN',
          display: normalizedEmail
        });
        setCanEdit(false); // Read-only access
        setAllowedFactories(null); // All factories
        setLoginProcessing(false);
        return;
      }

      // 3. FACTORY USER CHECK (From Google Sheet)
      const userFactories = [];
      let factoryPassword = null;
      let factoryName = '';

      // Check factory access from Google Sheet data
      for (const [factory, data] of Object.entries(factoryDeadlines)) {

        let emailFound = false;

        // data.emails is already an array from fetchFactoryDeadlineMap
        if (data.emails && Array.isArray(data.emails)) {
          // Case-insensitive email matching
          emailFound = data.emails.includes(normalizedEmail);
        }

        if (emailFound) {
          userFactories.push(factory);
          factoryPassword = data.password || '';
          factoryName = factory;
          break; // Stop after first match
        }
      }

      if (userFactories.length > 0) {
        // Verify factory password (case-sensitive)
        if (!factoryPassword) {
          setLoginError('No password configured for this factory. Please contact admin.');
          setLoginProcessing(false);
          return;
        }

        if (password !== factoryPassword) {
          setLoginError('Invalid password for factory access.');
          setLoginProcessing(false);
          return;
        }

        setAuthUser({
          email: normalizedEmail,
          role: 'FACTORY_USER',
          display: `${factoryName} User`,
          factory: factoryName
        });
        setCanEdit(false); // Factory users are read-only
        setAllowedFactories(userFactories); // Only their factory
        setLoginProcessing(false);
        return;
      }

      // If we get here, no valid user was found
      setLoginError('Invalid email or password. Please check your credentials.');
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('An unexpected error occurred during login.');
    } finally {
      setLoginProcessing(false);
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    setData([]);
    // DON'T clear factoryDeadlines - it's needed for login!
    // setFactoryDeadlines({});
    setColumnIndices({});
    setOpenStyleCards({});
    setExpandedFactories({});
    setExpandedMonths({});
    setEditModal(null);
    setRemarksModal(null);
    setSearchTerm('');
    setFilterFactory('');
    setFilterReference('');
    setFilterStyle('');
    setError(null);
    setLoading(false);
  };

  const saveToGoogleSheets = async (payload) => {
    const timeout = 10000; // 10 second timeout

    const fetchPromise = fetch(APPS_SCRIPT_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 10 seconds')), timeout);
    });

    try {
      await Promise.race([fetchPromise, timeoutPromise]);
      return { success: true };
    } catch (err) {
      throw new Error(`Unable to reach Apps Script: ${err.message}`);
    }
  };

  const { organized, filteredCount } = useMemo(() => {
    if (!data.length) {
      return { organized: {}, filteredCount: 0 };
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedFactoryFilter = filterFactory.trim().toLowerCase();
    const normalizedReferenceFilter = filterReference.trim().toLowerCase();
    const normalizedStyleFilter = filterStyle.trim().toLowerCase();

    const filtered = data.filter((item) => {
      // 1. Role-Based Factory Filter
      if (allowedFactories) {
        const itemFactory = normalizeHeader(item.factory);
        if (!allowedFactories.includes(itemFactory)) {
          return false;
        }
      }

      const searchPool = [
        item.factory,
        item.style,
        item.desc,
        item.reference,
        item.productStatus,
      ]
        .filter(Boolean)
        .map((value) => value.toString().toLowerCase());

      const matchesSearch = !normalizedSearch || searchPool.some((entry) => entry.includes(normalizedSearch));
      const matchesFactory = !normalizedFactoryFilter || (item.factory || '').toLowerCase() === normalizedFactoryFilter;
      const matchesReference =
        !normalizedReferenceFilter || (item.reference || '').toLowerCase().includes(normalizedReferenceFilter);
      const matchesStyle = !normalizedStyleFilter || (item.style || '').toLowerCase().includes(normalizedStyleFilter);

      return matchesSearch && matchesFactory && matchesReference && matchesStyle;
    });

    // Group by Factory -> Month -> Reference
    const organizedResult = {};

    filtered.forEach((item) => {
      const factoryKey = safeText(item.factory);
      if (!organizedResult[factoryKey]) {
        organizedResult[factoryKey] = {};
      }

      const monthYear = getMonthYear(item.inspectionDate || item.date);
      if (!organizedResult[factoryKey][monthYear]) {
        organizedResult[factoryKey][monthYear] = {
          references: {},
          earliestDate: Number.POSITIVE_INFINITY,
        };
      }

      const referenceKey = safeText(item.reference);
      if (!organizedResult[factoryKey][monthYear].references[referenceKey]) {
        organizedResult[factoryKey][monthYear].references[referenceKey] = {
          records: [],
          earliestDate: Number.POSITIVE_INFINITY,
          factory: item.factory, // Store factory for sorting
          refSort: item.refSort, // Store refSort for sorting
        };
      }

      organizedResult[factoryKey][monthYear].references[referenceKey].records.push(item);

      const inspectionTime = parseSheetDate(item.inspectionDate)?.getTime();
      if (inspectionTime && !Number.isNaN(inspectionTime)) {
        if (inspectionTime < organizedResult[factoryKey][monthYear].earliestDate) {
          organizedResult[factoryKey][monthYear].earliestDate = inspectionTime;
        }

        const referenceBucket = organizedResult[factoryKey][monthYear].references[referenceKey];
        if (inspectionTime < referenceBucket.earliestDate) {
          referenceBucket.earliestDate = inspectionTime;
        }
      }
    });

    // Sort References within each Factory -> Month: Ref Sort (Asc)
    Object.values(organizedResult).forEach((monthsMap) => {
      Object.values(monthsMap).forEach((monthBucket) => {
        Object.values(monthBucket.references).forEach((referenceBucket) => {
          referenceBucket.records.sort(sortByInspectionThenStyle);
        });
      });
    });

    return { organized: organizedResult, filteredCount: filtered.length };
  }, [data, searchTerm, filterFactory, filterReference, filterStyle]);

  const factories = useMemo(() => Object.keys(organized).sort(), [organized]);
  const totalRecords = filteredCount;

  const toggleFactory = (factory) => {
    const isCurrentlyExpanded = expandedFactories[factory];

    setExpandedFactories((prev) => ({
      ...prev,
      [factory]: !prev[factory],
    }));

    // Auto-expand all months when factory is expanded
    if (!isCurrentlyExpanded) {
      const monthsMap = organized[factory] || {};
      const monthKeys = Object.keys(monthsMap);

      setExpandedMonths((prev) => {
        const newExpanded = { ...prev };
        monthKeys.forEach(month => {
          newExpanded[`${factory}-${month}`] = true;
        });
        return newExpanded;
      });
    } else {
      // Collapse all months when factory is collapsed
      const monthsMap = organized[factory] || {};
      const monthKeys = Object.keys(monthsMap);

      setExpandedMonths((prev) => {
        const newExpanded = { ...prev };
        monthKeys.forEach(month => {
          newExpanded[`${factory}-${month}`] = false;
        });
        return newExpanded;
      });
    }
  };

  const toggleMonth = (factory, month) => {
    const key = `${factory}-${month}`;
    setExpandedMonths((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const openEditModal = (item) => {
    setEditModal({
      ...item,
      newDate: formatDateForInput(item.inspectionDate),
    });
  };

  const openRemarksModal = (item) => {
    setRemarksModal({
      ...item,
      newRemarks: item.remarks,
    });
  };

  const toggleStyleCard = (styleKey) => {
    setOpenStyleCards((prev) => ({
      ...prev,
      [styleKey]: !prev[styleKey],
    }));
  };

  const saveInspectionDate = async () => {
    if (!editModal) return;

    const reason = window.prompt('Reason for change? (Optional)');
    const previousDate = formatDateForDisplay(editModal.inspectionDate);

    // Get current time in IST
    const now = new Date();
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hours = istTime.getHours();
    const minutes = String(istTime.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes} ${ampm}`;

    const historyEntry = reason
      ? `${previousDate} | ${timeStr} (${reason})`
      : `${previousDate} | ${timeStr}`;

    const newHistory = editModal.history ? `${editModal.history}, ${historyEntry}` : historyEntry;

    const confirmSave = window.confirm('Do you want to make the changes?');
    if (!confirmSave) return;

    setSaving(true);

    try {
      const colIdx = columnIndices[editModal.sheetName];

      const payload = {
        sheetName: editModal.sheetName,
        rowIndex: editModal.rowIndex,
        inspectionDate: editModal.newDate,
        inspDateColumn: colIdx.inspectionDate,
        history: newHistory,
        historyColumn: colIdx.history,
      };

      await saveToGoogleSheets(payload);

      const updatedData = data.map((item) => {
        if (
          item.factory === editModal.factory &&
          item.style === editModal.style &&
          item.date === editModal.date &&
          item.sheetName === editModal.sheetName
        ) {
          return {
            ...item,
            inspectionDate: editModal.newDate,
            history: newHistory,
          };
        }
        return item;
      });

      setData(updatedData);
      setEditModal(null);
      window.alert('✅ Changes saved successfully to Google Sheets!');
    } catch (err) {
      window.alert(`❌ Error saving changes: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveRemarks = async () => {
    if (!remarksModal) return;

    const confirmSave = window.confirm('Save remarks?');
    if (!confirmSave) return;

    setSaving(true);

    try {
      const colIdx = columnIndices[remarksModal.sheetName];

      const payload = {
        sheetName: remarksModal.sheetName,
        rowIndex: remarksModal.rowIndex,
        remarks: remarksModal.newRemarks,
        remarksColumn: colIdx.remarks,
      };

      await saveToGoogleSheets(payload);

      const updatedData = data.map((item) => {
        if (
          item.factory === remarksModal.factory &&
          item.style === remarksModal.style &&
          item.date === remarksModal.date &&
          item.sheetName === remarksModal.sheetName
        ) {
          return {
            ...item,
            remarks: remarksModal.newRemarks,
          };
        }
        return item;
      });

      setData(updatedData);
      setRemarksModal(null);
      window.alert('✅ Remarks saved successfully to Google Sheets!');
    } catch (err) {
      window.alert(`❌ Error saving remarks: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!authUser) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 gap-8">
        {/* Title - Outside the box */}
        <h1 className="text-4xl font-bold text-white tracking-wide">
          FACTORY PRODUCTION TRACKER
        </h1>

        {/* Login Box - Compact */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="https://i.ibb.co/PsyrfRnX/LOGO-1.png"
              alt="Technosport"
              className="w-50 h-50 object-contain"
            />
          </div>

          {/* Login Form */}
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                placeholder="name@technosport.in"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                placeholder="Enter your password"
                required
              />
            </div>

            {loginError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginProcessing}
              className="w-full px-4 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
            >
              {loginProcessing ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-purple-500/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-900 text-lg">Loading factory data...</p>
          <p className="text-gray-700 text-sm mt-2">Fetching from Google Sheets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-900 border border-red-700 rounded-lg p-6 max-w-2xl">
          <h2 className="text-red-200 text-xl font-bold mb-2">Error Loading Data</h2>
          <p className="text-red-300 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const renderStyleCard = (item) => {
    const styleKey = buildOverrideKey(item.factory, item.reference, item.style);
    const normalizedFactory = normalizeHeader(item.factory || '');
    const deadlineDays = factoryDeadlines[normalizedFactory]?.days ?? 0;
    const dynamicDeadline = calculateRMDeadline(item.inspectionDate, deadlineDays);
    const rmDeadlineDisplay = dynamicDeadline ? `${dynamicDeadline} (AUTO)` : 'NA (AUTO)';

    return (
      <div
        key={`${item.style}-${item.rowIndex}`}
        className="group relative bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-blue-500/50 hover:shadow-md transition-all duration-300"
        onMouseEnter={() => setHoveredStyleKey(styleKey)}
        onMouseLeave={() => setHoveredStyleKey(null)}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-gray-500">Style</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-semibold text-blue-600">{safeText(item.style)}</p>
              <div className="text-[10px] text-gray-400 uppercase tracking-[0.3em] flex items-center gap-1">
                <span>STYLE#</span>
                <span className="text-base leading-none text-blue-600">↓</span>
              </div>
            </div>
            <p className="text-xs uppercase text-gray-500 mt-3">Reference</p>
            <p className="text-sm text-gray-900 font-semibold">{safeText(item.reference)}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-gray-700">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700">
              <Calendar className="w-4 h-4" />
              <span>{formatDateForDisplay(item.inspectionDate) || 'Not set'}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 text-xs uppercase text-gray-500">
              <Sparkles className="w-3 h-3 text-green-600" />
              <span>RM Req Deadline</span>
            </div>
            <p className="text-sm text-green-600 font-semibold mt-2 leading-6">{rmDeadlineDisplay}</p>
            <p className="text-[11px] text-gray-500 mt-2">
              Offset: {deadlineDays || 0} day(s) from inspection based on factory deadline sheet.
            </p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] uppercase text-gray-500">Order Qty</p>
              <p className="text-gray-900 font-semibold">{safeText(item.qty)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-500">Factory</p>
              <p className="text-gray-900 font-semibold">{safeText(item.factory)}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-[11px] uppercase text-gray-500">Production Status</p>
              <p className="text-gray-900">{safeText(item.productStatus)}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-700">
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-[11px] uppercase text-gray-500">Description</p>
            <p className="mt-1">{safeText(item.desc)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-[11px] uppercase text-gray-500">Fabric Description</p>
            <p className="mt-1">{safeText(item.fabricDesc)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-[11px] uppercase text-gray-500">History</p>
            <p className="mt-1 max-h-16 overflow-hidden text-ellipsis">{item.history || 'NA'}</p>
          </div>
        </div>

        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => openEditModal(item)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all duration-200"
            >
              <Calendar className="w-4 h-4" />
              Edit Inspection Date
            </button>
            <button
              onClick={() => openRemarksModal(item)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all duration-200"
            >
              <Edit2 className="w-4 h-4" />
              Remarks
            </button>
          </div>
        )}

        {hoveredStyleKey === styleKey && (
          <div className="hidden" /> // Removed redundant hover card
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2">
          {/* Top Row - Title and Actions */}
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-sm font-bold text-gray-900">
              Factory Production Tracker
            </h1>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500">Logged in as {authUser.display}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
              >
                Logout
              </button>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterFactory('');
                  setFilterReference('');
                  setFilterStyle('');
                  fetchData();
                }}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex gap-2 items-center">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent transition-all"
              />
            </div>

            {/* Factory Filter */}
            <div className="relative w-40">
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <select
                className="w-full pl-7 pr-2 py-1 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent text-xs text-gray-900 transition-all"
                value={filterFactory}
                onChange={(e) => setFilterFactory(e.target.value)}
              >
                <option value="">All Factories</option>
                {[...new Set(data.map((item) => safeText(item.factory)))].sort().map((factory) => (
                  <option key={factory} value={factory}>
                    {factory}
                  </option>
                ))}
              </select>
            </div>

            {/* Reference Filter */}
            <div className="relative w-40">
              <SlidersHorizontal className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                type="text"
                placeholder="Reference..."
                value={filterReference}
                onChange={(e) => setFilterReference(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent transition-all"
              />
            </div>

            {/* Style Filter */}
            <div className="relative w-40">
              <SlidersHorizontal className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                type="text"
                placeholder="Style..."
                value={filterStyle}
                onChange={(e) => setFilterStyle(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent transition-all"
              />
            </div>

            {/* Clear Filters Button */}
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterFactory('');
                setFilterReference('');
                setFilterStyle('');
              }}
              className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded transition-colors border border-gray-300 whitespace-nowrap"
            >
              Clear Filters
            </button>
          </div>

          <div className="mt-2 text-[10px] text-gray-500">
            Showing {totalRecords} style(s) across {factories.length} factory views
          </div>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-50 rounded-lg p-6 flex items-center gap-4 border border-gray-700">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <p className="text-white text-lg">Saving to Google Sheets...</p>
          </div>
        </div>
      )}

      <div className="w-full px-2 py-3">
        {!data.length ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-lg">No data found. Please check your Google Sheets.</p>
          </div>
        ) : factories.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-lg">No results match your search/filter.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {factories.map((factory) => {
              const monthsMap = organized[factory] || {};
              const monthEntries = Object.entries(monthsMap).sort(
                ([monthA, dataA], [monthB, dataB]) => monthSortValue(monthA) - monthSortValue(monthB),
              );
              const normalizedFactoryKey = normalizeHeader(factory || '');
              const factoryDeadlineConfig = factoryDeadlines[normalizedFactoryKey];
              const factoryDeadlineText = factoryDeadlineConfig
                ? `${factoryDeadlineConfig.days || 0}-day RM offset`
                : 'No RM deadline configured';
              const isFactoryOpen = expandedFactories[factory];
              const factoryMonths = Object.keys(monthsMap);
              const factoryStylesCount = Object.values(monthsMap).reduce((sum, monthData) => {
                const references = monthData.references || {};
                return (
                  sum +
                  Object.values(references).reduce((count, refData) => count + refData.records.length, 0)
                );
              }, 0);

              return (
                <div
                  key={factory}
                  className="bg-white rounded border border-gray-300 overflow-hidden shadow-sm mb-1"
                >
                  <button
                    onClick={() => toggleFactory(factory)}
                    className="w-full px-3 py-2 flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded transition-colors ${isFactoryOpen ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        {isFactoryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="text-left">
                        <h2 className="text-xs font-bold text-gray-900">{factory}</h2>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                          <span>{factoryMonths.length} MONTH(S)</span>
                          <span>•</span>
                          <span>{factoryStylesCount} STYLES</span>
                        </div>
                      </div>
                    </div>
                    {factoryDeadlineConfig && (
                      <div className="text-right">
                        <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Factory RM Deadline</p>
                        <p className="text-xs font-bold text-blue-600">{factoryDeadlineConfig.label}</p>
                      </div>
                    )}
                  </button>

                  {expandedFactories[factory] && (
                    <div className="px-1 pb-1 space-y-0.5 animate-fadeIn">
                      {monthEntries.map(([monthYear, monthData]) => {
                        const expanded = expandedMonths[`${factory}-${monthYear}`];
                        const references = monthData.references || {};
                        const totalStyles = Object.values(references).reduce(
                          (count, refData) => count + refData.records.length,
                          0,
                        );

                        // Sort references: REF SORT Value (Asc)
                        const referenceEntries = Object.entries(references).sort(
                          ([refA, dataA], [refB, dataB]) => {
                            const sortA = Number(dataA.refSort) || 999;
                            const sortB = Number(dataB.refSort) || 999;
                            return sortA - sortB;
                          },
                        );
                        const isMonthOpen = expandedMonths[`${factory}-${monthYear}`];
                        const monthReferences = Object.keys(references);
                        const monthStylesCount = Object.values(references).reduce(
                          (count, refData) => count + refData.records.length,
                          0,
                        );

                        return (
                          <div
                            key={monthYear}
                            className="border-t border-gray-200 py-0.5"
                          >
                            <div className="px-0.5 mb-0.5">
                              <h3 className="font-bold text-gray-900 text-[9px]">{monthYear}</h3>
                            </div>

                            <div>
                              <div className="flex flex-nowrap overflow-x-auto gap-1 pb-1">
                                {referenceEntries.length === 0 && (
                                  <div className="text-gray-500 text-sm p-2">No references found.</div>
                                )}
                                {referenceEntries.map(([reference, referenceData]) => {
                                  const referenceKey = `${factory}-${monthYear}-${reference}`;

                                  return (
                                    <div
                                      key={referenceKey}
                                      className="min-w-[60px] w-[60px] bg-white border border-gray-300 rounded p-0.5 flex flex-col gap-0.5 hover:border-blue-400 transition-colors flex-shrink-0"
                                    >
                                      <div className="text-center">
                                        <p className="text-[9px] font-bold text-gray-900 truncate" title={safeText(reference)}>
                                          {safeText(reference)}
                                        </p>
                                      </div>

                                      <div className="flex flex-col gap-0.5">
                                        {referenceData.records.map((item, index) => {
                                          const styleKey = buildOverrideKey(item.factory, item.reference, item.style);
                                          const isOpen = !!openStyleCards[styleKey];

                                          // Uniform Color (Light Theme)
                                          const statusColorClass = 'bg-white border-gray-200 text-gray-900 hover:border-purple-400 shadow-sm hover:shadow-md';

                                          // Format Date Short
                                          const dateObj = parseSheetDate(item.inspectionDate);
                                          const dateStr = dateObj ? dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase().replace(/ /g, '-') : '';

                                          return (
                                            <div key={styleKey} className="relative flex flex-col items-center">
                                              <button
                                                onClick={() => toggleStyleCard(styleKey)}
                                                onMouseEnter={(e) => {
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  const showBelow = rect.top < 200; // Show below if close to top
                                                  setTooltipPos({
                                                    x: rect.left + rect.width / 2,
                                                    y: showBelow ? rect.bottom + 12 : rect.top - 12,
                                                    showBelow
                                                  });
                                                  setHoveredStyleKey(styleKey);
                                                }}
                                                onMouseLeave={() => setHoveredStyleKey(null)}
                                                className={`w-full text-left px-1 py-0.5 rounded border transition-all bg-white border-gray-300 hover:border-blue-400 text-gray-900 ${isOpen ? 'ring-1 ring-blue-500' : ''}`}
                                              >
                                                <div className="flex flex-col items-center text-center">
                                                  <span className="truncate font-semibold text-[8px] w-full leading-tight">{safeText(item.style)}</span>
                                                  {dateStr && (
                                                    <span className="text-[7px] opacity-70 leading-tight">
                                                      {dateStr}
                                                    </span>
                                                  )}
                                                </div>
                                              </button>

                                              {/* Arrow Connector (if not last item) */}
                                              {index < referenceData.records.length - 1 && (
                                                <div className="text-gray-300 py-0">
                                                  <ArrowDown className="w-2 h-2" />
                                                </div>
                                              )}

                                              {/* Hover tooltip for style details - Fixed Position with Dynamic Coords */}
                                              {hoveredStyleKey === styleKey && (
                                                <div
                                                  className="fixed z-50 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden pointer-events-none p-4"
                                                  style={{
                                                    left: tooltipPos.x,
                                                    top: tooltipPos.y,
                                                    transform: tooltipPos.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
                                                  }}
                                                >
                                                  <div className="space-y-3 text-xs">
                                                    <div>
                                                      <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Style</p>
                                                      <p className="text-gray-900 font-bold text-base">{safeText(item.style)}</p>
                                                    </div>
                                                    <div>
                                                      <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Description</p>
                                                      <p className="text-gray-700 font-medium">{safeText(item.desc)}</p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                      <div>
                                                        <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Status</p>
                                                        <p className="text-gray-700 font-medium">{safeText(item.productStatus)}</p>
                                                      </div>
                                                      <div>
                                                        <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Insp Date</p>
                                                        <p className="text-blue-600 font-bold">{formatDateForDisplay(item.inspectionDate) || 'NA'}</p>
                                                      </div>
                                                      <div className="col-span-2 mt-1 pt-1 border-t border-gray-100">
                                                        <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Order Qty</p>
                                                        <p className="text-gray-900 font-bold">{safeText(item.qty)}</p>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}

                                              {isOpen && (
                                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => toggleStyleCard(styleKey)}>
                                                  <div className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-end mb-2">
                                                      <button onClick={() => toggleStyleCard(styleKey)} className="text-white hover:text-gray-300">
                                                        <X className="w-6 h-6" />
                                                      </button>
                                                    </div>
                                                    {renderStyleCard(item)}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-600">Edit Inspection Date</h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-gray-500">
                <p>Style: {safeText(editModal.style)}</p>
                <p>Factory: {safeText(editModal.factory)}</p>
              </div>
              <label className="block text-gray-700 text-sm">
                Current Date: <span className="font-semibold">{formatDateForDisplay(editModal.inspectionDate) || 'NA'}</span>
              </label>
              <input
                type="date"
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                value={editModal.newDate}
                onChange={(e) => setEditModal({ ...editModal, newDate: e.target.value })}
              />
            </div>
            {editModal.history && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-gray-500 text-sm mb-1">Change History</label>
                <p className="text-gray-600 text-sm">{editModal.history}</p>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveInspectionDate}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditModal(null)}
                disabled={saving}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {remarksModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-600">Edit Remarks</h3>
              <button onClick={() => setRemarksModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Style: {safeText(remarksModal.style)}</p>
              <textarea
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 h-32"
                value={remarksModal.newRemarks}
                onChange={(e) => setRemarksModal({ ...remarksModal, newRemarks: e.target.value })}
                placeholder="Enter remarks..."
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveRemarks}
                disabled={saving}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Remarks'}
              </button>
              <button
                onClick={() => setRemarksModal(null)}
                disabled={saving}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default App;

