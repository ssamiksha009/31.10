// Copy ftire.js content and replace all instances of 'ftire' with 'cdtire' in the API endpoints

document.getElementById('logoutBtn').addEventListener('click', function() {
    window.location.href = '/login.html';
});

// Fallback helper: collect input values by id -> returns object { id: value }
// If another implementation exists elsewhere this will not override it.
if (typeof window.collectInputs === 'undefined') {
  window.collectInputs = function(ids = []) {
    const out = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) { out[id] = ''; return; }
      let v = el.value;
      if (v === undefined || v === null) { out[id] = ''; return; }
      v = String(v).trim();
      // convert plain numeric strings to Number (preserve empty and non-numeric)
      if (v !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g,'.'))) {
        out[id] = Number(v.replace(/,/g,'.'));
      } else {
        out[id] = v;
      }
    });
    return out;
  };
}

// Add missing normalize() used by header-mapping and logging
function normalize(s) {
  if (s == null) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // remove invisible chars
    .replace(/[\[\]\(\)\.]/g, '')            // remove brackets/periods
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ');
}

document.getElementById('submitBtn').addEventListener('click', async function() {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = '';
    

// Only check the 4 required fields
const requiredIds = ['rimWidth', 'rimDiameter', 'l1', 'p1'];
let allValid = true;

requiredIds.forEach(id => {
    const input = document.getElementById(id);
    if (!input.value || isNaN(Number(input.value)) || Number(input.value) <= 0) {
        allValid = false;
        input.classList.add('invalid');
    } else {
        input.classList.remove('invalid');
    }
});

if (!allValid) {
    errorMessage.textContent = '* Please fill all required fields with positive numbers: Rim Width, Rim Diameter, Load 1, Pressure';
    errorMessage.style.display = 'block';
    return;
}
    
    // Persist current input values into projects.inputs when projectId present
    try {
      const pid = getProjectId();
      if (pid) {
        const ids = [
          'rimWidth', 'rimDiameter', 'nominalWidth', 'outerDiameter',
          'p1', 'l1', 'l2', 'l3', 'l4', 'l5', 'vel', 'ia', 'sr', 'aspectRatio'
        ];
        await saveInputs(pid, collectInputs(ids));
      }
    } catch (e) {
      console.warn('Failed to save inputs for project:', e);
    }

    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
    checkProjectExists(projectName, 'CDTire');
});

// Add function to check project existence and show confirmation
function checkProjectExists(projectName, protocol) {
    fetch('/api/check-project-exists', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            projectName: projectName,
            protocol: protocol
        })
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            throw new Error(data.message || 'Error checking project existence');
        }
        
        //  ONLY show prompt if project EXISTS IN DATABASE
        if (data.exists && data.project && data.project.id) {
            // Project exists, show confirmation dialog
            const userConfirmed = confirm(`Project "${data.folderName}" already exists. Do you want to Replace it?`);
            if (userConfirmed) {
                // User confirmed, proceed with workflow
                proceedWithSubmission();
            } else {
                // User cancelled, do nothing (stay on same page)
                return;
            }
        } else {
            // Project doesn't exist, proceed normally
            proceedWithSubmission();
        }
    })
    .catch(error => {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.style.color = '#d9534f';
        errorMessage.textContent = error.message || 'Error checking project status. Please try again.';
    });
}

async function proceedWithSubmission() {
    try {
        const meshFile = document.getElementById('meshFile').files[0];
        const errorMessage = document.getElementById('errorMessage');
        
        // Clear previous errors
        errorMessage.textContent = '';
        
        if (meshFile) {
            const formData = new FormData();
            formData.append('meshFile', meshFile);
            
            try {
                const response = await fetch('/api/upload-mesh-file', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.message || 'Failed to upload mesh file');
                }

                // Log mesh file upload
                try {
                    await fetch('/api/activity-log', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            activity_type: 'File',
                            action: 'Mesh File Uploaded',
                            description: `Uploaded mesh file "${meshFile.name}" for MF5.2 protocol`,
                            status: 'success',
                            metadata: { filename: meshFile.name, protocol: 'MF5.2' }
                        })
                    });
                } catch (logError) {
                    console.warn('Failed to log mesh upload activity:', logError);
                    // Consider: Should this prevent the process from continuing?
                }
                
                // Process the Excel file
                await processMF52Excel();
                
            } catch (error) {
                errorMessage.style.color = '#d9534f';
                errorMessage.textContent = error.message || 'Error uploading mesh file. Please try again.';
                console.error('Mesh file upload error:', error);
            }
        } else {
            try {
                await processCDTireExcel();
            } catch (error) {
                errorMessage.style.color = '#d9534f';
                errorMessage.textContent = error.message || 'Error processing Excel file. Please try again.';
                console.error('Excel processing error:', error);
            }
        }
        
        // ✅ Generate batch file AFTER creating folders
        const batchResponse = await fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: projectName,
                protocol: protocolName // e.g., 'MF62', 'FTire', etc.
            })
        });
        
        const batchData = await batchResponse.json();
        
        if (batchData.success) {
            console.log(`✅ Batch file generated: ${batchData.testCount} commands`);
        } else {
            console.warn(`⚠️ Batch file generation failed: ${batchData.message}`);
        }
        
    } catch (error) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.style.color = '#d9534f';
        errorMessage.textContent = error.message || 'Error processing file. Please try again.';
    }
}
// Extract Excel processing to a separate function
function processCDTireExcel() {
    const errorMessage = document.getElementById('errorMessage');
    
    //  STEP 1: Collect user input values FIRST
    const userInputs = {
        load1_kg: document.getElementById('l1').value,
        load2_kg: document.getElementById('l2').value,
        load3_kg: document.getElementById('l3').value,
        load4_kg: document.getElementById('l4').value,
        load5_kg: document.getElementById('l5').value,
        pressure1: document.getElementById('p1').value,
        speed_kmph: document.getElementById('vel').value,
        IA: document.getElementById('ia').value,
        SR: document.getElementById('sr').value,
        width: document.getElementById('rimWidth').value,
        diameter: document.getElementById('rimDiameter').value,
        Outer_diameter: document.getElementById('outerDiameter').value,
        nomwidth: document.getElementById('nominalWidth').value,
        aspratio: document.getElementById('aspectRatio').value
    };

    //  Create replacement mapping (for display values only)
    const parameterReplacements = {
        'P1': userInputs.pressure1,
        'P2': userInputs.pressure1,
        'L1': userInputs.load1_kg,
        'L2': userInputs.load2_kg,
        'L3': userInputs.load3_kg,
        'L4': userInputs.load4_kg,
        'L5': userInputs.load5_kg,
        'VEL': userInputs.speed_kmph,
        'IA': userInputs.IA,
        '-IA': userInputs.IA ? (-Math.abs(parseFloat(userInputs.IA))).toString() : '0',
        'SR': userInputs.SR,
        '-SR': userInputs.SR ? (-Math.abs(parseFloat(userInputs.SR))).toString() : '0'
    };

    // Helper function to replace parameters (for non-P/L columns)
    function replaceParameters(value) {
        if (!value || value === null || value === undefined) return '';
        
        let strValue = String(value).trim();
        
        if (parameterReplacements[strValue]) {
            return parameterReplacements[strValue];
        }
        
        if (strValue.startsWith('-') && parameterReplacements[strValue]) {
            return parameterReplacements[strValue];
        }
        
        if (!isNaN(parseFloat(strValue)) && isFinite(strValue)) {
            return strValue;
        }
        
        return strValue;
    }

    const parameterData = {
        load1_kg: userInputs.load1_kg,
        load2_kg: userInputs.load2_kg,
        load3_kg: userInputs.load3_kg,
        load4_kg: userInputs.load4_kg,
        load5_kg: userInputs.load5_kg,
        pressure1: userInputs.pressure1,
        speed_kmph: userInputs.speed_kmph,
        IA: userInputs.IA,
        SR: userInputs.SR,
        width: userInputs.width,
        diameter: userInputs.diameter,
        Outer_diameter: userInputs.Outer_diameter,
        nomwidth: userInputs.nomwidth,
        aspratio: userInputs.aspratio
    };

    // Generate parameter file first
    fetch('/api/generate-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameterData)
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) throw new Error(data.message);
        return fetch('/api/read-protocol-excel', {
            headers: { 'Referer': '/cdtire.html' }
        });
    })
    .then(response => response.arrayBuffer())
    .then(data => {
        const workbook = XLSX.read(new Uint8Array(data), {type: 'array'});
        const extractedData = [];

        workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            // Find header row
            let headerRowIndex = jsonData.findIndex(row => 
                row && Array.isArray(row) && row.some(cell => 
                    cell && String(cell).toLowerCase().includes('no of tests')
                )
            );
            
            if (headerRowIndex === -1) {
                for (let i = 0; i < Math.min(5, jsonData.length); i++) {
                    const row = jsonData[i];
                    if (row && row.some(c => c && String(c).toLowerCase().includes('test'))) {
                        headerRowIndex = i;
                        break;
                    }
                }
            }
            
            if (headerRowIndex === -1) {
                console.warn('Header row not found, using row 0');
                headerRowIndex = 0;
            }

            const headerRow = jsonData[headerRowIndex];
            
            //  Map columns
            const columns = {
                runs: headerRow.findIndex(h => h && String(h).toLowerCase().includes('no of tests')),
                testName: headerRow.findIndex(h => h && String(h).toLowerCase().includes('test name')),
                pressure: headerRow.findIndex(h => h && String(h).toLowerCase().includes('inflation pressure')),
                velocity: headerRow.findIndex(h => h && String(h).toLowerCase().includes('velocity')),
                preload: headerRow.findIndex(h => h && String(h).toLowerCase().includes('preload')),
                camber: headerRow.findIndex(h => h && String(h).toLowerCase().includes('camber')),
                slipAngle: headerRow.findIndex(h => h && String(h).toLowerCase().includes('slip angle')),
                displacement: headerRow.findIndex(h => h && String(h).toLowerCase().includes('displacement')),
                slipRange: headerRow.findIndex(h => h && String(h).toLowerCase().includes('slip range')),
                cleat: headerRow.findIndex(h => h && String(h).toLowerCase().includes('cleat')),
                roadSurface: headerRow.findIndex(h => h && String(h).toLowerCase().includes('road surface')),
                job: headerRow.findIndex(h => h && String(h).toLowerCase().includes('job') && !String(h).toLowerCase().includes('old')),
                old_job: headerRow.findIndex(h => h && String(h).toLowerCase().includes('old job')),
                fortran_file: headerRow.findIndex(h => h && String(h).toLowerCase().includes('fortran')),
                python_script: headerRow.findIndex(h => h && String(h).toLowerCase().includes('python')),
                template_tydex: headerRow.findIndex(h => h && String(h).toLowerCase().includes('template tydex')),
                tydex_name: headerRow.findIndex(h => h && String(h).toLowerCase().includes('tydex name'))
            };

            //  CRITICAL: Find P and L columns
            let pColumnIndex = -1;
            let lColumnIndex = -1;
            
            // Search for columns named exactly "P" and "L" (case-insensitive)
            for (let i = 0; i < headerRow.length; i++) {
                const header = headerRow[i];
                if (header && String(header).trim().toLowerCase() === 'p') {
                    pColumnIndex = i;
                }
                if (header && String(header).trim().toLowerCase() === 'l') {
                    lColumnIndex = i;
                }
            }
            
            // Fallback: if not found by exact match, try position-based (after tydex_name)
            if (pColumnIndex === -1 && columns.tydex_name !== -1) {
                pColumnIndex = columns.tydex_name + 1;
            }
            if (lColumnIndex === -1 && pColumnIndex !== -1) {
                lColumnIndex = pColumnIndex + 1;
            }

            console.log(' CDTire Column Mapping:', columns);
            console.log(' P Column Index:', pColumnIndex, '| L Column Index:', lColumnIndex);
            console.log(' Header Row:', headerRow);

            //  Extract data rows
            for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                
                if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
                    continue;
                }
                
                const runNumber = columns.runs !== -1 && row[columns.runs] !== undefined 
                    ? parseInt(row[columns.runs]) 
                    : null;
                
                if (!runNumber || isNaN(runNumber)) {
                    console.warn('⚠️  Skipping row without valid run number:', row);
                    continue;
                }

                //  EXTRACT P AND L VALUES **WITHOUT REPLACEMENT** (keep as P2, L1, etc.)
                const rawP = pColumnIndex !== -1 && row[pColumnIndex] !== undefined 
                    ? String(row[pColumnIndex]).trim() 
                    : '';
                const rawL = lColumnIndex !== -1 && row[lColumnIndex] !== undefined 
                    ? String(row[lColumnIndex]).trim() 
                    : '';

                console.log(`🔍 Row ${runNumber}: Raw P="${rawP}", Raw L="${rawL}"`);

                //  Helper to clean values WITH parameter replacement (for OTHER columns)
                const cleanValue = (val) => {
                    if (val === undefined || val === null) return '';
                    let cleaned = String(val).trim().replace(/\r?\n/g, ' ');
                    return replaceParameters(cleaned);
                };

                // Around line 350

const rowObj = {
    number_of_runs: runNumber,
    test_name: columns.testName !== -1 ? cleanValue(row[columns.testName]) : '',
    inflation_pressure: columns.pressure !== -1 ? cleanValue(row[columns.pressure]) : '',
    velocity: columns.velocity !== -1 ? cleanValue(row[columns.velocity]) : '',
    preload: columns.preload !== -1 ? cleanValue(row[columns.preload]) : '',
    camber: columns.camber !== -1 ? cleanValue(row[columns.camber]) : '',
    slip_angle: columns.slipAngle !== -1 ? cleanValue(row[columns.slipAngle]) : '',
    displacement: columns.displacement !== -1 ? cleanValue(row[columns.displacement]) : '',
    slip_range: columns.slipRange !== -1 ? cleanValue(row[columns.slipRange]) : '',
    cleat: columns.cleat !== -1 ? cleanValue(row[columns.cleat]) : '',
    road_surface: columns.roadSurface !== -1 ? cleanValue(row[columns.roadSurface]) : '',
    job: columns.job !== -1 ? cleanValue(row[columns.job]) : '',
    old_job: columns.old_job !== -1 ? cleanValue(row[columns.old_job]) : '',
    template_tydex: columns.template_tydex !== -1 ? cleanValue(row[columns.template_tydex]) : '',
    tydex_name: columns.tydex_name !== -1 ? cleanValue(row[columns.tydex_name]) : '',
    fortran_file: columns.fortran_file !== -1 ? cleanValue(row[columns.fortran_file]) : '', // CRITICAL: Store fortran file
    python_script: columns.python_script !== -1 ? cleanValue(row[columns.python_script]) : '', // CRITICAL: Store python script
    p: rawP,
    l: rawL
};

                console.log(` Row ${runNumber} stored with P="${rowObj.p}", L="${rowObj.l}"`);
                extractedData.push(rowObj);
            }
        });

        if (extractedData.length === 0) {
            throw new Error('No valid data found in Excel file');
        }
        
        console.log(' CDTire extracted data:', extractedData);

        return fetch('/api/store-cdtire-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                data: extractedData,
                projectId: getProjectId() || null
            })
        });
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) throw new Error(data.message);
        
        const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
        return fetch('/api/create-protocol-folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectName: projectName,
                protocol: 'CDTire'
            })
        });
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err && err.message ? err.message : 'Error creating protocol folders'); });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.message || 'Error creating protocol folders');
        }
        
        const pid = getProjectId();
        if (pid) {
            return fetch('/api/store-project-matrix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: pid, protocol: 'CDTire' })
            })
            .then(resp => {
                if (!resp.ok) {
                    return resp.json().then(err => { throw new Error(err && err.message ? err.message : 'Failed to store project matrix'); });
                }
                return resp.json();
            });
        }
        return Promise.resolve({ ok: true });
    })
    .then(() => {
        return fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: sessionStorage.getItem('currentProject'),
                protocol: 'CDTire'
            })
        });
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log(`Batch file generated: ${data.testCount} tests`);
        }
        updateTestSummary();
        window.location.href = '/select.html';
     })
     .catch(error => {
         const errorMessage = document.getElementById('errorMessage');
         errorMessage.style.color = '#d9534f';
         errorMessage.textContent = error.message || 'Error processing file. Please try again.';
     });
}

function updateTestSummary() {
    fetch('/api/get-cdtire-summary')
        .then(response => {
            if (!response.ok) {
                console.error('Summary response status:', response.status);
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Summary data received:', data); // Debug log
            const summaryContainer = document.getElementById('testSummary');
            if (!data || data.length === 0) {
                summaryContainer.innerHTML = '<div class="summary-item">No tests available</div>';
                return;
            }
            
            summaryContainer.innerHTML = data.map(item => `
                <div class="summary-item">
                    <span class="test-name">${item.test_name || 'Unknown'}:</span>
                    <span class="test-count">${item.count}</span>
                </div>
            `).join('');
        })
        .catch(error => {
            console.error('Error fetching test summary:', error);
            const summaryContainer = document.getElementById('testSummary');
            summaryContainer.innerHTML = '<div class="error-message">Unable to load test summary</div>';
        });
}

// ==== shared helpers ====
function getProjectId() {
  const qs = new URLSearchParams(location.search);
  return qs.get('projectId');
}
async function fetchProject(id) {
  const token = localStorage.getItem('authToken');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const r = await fetch(`/api/projects/${id}`, { headers });
  if (r.status === 401) {
    // unauthorized — clear token and redirect to login
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  if (!r.ok) throw new Error('Failed to fetch project');
  return r.json();
}
async function saveInputs(projectId, inputs) {
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Server expects drafts endpoint: /api/projects/:projectId/drafts/:protocol
  const url = `/api/projects/${encodeURIComponent(projectId)}/drafts/CDTire`;
  const body = { inputs_json: inputs };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    // try to extract JSON message, fallback to text/status
    let msg = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      msg = j && j.message ? j.message : JSON.stringify(j);
    } catch (e) {
      try { msg = await resp.text(); } catch (_) { msg = resp.statusText || msg; }
    }
    throw new Error(msg || 'Failed to save inputs');
  }

  return resp.json();
}