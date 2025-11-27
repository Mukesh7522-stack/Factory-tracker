// App.js reference implementation
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Calendar, Edit2, Save, X, Search, Filter, RefreshCw } from 'lucide-react';

const SPREADSHEET_ID = '1GgyVtU0KxYjvam8FGAYgm_QhmsFat0MkpuzLLSaD8M4';
const API_KEY = 'AIzaSyDVp7Ipt6Rpgmuu_uOJB2uT5NgGTwpFN0U';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwYdRr1IJNe2ML_M7Hv6vg-T0cxeIE1-A-SkLCADdwlddlHUE8sDDckOwtyFXzfwMVMkw/exec';

const SHEETS = {
  NOV: { name: 'NOV 25', gid: '0' },
  DEC: { name: 'DEC 25', gid: '1644213918' },
  CONSOL: { name: 'FACTORY CONSOL', gid: '1623348583' }
};

const App = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedFactories, setExpandedFactories] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});
  const [editModal, setEditModal] = useState(null);
  const [remarksModal, setRemarksModal] = useState(null);
  const [hoveredStyle, setHoveredStyle] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFactory, setFilterFactory] = useState('');
  const [columnIndices, setColumnIndices] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sheets = [SHEETS.NOV.name, SHEETS.DEC.name];
      const allData = [];
      const colIndices = {};

      for (const sheetName of sheets) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}?key=${API_KEY}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url);
        const result = await response.json();
        
        console.log(`${sheetName} data:`, result);
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        
        if (result.values && result.values.length > 0) {
          const headers = result.values[0];
          const rows = result.values.slice(1);
          
          console.log('Headers:', headers);
          
          // Store column indices for this sheet
          colIndices[sheetName] = {
            factory: headers.indexOf('FACTORY') + 1,
            style: headers.indexOf('STYLE#') + 1,
            desc: headers.indexOf('DESC') + 1,
            fabricDesc: headers.indexOf('FABRIC DESC') + 1,
            qty: headers.indexOf('O QTY') + 1,
            reference: headers.indexOf('REFERENCE') + 1,
            inspectionDate: headers.indexOf('INSPECTION DATE') + 1,
            history: headers.indexOf('History') + 1,
            date: headers.indexOf('DATE') + 1,
            remarks: headers.indexOf('Remarks') + 1
          };

          const factoryIdx = headers.indexOf('FACTORY');
          const styleIdx = headers.indexOf('STYLE#');
          const descIdx = headers.indexOf('DESC');
          const fabricIdx = headers.indexOf('FABRIC DESC');
          const qtyIdx = headers.indexOf('O QTY');
          const refIdx = headers.indexOf('REFERENCE');
          const inspDateIdx = headers.indexOf('INSPECTION DATE');
          const historyIdx = headers.indexOf('History');
          const dateIdx = headers.indexOf('DATE');
          const remarksIdx = headers.indexOf('Remarks');

          rows.forEach((row, idx) => {
            if (row[factoryIdx]) {
              allData.push({
                factory: row[factoryIdx] || '',
                style: row[styleIdx] || '',
                desc: row[descIdx] || '',
                fabricDesc: row[fabricIdx] || '',
                qty: row[qtyIdx] || '',
                reference: row[refIdx] || '',
                inspectionDate: row[inspDateIdx] || '',
                history: row[historyIdx] || '',
                date: row[dateIdx] || '',
                remarks: row[remarksIdx] || '',
                sheetName,
                rowIndex: idx + 2
              });
            }
          });
        }
      }

      console.log('Total data loaded:', allData.length);
      console.log('Sample data:', allData.slice(0, 3));
      setColumnIndices(colIndices);
      setData(allData);
      
      if (allData.length === 0) {
        setError('No data found in the sheets. Please check if the sheet names and columns are correct.');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Error loading data: ' + err.message);
    }
    setLoading(false);
  };

  const saveToGoogleSheets = async (payload) => {
    try {
      console.log('Saving to Google Sheets:', payload);
      
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      return { success: true };
    } catch (err) {
      console.error('Error saving to Google Sheets:', err);
      throw err;
    }
  };

  const getMonthYear = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const organizeData = () => {
    const organized = {};
    
    // Filter data based on search term and factory filter
    const filteredData = data.filter(item => {
      const matchesSearch = !searchTerm || 
        item.factory.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.style.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.reference.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFactory = !filterFactory || 
        item.factory.toLowerCase().includes(filterFactory.toLowerCase());
      
      return matchesSearch && matchesFactory;
    });
    
    filteredData.forEach(item => {
      if (!organized[item.factory]) {
        organized[item.factory] = {};
      }
      
      const monthYear = getMonthYear(item.date);
      if (!organized[item.factory][monthYear]) {
        organized[item.factory][monthYear] = [];
      }
      
      organized[item.factory][monthYear].push(item);
    });

    return organized;
  };

  const toggleFactory = (factory) => {
    setExpandedFactories(prev => ({
      ...prev,
      [factory]: !prev[factory]
    }));
  };

  const toggleMonth = (factory, month) => {
    const key = `${factory}-${month}`;
    setExpandedMonths(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const openEditModal = (item) => {
    setEditModal({
      ...item,
      newDate: item.inspectionDate
    });
  };

  const openRemarksModal = (item) => {
    setRemarksModal({
      ...item,
      newRemarks: item.remarks
    });
  };

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const calculateRMDeadline = (inspectionDate) => {
    if (!inspectionDate) return '';
    const date = new Date(inspectionDate);
    if (isNaN(date.getTime())) return '';
    date.setDate(date.getDate() - 20);
    return formatDateForDisplay(date.toISOString());
  };

  const saveInspectionDate = async () => {
    if (!editModal) return;
    
    const reason = prompt('Reason for change? (Optional)');
    const formattedDate = formatDateForDisplay(editModal.newDate);
    const historyEntry = reason 
      ? `${formattedDate} (${reason})`
      : formattedDate;
    
    const newHistory = editModal.history 
      ? `${editModal.history}, ${historyEntry}`
      : historyEntry;

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
        historyColumn: colIdx.history
      };

      await saveToGoogleSheets(payload);

      const updatedData = data.map(item => {
        if (item.factory === editModal.factory && 
            item.style === editModal.style && 
            item.date === editModal.date &&
            item.sheetName === editModal.sheetName) {
          return {
            ...item,
            inspectionDate: editModal.newDate,
            history: newHistory
          };
        }
        return item;
      });
      
      setData(updatedData);
      setEditModal(null);
      alert('✅ Changes saved successfully to Google Sheets!');
    } catch (err) {
      alert('❌ Error saving changes: ' + err.message);
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
        remarksColumn: colIdx.remarks
      };

      await saveToGoogleSheets(payload);

      const updatedData = data.map(item => {
        if (item.factory === remarksModal.factory && 
            item.style === remarksModal.style && 
            item.date === remarksModal.date &&
            item.sheetName === remarksModal.sheetName) {
          return {
            ...item,
            remarks: remarksModal.newRemarks
          };
        }
        return item;
      });
      
      setData(updatedData);
      setRemarksModal(null);
      alert('✅ Remarks saved successfully to Google Sheets!');
    } catch (err) {
      alert('❌ Error saving remarks: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const organizedData = organizeData();
  const factories = Object.keys(organizedData);
  const totalRecords = factories.reduce((sum, factory) => {
    return sum + Object.keys(organizedData[factory]).reduce((monthSum, month) => {
      return monthSum + organizedData[factory][month].length;
    }, 0);
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300 text-lg">Loading factory data...</p>
          <p className="text-gray-500 text-sm mt-2">Fetching from Google Sheets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              Factory Production Tracker
            </h1>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          
          {/* Search and Filter Bar */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search factories, styles..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-100"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="w-64">
              <div className="relative">
                <Filter className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <select
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-100"
                  value={filterFactory}
                  onChange={(e) => setFilterFactory(e.target.value)}
                >
                  <option value="">All Factories</option>
                  {[...new Set(data.map(item => item.factory))].sort().map(factory => (
                    <option key={factory} value={factory}>{factory}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Data Count */}
          <div className="mt-4 text-sm text-gray-400">
            Showing {totalRecords} records from {factories.length} factories
          </div>
        </div>
      </div>

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 flex items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-white text-lg">Saving to Google Sheets...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {data.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400 text-lg">No data found. Please check your Google Sheets.</p>
          </div>
        ) : factories.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400 text-lg">No results found for your search/filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {factories.map(factory => (
              <div key={factory} className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden transition-all duration-300 hover:shadow-2xl">
                {/* Factory Header */}
                <div
                  onClick={() => toggleFactory(factory)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-750 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    {expandedFactories[factory] ? (
                      <ChevronDown className="w-6 h-6 text-blue-400 transition-transform duration-200" />
                    ) : (
                      <ChevronRight className="w-6 h-6 text-blue-400 transition-transform duration-200" />
                    )}
                    <h2 className="text-xl font-semibold text-blue-400">{factory}</h2>
                  </div>
                  <span className="text-sm text-gray-400">
                    {Object.keys(organizedData[factory]).length} month(s)
                  </span>
                </div>

                {/* Month Sections */}
                {expandedFactories[factory] && (
                  <div className="border-t border-gray-700 animate-fadeIn">
                    {Object.keys(organizedData[factory]).sort().map(monthYear => (
                      <div key={monthYear} className="border-b border-gray-700 last:border-b-0">
                        <div
                          onClick={() => toggleMonth(factory, monthYear)}
                          className="flex items-center justify-between p-4 pl-12 cursor-pointer hover:bg-gray-750 transition-colors duration-200"
                        >
                          <div className="flex items-center gap-3">
                            {expandedMonths[`${factory}-${monthYear}`] ? (
                              <ChevronDown className="w-5 h-5 text-purple-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-purple-400" />
                            )}
                            <h3 className="text-lg font-medium text-purple-400">{monthYear}</h3>
                          </div>
                          <span className="text-sm text-gray-400">
                            {organizedData[factory][monthYear].length} item(s)
                          </span>
                        </div>

                        {/* Data Rows */}
                        {expandedMonths[`${factory}-${monthYear}`] && (
                          <div className="bg-gray-850 p-4 animate-fadeIn">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead>
                                  <tr className="border-b border-gray-700">
                                    <th className="text-left p-3 text-gray-300 font-semibold">Style</th>
                                    <th className="text-left p-3 text-gray-300 font-semibold">Description</th>
                                    <th className="text-left p-3 text-gray-300 font-semibold">Reference</th>
                                    <th className="text-left p-3 text-gray-300 font-semibold">Inspection Date</th>
                                    <th className="text-left p-3 text-gray-300 font-semibold">RM Deadline</th>
                                    <th className="text-left p-3 text-gray-300 font-semibold">History</th>
                                    <th className="text-left p-3 text-gray-300 font-semibold">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {organizedData[factory][monthYear].map((item, idx) => (
                                    <tr
                                      key={idx}
                                      className="border-b border-gray-700 hover:bg-gray-800 transition-colors duration-150"
                                      onMouseEnter={() => setHoveredStyle(item)}
                                      onMouseLeave={() => setHoveredStyle(null)}
                                    >
                                      <td className="p-3">
                                        <div className="relative">
                                          <span className="text-blue-300 font-medium cursor-pointer hover:text-blue-200">
                                            {item.style}
                                          </span>
                                          {hoveredStyle === item && (
                                            <div className="absolute z-10 left-0 top-8 bg-gray-700 border border-gray-600 rounded-lg p-3 shadow-xl w-64 animate-fadeIn">
                                              <div className="text-sm">
                                                <div className="mb-2">
                                                  <span className="text-gray-400">Order Qty:</span>
                                                  <span className="ml-2 text-white font-semibold">{item.qty}</span>
                                                </div>
                                                <div>
                                                  <span className="text-gray-400">Fabric:</span>
                                                  <span className="ml-2 text-white">{item.fabricDesc}</span>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="p-3 text-gray-300">{item.desc}</td>
                                      <td className="p-3 text-gray-300">{item.reference}</td>
                                      <td className="p-3">
                                        <button
                                          onClick={() => openEditModal(item)}
                                          className="flex items-center gap-2 text-yellow-400 hover:text-yellow-300 transition-colors"
                                        >
                                          <Calendar className="w-4 h-4" />
                                          <span>{formatDateForDisplay(item.inspectionDate) || 'Not set'}</span>
                                        </button>
                                      </td>
                                      <td className="p-3 text-green-400">
                                        {calculateRMDeadline(item.inspectionDate)}
                                      </td>
                                      <td className="p-3 text-gray-400 text-sm max-w-xs truncate" title={item.history}>
                                        {item.history || '-'}
                                      </td>
                                      <td className="p-3">
                                        <button
                                          onClick={() => openRemarksModal(item)}
                                          className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                          <span>Remarks</span>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Inspection Date Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-gray-800 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-400">Edit Inspection Date</h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-gray-300 mb-2">Style: {editModal.style}</label>
              <label className="block text-gray-300 mb-2">Current Date: {formatDateForDisplay(editModal.inspectionDate)}</label>
              <input
                type="date"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-100"
                value={editModal.newDate}
                onChange={(e) => setEditModal({ ...editModal, newDate: e.target.value })}
              />
            </div>
            {editModal.history && (
              <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                <label className="block text-gray-400 text-sm mb-1">Change History:</label>
                <p className="text-gray-300 text-sm">{editModal.history}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={saveInspectionDate}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditModal(null)}
                disabled={saving}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remarks Modal */}
      {remarksModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-gray-800 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-400">Edit Remarks</h3>
              <button onClick={() => setRemarksModal(null)} className="text-gray-400 hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-gray-300 mb-2">Style: {remarksModal.style}</label>
              <textarea
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100 h-32"
                value={remarksModal.newRemarks}
                onChange={(e) => setRemarksModal({ ...remarksModal, newRemarks: e.target.value })}
                placeholder="Enter remarks..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveRemarks}
                disabled={saving}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Remarks'}
              </button>
              <button
                onClick={() => setRemarksModal(null)}
                disabled={saving}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-gray-300 rounded-lg transition-colors"
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
        .bg-gray-750 {
          background-color: #2d3748;
        }
        .bg-gray-850 {
          background-color: #1a202c;
        }
      `}</style>
    </div>
  );
};

export default App;