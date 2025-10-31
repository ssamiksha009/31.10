// ===== GLOBAL PROJECT VARIABLES =====
let currentProjectStatus = null;
let currentProjectId = null;
let currentProjectName = null; 
let currentProtocol = null; 

// GET PROJECT INFO FROM URL / session ON PAGE LOAD
async function initializeProjectFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  // Accept both 'projectId' and legacy 'id' query names
  currentProjectId = urlParams.get('projectId') || urlParams.get('id') || sessionStorage.getItem('currentProjectId') || null;
  // Project name may be in sessionStorage (set on create)
  currentProjectName = urlParams.get('project') || sessionStorage.getItem('currentProject') || currentProjectName;

  // If we still don't have an ID but have a project name, try to resolve id from server
  if (!currentProjectId && currentProjectName) {
    try {
      const r = await fetch('/api/check-project-exists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: currentProjectName })
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.success && j.exists && j.project && j.project.id) {
          currentProjectId = String(j.project.id);
          sessionStorage.setItem('currentProjectId', currentProjectId);
          console.log('Resolved projectId from server for', currentProjectName, '→', currentProjectId);
        }
      }
    } catch (e) {
      console.warn('Could not resolve project id from server:', e);
    }
  }

  // If we have an id, persist and continue
  if (currentProjectId) {
    sessionStorage.setItem('currentProjectId', currentProjectId);
    // If project name missing, fetch it
    if (!currentProjectName) {
      try {
        const metaRes = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}`, { headers: getAuthHeaders() });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta && meta.success && meta.project) {
            currentProjectName = meta.project.project_name;
            sessionStorage.setItem('currentProject', currentProjectName);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch project metadata:', e);
      }
    }
    console.log(`Project ID resolved: ${currentProjectId} (${currentProjectName || 'name unknown'})`);
    return true;
  }

  // No id available. If project name is set (session), allow scratch mode — don't force redirect.
  if (currentProjectName) {
    sessionStorage.setItem('currentProject', currentProjectName);
    console.log('No projectId in URL but project name available in session. Continuing in scratch mode for:', currentProjectName);
    return true;
  }

  // No id or project name — this is a true error (user landed here incorrectly)
  console.error('No project ID found in URL or session');
  alert('Error: No project ID found. Please return to dashboard.');
  window.location.href = '/user-dashboard.html';
  return false;
}

// FETCH PROJECT DETAILS FROM SERVER
async function loadProjectDetails() {
  try {
    // Use centralized helper to get auth header (keeps consistency with other pages)
    const headers = getAuthHeaders();
    const response = await fetch(`/api/projects/${currentProjectId}`, { headers });

    if (!response.ok) {
      throw new Error('Failed to fetch project details');
    }
    
    const data = await response.json();
    
    if (data.success && data.project) {
      currentProjectName = data.project.project_name;
      currentProtocol = data.project.protocol;
      // persist protocol so other flows can use it if loadProjectDetails fails later
      if (currentProtocol) sessionStorage.setItem('currentProjectProtocol', currentProtocol);
      currentProjectStatus = data.project.status;
      
      console.log(`Project loaded: ${currentProjectName}`);
      console.log(`Protocol: ${currentProtocol}`);
      console.log(`Status: ${currentProjectStatus}`);
      
      // Update UI with project info
      document.title = `${currentProjectName} - Apollo Tyres`;
      
      return true;
    } else {
      throw new Error('Invalid project data received');
    }
    
  } catch (error) {
    console.error('Error loading project details:', error);
    alert('Error loading project. Please try again.');
    return false;
  }
}

// INITIALIZE ON PAGE LOAD
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing select.html page...');
  
  // Step 1: Get project ID / name from URL or session (may perform server lookup)
  const ok = await initializeProjectFromUrl();
  if (!ok) return;

  // Step 2: Load project details from server (if id available)
  const loaded = await loadProjectDetails();
  if (!loaded) {
    console.error('Failed to load project details — continuing in scratch mode if possible');
  }

  // Step 3: Load test matrix data (guard if function missing)
  if (typeof loadTestMatrix === 'function') {
    await loadTestMatrix();
  } else {
    console.warn('loadTestMatrix() not defined - skipping matrix load');
  }
  
  // Step 4: Setup button event listeners
  setupEventListeners();
  
  console.log('✅ Page initialization complete');
});


// Get project ID from URL
function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('projectId') || params.get('id') || sessionStorage.getItem('currentProjectId') || null;
}

// Logout function (server-based session)
async function logout() {
    try {
        // Call server logout endpoint to clear session
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include', // Important: send cookies
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Redirect to login regardless of API response
        window.location.href = '/login.html';
    }
}

// Refresh page function with animation
function refreshPageSelect() {
    const btn = document.getElementById('refreshBtnSelect');
    if (btn) {
        btn.classList.add('refreshing');
        setTimeout(() => {
            window.location.reload();
        }, 300); // Small delay for visual feedback
    }
}
/* ---------------- helpers ---------------- */

function visibleDataTable() {
  return document.querySelector('.data-table:not([style*="display: none"])');
}

function getVisibleProtocolKey() {
  const t = visibleDataTable();
  if (!t) return null;
  return t.id.replace('Table', '');
}

function getProtocolFromCurrentTable() {
    const t = visibleDataTable();
    if (!t) return 'Unknown';
    
    switch (t.id) {
        case 'mf62Table': return 'MF62'; 
        case 'mf52Table': return 'MF52';  
        case 'ftireTable': return 'FTire';
        case 'cdtireTable': return 'CDTire';
        case 'customTable': return 'Custom';
        default: return 'Unknown';
    }
}

function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function findProjectId() {
  const qs = new URLSearchParams(location.search);
  let id = qs.get('projectId');
  if (id) return id;

  id = sessionStorage.getItem('currentProjectId');
  if (id) return id;

  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) return null;

  const r = await fetch('/api/check-project-exists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectName })
  });
  const j = await r.json();
  if (j && j.success && j.exists && j.project && j.project.id) {
    sessionStorage.setItem('currentProjectId', String(j.project.id));
    return String(j.project.id);
  }
  return null;
}

/* ---------------- Show/Hide Status Buttons (IMPROVED) ---------------- */
function showHideButtons(status) {
  const completeBtn = document.getElementById('completeProjectBtn');
  const inProgressBtn = document.getElementById('markInProgressBtn');
  
  // First hide both
  if (completeBtn) completeBtn.style.display = 'none';
  if (inProgressBtn) inProgressBtn.style.display = 'none';
  
  if (!status) {
    //  For new projects (no status), show BOTH buttons
    if (completeBtn) {
      completeBtn.style.display = 'inline-block';
      console.log(' Showing Complete button for new project');
    }
    if (inProgressBtn) {
      inProgressBtn.style.display = 'inline-block';
      console.log(' Showing In Progress button for new project');
    }
    return;
  }
  
  const normalized = status.toLowerCase().trim();
  
  if (normalized === 'completed') {
    //  FIXED: For completed projects, HIDE BOTH buttons (no changes allowed)
    console.log(' Hiding both buttons for Completed project (read-only)');
    // Both buttons already hidden above
  } else if (normalized === 'in progress') {
    // Show "Mark Project as Complete" button
    if (completeBtn) {
      completeBtn.style.display = 'inline-block';
      console.log(' Showing Complete button for In Progress project');
    }
  } else if (normalized === 'not started') {
    //  For "Not Started" projects, show BOTH buttons
    if (completeBtn) {
      completeBtn.style.display = 'inline-block';
      console.log(' Showing Complete button for Not Started project');
    }
    if (inProgressBtn) {
      inProgressBtn.style.display = 'inline-block';
      console.log(' Showing In Progress button for Not Started project');
    }
  }
}



/* ---------------- status indicators ---------------- */

//  Track which runs have been manually started
const runHistory = new Set();

async function updateStatusIndicators(runNumber = null) {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) return;

  const protocolKey = getVisibleProtocolKey();
  if (!protocolKey) return;

  const rows = document.querySelectorAll('tbody tr');
  
  //  Check if we're in archived mode
  const isArchivedMode = new URLSearchParams(window.location.search).has('projectId');
  
  for (const row of rows) {
    const runNumberCell = row.cells && row.cells[0];
    if (!runNumberCell) continue;

    const currentRun = runNumberCell.textContent;
    const statusCell = row.querySelector('.status-indicator');
    const runButton = row.querySelector(`.row-run-btn[data-run="${currentRun}"]`);
    const tydexButton = row.querySelector(`.tydex-btn[data-run="${currentRun}"]`);

    //  NEW: In scratch mode (fresh project), show Run buttons by default
    if (!isArchivedMode && !runHistory.has(currentRun) && runNumber !== currentRun) {
      // This is a fresh project row that hasn't been run yet
      if (runButton) {
        runButton.style.display = 'inline-block';
        runButton.disabled = false;
      }
      if (tydexButton) {
        tydexButton.style.display = 'none';
        tydexButton.disabled = true;
      }
      // Keep default status text from HTML ("Not started ✕")
      continue; // Skip ODB check for this row
    }

    //  For archived mode or already-run tests, check ODB files
    try {
      const rowDataResponse = await fetch(`/api/get-row-data?protocol=${protocolKey}&runNumber=${currentRun}`);
      if (!rowDataResponse.ok) continue;

      const rowDataResult = await rowDataResponse.json();
      const { p, l, job, tydex_name } = rowDataResult.data;
      const folderName = `${p}_${l}`;

      const odbResponse = await fetch(`/api/check-odb-file?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocolKey)}&folderName=${encodeURIComponent(folderName)}&jobName=${encodeURIComponent(job)}`);
      const odbResult = await odbResponse.json();

      if (odbResult.exists) {
        statusCell.textContent = 'Completed ✓';
        statusCell.style.color = '#28a745';
        if (runButton) runButton.style.display = 'none';
        if (tydexButton) {
          tydexButton.style.display = 'inline-block';
          tydexButton.disabled = false;

          if (tydex_name && tydex_name.trim() !== '') {
            const tydexResponse = await fetch(`/api/check-tydex-file?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocolKey)}&folderName=${encodeURIComponent(folderName)}&tydexName=${encodeURIComponent(tydex_name)}`);
            const tydexResult = await tydexResponse.json();

            if (tydexResult.exists) {
              tydexButton.textContent = 'Open File';
              tydexButton.style.backgroundColor = '#228496';
              tydexButton.classList.add('open-file');
              tydexButton.onclick = function () { openTydexFile(currentRun); };
            } else {
              tydexButton.textContent = 'Generate Tydex';
              tydexButton.style.backgroundColor = '#28a745';
              tydexButton.classList.remove('open-file');
              tydexButton.onclick = function () { generateTydex(currentRun); };
            }
          }
        }
      } else {
        // ODB doesn't exist for a previously-run or archived test
        statusCell.textContent = 'Not started ✕';
        statusCell.style.color = '#dc3545';
        if (runButton) {
          runButton.style.display = 'inline-block';
          runButton.disabled = false;
        }
        if (tydexButton) {
          tydexButton.style.display = 'none';
          tydexButton.disabled = true;
        }
      }
    } catch (error) {
      console.error('Error checking status for run', currentRun, error);
      if (isArchivedMode || runHistory.has(currentRun)) {
        statusCell.textContent = 'Error checking status ✕';
        statusCell.style.color = '#dc3545';
        if (runButton) runButton.style.display = 'inline-block';
        if (tydexButton) {
          tydexButton.style.display = 'none';
          tydexButton.disabled = true;
        }
      }
    }
  }
}

/* ---------------- page load ---------------- */

document.addEventListener('DOMContentLoaded', function () {
  const referer = document.referrer || '';
  const mf62Table = document.getElementById('mf62Table');
  const mf52Table = document.getElementById('mf52Table');
  const ftireTable = document.getElementById('ftireTable');
  const cdtireTable = document.getElementById('cdtireTable');
  const customTable = document.getElementById('customTable');
  let fetchEndpoint;

  // ---- ARCHIVED MODE: open a project by id ----
  const qs = new URLSearchParams(location.search);
  const projectId = qs.get('projectId');

  if (projectId) {
    (async () => {
      try {
        // Fetch project details
        const metaRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
  headers: getAuthHeaders()
});
        const meta = await metaRes.json();

        if (!meta.success || !meta.project) throw new Error('Project not found');

        const { id, project_name, protocol: projectProtocol, status } = meta.project;
        sessionStorage.setItem('currentProject', project_name);
        sessionStorage.setItem('currentProjectId', String(id));

        //  IMMEDIATELY SHOW/HIDE BUTTONS BASED ON STATUS
        console.log(' Project loaded - Status:', status);
        showHideButtons(status);

        // Set protocol title
        const titleEl = document.getElementById('protocol-title');
        if (titleEl) {
          const nice = (projectProtocol || '').toString();
          if (/mf6/i.test(nice)) titleEl.textContent = 'MF 6.2 Protocol';
          else if (/mf5/i.test(nice)) titleEl.textContent = 'MF 5.2 Protocol';
          else if (/ftire/i.test(nice)) titleEl.textContent = 'FTire Protocol';
          else if (/cdtire/i.test(nice)) titleEl.textContent = 'CDTire Protocol';
          else if (/custom/i.test(nice)) titleEl.textContent = 'Custom Protocol';
          else titleEl.textContent = nice || 'Protocol';
        }

        // Load archived rows
        let rows = [];
        try {
          const dataRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/matrix`, {
  headers: getAuthHeaders()
});
          if (!dataRes.ok) throw new Error(`Archive rows not available (HTTP ${dataRes.status})`);
          const dataJson = await dataRes.json();
          if (!dataJson.success) throw new Error('Failed to load archived data');
          rows = dataJson.rows || [];
        } catch (archiveErr) {
          console.warn('Archived rows not loaded:', archiveErr);
          const container = document.getElementById('data-container');
          if (container) {
            const notice = document.createElement('div');
            notice.className = 'error-message';
            notice.style.textAlign = 'center';
            notice.style.padding = '18px';
            notice.textContent = 'Archived rows are not available for this project.';
            container.insertBefore(notice, container.firstChild);
          }
        }

        // Hide all tables first
        mf62Table.style.display = 'none';
        mf52Table.style.display = 'none';
        ftireTable.style.display = 'none';
        cdtireTable.style.display = 'none';
        customTable.style.display = 'none';

        const show = (el, title, fn) => {
          el.style.display = 'table';
          if (titleEl) titleEl.textContent = title;
          if (typeof fn === 'function' && rows.length) fn(rows);
        };

        // Show table matching protocol
        switch (projectProtocol) {
          case 'MF62': case 'MF6.2': show(mf62Table, 'MF 6.2 Protocol', displayMF62Data); break;
          case 'MF52': case 'MF5.2': show(mf52Table, 'MF 5.2 Protocol', displayMF52Data); break;
          case 'FTire': show(ftireTable, 'FTire Protocol', displayFTireData); break;
          case 'CDTire': show(cdtireTable, 'CDTire Protocol', displayCDTireData); break;
          case 'Custom': show(customTable, 'Custom Protocol', displayCustomData); break;
          default:
            mf62Table.style.display = 'table';
            break;
        }

        // Hide run buttons for completed projects
        if (status && status.toLowerCase().trim() === 'completed') {
          document.querySelectorAll('.run-button-cell, .row-run-btn').forEach(n => { 
            n.style.display = 'none'; 
          });
        }

        // Insert archived toolbar
        initArchivedToolbar({
          projectId: id,
          projectName: project_name,
          protocol: projectProtocol,
          rows
        });

        // Update status indicators
        updateStatusIndicators(); //  This will only check archived projects or already-run tests
        
      } catch (e) {
        console.error('Archived view error:', e);
        const container = document.getElementById('data-container');
        if (container) {
          container.innerHTML = `<p class="error-message">Failed to load project: ${e.message}</p>`;
        }
      }
    })();

    return; // Stop here for archived projects
  }

  // ---- SCRATCH MODE (new project) ----
  
  // Hide all tables first
  mf62Table.style.display = 'none';
  mf52Table.style.display = 'none';
  ftireTable.style.display = 'none';
  cdtireTable.style.display = 'none';
  customTable.style.display = 'none';

  // Show appropriate table and set endpoint
  if (referer.includes('mf52.html')) {
    fetchEndpoint = '/api/get-mf52-data';
    mf52Table.style.display = 'table';
  } else if (referer.includes('mf.html')) {
    fetchEndpoint = '/api/get-mf-data';
    mf62Table.style.display = 'table';
  } else if (referer.includes('ftire.html')) {
    fetchEndpoint = '/api/get-ftire-data';
    ftireTable.style.display = 'table';
  } else if (referer.includes('cdtire.html')) {
    fetchEndpoint = '/api/get-cdtire-data';
    cdtireTable.style.display = 'table';
  } else if (referer.includes('custom.html')) {
    fetchEndpoint = '/api/get-custom-data';
    customTable.style.display = 'table';
  } else {
    document.getElementById('data-container').innerHTML =
      '<p class="error-message">Please select a protocol first</p>';
    return;
  }

  // Set protocol title based on referer
  const protocolTitle = document.getElementById('protocol-title');
  if (referer.includes('mf52.html')) {
    protocolTitle.textContent = 'MF 5.2 Protocol';
  } else if (referer.includes('mf.html')) {
    protocolTitle.textContent = 'MF 6.2 Protocol';
  } else if (referer.includes('ftire.html')) {
    protocolTitle.textContent = 'FTire Protocol';
  } else if (referer.includes('cdtire.html')) {
    protocolTitle.textContent = 'CDTire Protocol';
  } else if (referer.includes('custom.html')) {
    protocolTitle.textContent = 'Custom Protocol';
  }

  // Fetch and display data (scratch mode)
  fetch(fetchEndpoint)
    .then(response => response.json())
    .then(data => {
      if (referer.includes('mf52.html')) {
        displayMF52Data(data);
      } else if (referer.includes('mf.html')) {
        displayMF62Data(data);
      } else if (referer.includes('ftire.html')) {
        displayFTireData(data);
      } else if (referer.includes('cdtire.html')) {
        displayCDTireData(data);
      } else if (referer.includes('custom.html')) {
        displayCustomData(data);
      }
      updateStatusIndicators();
      
      //  For scratch mode, show Complete button by default
      showHideButtons('Not Started');
    })
    .catch(error => {
      console.error('Error:', error);
      document.getElementById('data-container').innerHTML =
        '<p class="error-message">Error loading data</p>';
    });
});

/* ---------------- visibility ---------------- */

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    updateStatusIndicators(); // No change needed here
  }
});

/* ---------------- table renderers ---------------- */

function createRunButton(runNumber) {
  return `<button class="row-run-btn" data-run="${runNumber}" style="display: none">Run</button>`;
}

function createTydexButton(runNumber) {
  return `<button class="tydex-btn" data-run="${runNumber}" style="display: none">Generate Tydex</button>`;
}

function displayMF62Data(data) {
  const tableBody = document.getElementById('mf62TableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.ips}</td>
      <td>${row.loads}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.slip_angle}</td>
      <td>${row.slip_ratio}</td>
      <td>${row.test_velocity}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    // Remove ALL existing event listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add ONE click listener with proper flags
    newButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ← ADD THIS LINE
      
      // Double-check button state
      if (this.disabled || this.classList.contains('running')) {
        console.log('Button already clicked, ignoring duplicate');
        return;
      }
      
      // Mark button as running immediately
      this.disabled = true;
      this.classList.add('running');
      this.style.opacity = '0.5';
      this.style.cursor = 'not-allowed';
      
      const runNumber = this.getAttribute('data-run');
      console.log(`Running analysis for run #${runNumber}`);
      runSingleAnalysis(runNumber);
    }, { once: true, capture: true }); // ← ADD capture: true
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayMF52Data(data) {
  const tableBody = document.getElementById('mf52TableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.loads}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.slip_angle}</td>
      <td>${row.slip_ratio}</td>
      <td>${row.test_velocity}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    // Remove ALL existing event listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add ONE click listener with proper flags
    newButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ← ADD THIS LINE
      
      // Double-check button state
      if (this.disabled || this.classList.contains('running')) {
        console.log('Button already clicked, ignoring duplicate');
        return;
      }
      
      // Mark button as running immediately
      this.disabled = true;
      this.classList.add('running');
      this.style.opacity = '0.5';
      this.style.cursor = 'not-allowed';
      
      const runNumber = this.getAttribute('data-run');
      console.log(`Running analysis for run #${runNumber}`);
      runSingleAnalysis(runNumber);
    }, { once: true, capture: true }); // ← ADD capture: true
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayFTireData(data) {
  const tableBody = document.getElementById('ftireTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.loads}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.test_velocity}</td>
      <td>${row.longitudinal_slip}</td>
      <td>${row.slip_angle}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.cleat_orientation}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    // Remove ALL existing event listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add ONE click listener with proper flags
    newButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ← ADD THIS LINE
      
      // Double-check button state
      if (this.disabled || this.classList.contains('running')) {
        console.log('Button already clicked, ignoring duplicate');
        return;
      }
      
      // Mark button as running immediately
      this.disabled = true;
      this.classList.add('running');
      this.style.opacity = '0.5';
      this.style.cursor = 'not-allowed';
      
      const runNumber = this.getAttribute('data-run');
      console.log(`Running analysis for run #${runNumber}`);
      runSingleAnalysis(runNumber);
    }, { once: true, capture: true }); // ← ADD capture: true
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayCDTireData(data) {
  const tableBody = document.getElementById('cdtireTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

    const filteredData = data.filter(row => row.test_name && row.test_name.trim() !== '');
  filteredData.forEach(row => {
    const fortranInfo = row.fortran_file ? `Fortran: ${row.fortran_file}` : '';
    const pythonInfo = row.python_script ? `Python: ${row.python_script}` : '';
    const tooltipInfo = [fortranInfo, pythonInfo].filter(Boolean).join(' | ') || 'Standard workflow';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td title="${tooltipInfo}">${row.test_name}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.velocity}</td>
      <td>${row.preload}</td>
      <td>${row.camber}</td>
      <td>${row.slip_angle}</td>
      <td>${row.displacement}</td>
      <td>${row.slip_range}</td>
      <td>${row.cleat}</td>
      <td>${row.road_surface}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    // Remove ALL existing event listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add ONE click listener with proper flags
    newButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ← ADD THIS LINE
      
      // Double-check button state
      if (this.disabled || this.classList.contains('running')) {
        console.log('Button already clicked, ignoring duplicate');
        return;
      }
      
      // Mark button as running immediately
      this.disabled = true;
      this.classList.add('running');
      this.style.opacity = '0.5';
      this.style.cursor = 'not-allowed';
      
      const runNumber = this.getAttribute('data-run');
      console.log(`Running analysis for run #${runNumber}`);
      runSingleAnalysis(runNumber);
    }, { once: true, capture: true }); // ← ADD capture: true
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayCustomData(data) {
  const tableBody = document.getElementById('customTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.loads}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.slip_angle}</td>
      <td>${row.slip_ratio}</td>
      <td>${row.test_velocity}</td>
      <td>${row.cleat_orientation}</td>
      <td>${row.displacement}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    // Remove ALL existing event listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add ONE click listener with proper flags
    newButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ← ADD THIS LINE
      
      // Double-check button state
      if (this.disabled || this.classList.contains('running')) {
        console.log('Button already clicked, ignoring duplicate');
        return;
      }
      
      // Mark button as running immediately
      this.disabled = true;
      this.classList.add('running');
      this.style.opacity = '0.5';
      this.style.cursor = 'not-allowed';
      
      const runNumber = this.getAttribute('data-run');
      console.log(`Running analysis for run #${runNumber}`);
      runSingleAnalysis(runNumber);
    }, { once: true, capture: true }); // ← ADD capture: true
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

/* ---------------- run, tydex, open ---------------- */

async function runSingleAnalysis(runNumber) {
  // CRITICAL: Check if this run is already in progress
  if (runHistory.has(runNumber)) {
    console.log(`Run #${runNumber} already in progress, aborting duplicate request`);
    return; // Exit immediately
  }
  
  // Mark as running FIRST before ANY async operations
  runHistory.add(runNumber);
  
  const button = document.querySelector(`.row-run-btn[data-run="${runNumber}"]`);
  if (!button) {
    console.error(`Button not found for run #${runNumber}`);
    runHistory.delete(runNumber); // Cleanup
    return;
  }
  
  // Disable button immediately
  button.disabled = true;
  button.classList.add('running');
  button.style.opacity = '0.5';
  button.style.cursor = 'not-allowed';
  button.style.pointerEvents = 'none';
  
  console.log(`Starting run #${runNumber}...`);

  try {
    // GET PROJECT NAME FROM GLOBAL VARIABLE (set at page load)
    if (!currentProjectName) {
      // fallback to sessionStorage
      currentProjectName = sessionStorage.getItem('currentProject') || null;
    }
    if (!currentProjectName) {
      throw new Error('Project name not found. Please refresh the page.');
    }

    // GET PROTOCOL FROM GLOBAL VARIABLE or fallback to session / visible table
    if (!currentProtocol) {
      currentProtocol = sessionStorage.getItem('currentProjectProtocol') || getProtocolFromCurrentTable();
      if (currentProtocol) {
        console.warn('Using fallback protocol:', currentProtocol);
      }
    }
    if (!currentProtocol) {
      throw new Error('Protocol not found. Please refresh the page.');
    }

    console.log(`Project: ${currentProjectName}, Protocol: ${currentProtocol}, Run: ${runNumber}`);

    // Update button to show "Running..."
    button.textContent = 'Running...';
    button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

    // Broadcast start via SSE (if implemented)
    broadcastRunStatus(runNumber, 'running', 'Starting job execution...');

    // SEND REQUEST WITH CORRECT PROJECT NAME and AUTH
    const authHeaders = getAuthHeaders();
    const headers = { 'Content-Type': 'application/json', ...authHeaders };
    const response = await fetch('/api/resolve-job-dependencies', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectName: currentProjectName,
        protocol: currentProtocol,
        runNumber: runNumber
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Server error: ${response.status}`);
    }

    if (data.success) {
      // SUCCESS
      console.log(`Run #${runNumber} completed successfully`);
      
      button.textContent = 'Completed ✓';
      button.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
      button.disabled = false;
      button.style.pointerEvents = 'auto';

      // Update status indicator (use plural function that exists)
      if (typeof updateStatusIndicators === 'function') updateStatusIndicators(runNumber);

      // Broadcast completion
      broadcastRunStatus(runNumber, 'completed', 'Job completed successfully');

      // Check if all runs are complete to enable "Mark Complete" button
      checkAllRunsComplete();

    } else {
      throw new Error(data.message || 'Job execution failed');
    }

  } catch (error) {
    console.error(`Error during job execution:`, error);

    // Show error to user
    alert(`Error during job execution:\n${error.message}`);

    // Reset button state
    button.textContent = 'Run';
    button.style.background = '';
    button.disabled = false;
    button.classList.remove('running');
    button.style.pointerEvents = 'auto';

    // Update status indicator
    if (typeof updateStatusIndicators === 'function') updateStatusIndicators(runNumber);

    // Broadcast error
    broadcastRunStatus(runNumber, 'error', error.message);

  } finally {
    //  ALWAYS cleanup running state
    runHistory.delete(runNumber);
  }
}

async function generateTydex(runNumber) {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { 
    window.location.href = '/index.html'; 
    return; 
  }

  const protocolKey = getVisibleProtocolKey();
  const row = document.querySelector(`tr:has(button[data-run="${runNumber}"])`);
  const tydexButton = row.querySelector('.tydex-btn');

  const originalText = tydexButton.textContent;
  const originalBgColor = tydexButton.style.backgroundColor;

  try {
    const rowDataController = new AbortController();
    const rowDataTimeout = setTimeout(() => rowDataController.abort(), 15000);

    const rowDataResponse = await fetch(
      `/api/get-row-data?protocol=${protocolKey}&runNumber=${runNumber}`,
      { signal: rowDataController.signal }
    );
    clearTimeout(rowDataTimeout);

    if (!rowDataResponse.ok) throw new Error('Failed to get row data');

    const rowDataResult = await rowDataResponse.json();
    const rowData = rowDataResult.data;

    if (!rowData.template_tydex || rowData.template_tydex.trim() === '') {
      throw new Error('No template_tydex found for this row');
    }

    tydexButton.disabled = true;
    tydexButton.textContent = 'Generating...';
    tydexButton.style.backgroundColor = '#ffc107';

    const tydexController = new AbortController();
    const tydexTimeout = setTimeout(() => tydexController.abort(), 120000);

    const response = await fetch('/api/generate-tydex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: getProtocolFromCurrentTable(),
        projectName: projectName,
        rowData: rowData
      }),
      signal: tydexController.signal
    });

    clearTimeout(tydexTimeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
  try {
      await fetch('/api/activity-log', {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              activity_type: 'File',
              action: 'Tydex File Generated',
              description: `Generated Tydex file "${rowData.tydex_name}" for run #${runNumber}`,
              status: 'success',
              metadata: {
                  project_name: projectName,
                  protocol: protocolKey,
                  run_number: runNumber,
                  tydex_name: rowData.tydex_name,
                  folder: `${rowData.p}_${rowData.l}`
              },
              project_name: projectName  
          })
      });
  } catch (logError) {
      console.warn('Failed to log activity:', logError);
  }
      tydexButton.textContent = 'Open File';
      tydexButton.style.backgroundColor = '#228496';
      tydexButton.classList.add('open-file');
      tydexButton.disabled = false;
      tydexButton.onclick = function () { openTydexFile(runNumber); };

      console.log(`✓ TYDEX generated successfully for run ${runNumber}`);
    } else {
      throw new Error(result.message || 'Failed to generate TYDEX file');
    }

  } catch (error) {
    console.error('Error generating Tydex:', error);

    tydexButton.disabled = false;
    tydexButton.textContent = originalText;
    tydexButton.style.backgroundColor = originalBgColor;

    let errorMsg = 'Error generating Tydex: ';
    
    if (error.name === 'AbortError') {
      errorMsg += 'Request timeout. The TYDEX generation is taking too long. Please try again or check the server logs.';
    } else if (error.message.includes('template_tydex')) {
      errorMsg += 'Missing template configuration for this test.';
    } else if (error.message.includes('Failed to get row data')) {
      errorMsg += 'Unable to fetch test configuration. Please refresh and try again.';
    } else {
      errorMsg += error.message;
    }

    alert(errorMsg);
  }
}

async function openTydexFile(runNumber) {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { window.location.href = '/index.html'; return; }

  const protocolKey = getVisibleProtocolKey();

  try {
    const rowDataResponse = await fetch(`/api/get-row-data?protocol=${protocolKey}&runNumber=${runNumber}`);
    if (!rowDataResponse.ok) throw new Error('Failed to get row data');
    const rowDataResult = await rowDataResponse.json();
    const { p, l, tydex_name } = rowDataResult.data;

    const response = await fetch('/api/open-tydex-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: getProtocolFromCurrentTable(),
        projectName: projectName,
        p, l,
        tydex_name
      })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Failed to open TYDEX file');

  } catch (error) {
    console.error('Error opening Tydex file:', error);
    alert('Error opening Tydex file: ' + error.message);
  }
}

document.addEventListener('click', function (e) {
  if (e.target && e.target.classList.contains('tydex-btn')) {
    const button = e.target;
    if (button.classList.contains('open-file')) return;
    const row = button.closest('tr');
    const protocol = getProtocolFromCurrentTable();
    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';

    const rowData = extractRowData(row, protocol);
    if (!rowData) { alert('Unable to extract row data'); return; }

    button.disabled = true;
    button.textContent = 'Generating...';

    generateTydexFile(protocol, projectName, rowData)
      .then(result => {
        if (result.success) {
          button.textContent = 'Generated';
          button.style.backgroundColor = '#6c757d';
          alert('TYDEX file generated successfully!');
        } else {
          throw new Error(result.message || 'Failed to generate TYDEX file');
        }
      })
      .catch(error => {
        console.error('Error generating TYDEX:', error);
        button.disabled = false;
        button.textContent = 'Generate Tydex';
        alert('Error generating TYDEX file: ' + error.message);
      });
  }
});

function extractRowData(row, protocol) {
  const cells = row.querySelectorAll('td');
  if (cells.length === 0) return null;

  const data = { protocol, tydex_name: '', p: '', l: '' };

  switch (protocol) {
    case 'MF6pt2':
    case 'MF5pt2':
      data.tydex_name = cells[10]?.textContent.trim() || '';
      data.p = cells[11]?.textContent.trim() || '';
      data.l = cells[12]?.textContent.trim() || '';
      break;
    case 'FTire':
      data.tydex_name = cells[11]?.textContent.trim() || '';
      data.p = cells[12]?.textContent.trim() || '';
      data.l = cells[13]?.textContent.trim() || '';
      break;
    case 'CDTire':
      data.tydex_name = cells[13]?.textContent.trim() || '';
      data.p = cells[14]?.textContent.trim() || '';
      data.l = cells[15]?.textContent.trim() || '';
      break;
    case 'Custom':
      data.tydex_name = cells[12]?.textContent.trim() || '';
      data.p = cells[13]?.textContent.trim() || '';
      data.l = cells[14]?.textContent.trim() || '';
      break;
  }
  return data;
}

function generateTydexFile(protocol, projectName, rowData) {
  return fetch('/api/generate-tydex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocol, projectName, rowData })
  }).then(r => r.json());
}

/* ---------------- Complete / In-Progress Button Handlers ---------------- */

document.getElementById('completeProjectBtn').addEventListener('click', async function () {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { alert('No project selected'); return; }

  if (!confirm('Archive current test matrix and mark this project Completed?')) return;

  try {
    const projectId = await findProjectId();
    if (!projectId) {
      alert('Missing project id – open this page via History or save the project first.');
      return;
    }

    const response = await fetch(`/api/mark-project-complete`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName })
    });
    
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    alert('Project marked as Completed!');


// Log project completion
try {
    await fetch('/api/activity-log', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            activity_type: 'Project',
            action: 'Project Completed',
            description: `Project "${projectName}" marked as completed`,
            status: 'success',
            metadata: {
                project_id: projectId,
                project_name: projectName
            }
        })
    });
} catch (logError) {
    console.warn('Failed to log activity:', logError);
}

    window.location.href = '/history.html';
  } catch (err) {
    console.error('Complete error:', err);
    alert(`Failed to complete project: ${err.message}`);
  }
});

// HANDLER FOR "MARK AS IN PROGRESS" BUTTON
// In select.js, find this section:
document.getElementById('markInProgressBtn').addEventListener('click', async function () {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { alert('No project selected'); return; }

  if (!confirm('Mark this project as In Progress?')) return;

  try {
    // Ensure we have the project id (server may require id rather than name)
    const projectId = await findProjectId();
    if (!projectId) {
      alert('Missing project id – open this page via History or save the project first.');
      return;
    }

    const res = await fetch('/api/mark-project-in-progress', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({ projectId, projectName })
    });

    // Try parse JSON, but surface text if response is not JSON
    let json;
    try {
      json = await res.json();
    } catch (_) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);

    sessionStorage.setItem('currentProjectStatus', 'In Progress');

    alert('Project marked as In Progress!');
    window.location.href = '/history.html';
  } catch (err) {
    console.error(err);
    alert('Failed to mark project as In Progress: ' + (err.message || err));
  }
});

/* ---------------- Archived Toolbar ---------------- */
function initArchivedToolbar({ projectId, projectName, protocol, rows }) {
  injectArchivedStyles();

  let bar = document.getElementById('archivedToolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'archivedToolbar';
    bar.className = 'archived-toolbar';

    const header = document.querySelector('.main-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(bar, header.nextSibling);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  bar.innerHTML = `
    <div class="archived-toolbar-inner">
      <button id="backToHistoryBtn" class="btn-secondary">← Back to History</button>
      <div class="archived-spacer"></div>
      <button id="exportCsvBtn" class="btn-secondary">Export CSV</button>
      <button id="showInputsBtn" class="btn-secondary">View Inputs</button>
    </div>
  `;

  document.getElementById('backToHistoryBtn').onclick = () => {
    window.location.href = '/history.html';
  };

  document.getElementById('exportCsvBtn').onclick = () => {
    exportRowsToCSV(rows, protocol, projectName);
  };

  //  VERIFY THIS LINE PASSES projectId CORRECTLY
  document.getElementById('showInputsBtn').onclick = () => {
    console.log('View Inputs clicked - Project ID:', projectId); // Debug log
    showInputsModal(projectId);
  };
}

function injectArchivedStyles() {
  if (document.getElementById('archivedToolbarStyles')) return;
  const s = document.createElement('style');
  s.id = 'archivedToolbarStyles';
  s.textContent = `
    .archived-toolbar {
      background: linear-gradient(180deg, #fbf6fc 0%, #fff8f2 40%, #f9f4ef 100%);
      border-bottom: 1px solid rgba(88,44,124,0.06);
      box-shadow: 0 6px 18px rgba(88,44,124,0.03);
    }
    .archived-toolbar-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px 18px;
      display:flex;
      align-items:center;
      gap:12px;
    }
    .archived-spacer { flex: 1; }

    .btn-secondary {
      appearance: none;
      border: 1px solid rgba(88,44,124,0.08);
      background: linear-gradient(180deg,#ffffff 0%,#fbf8fd 100%);
      color: #2d2140;
      padding: 9px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: 0.2px;
      transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
      box-shadow: 0 4px 10px rgba(30,30,30,0.04);
    }

    #backToHistoryBtn, #backToHistoryBtn.btn-secondary {
      border: 1px solid rgba(88,44,124,0.16);
      background: linear-gradient(135deg,#6b3a9b 0%, #582C7C 55%, #4a2264 100%);
      color: #fff;
      box-shadow: 0 8px 20px rgba(88,44,124,0.12);
    }
    #backToHistoryBtn:hover {
      background: linear-gradient(135deg,#7a49ad 0%, #65358e 55%, #5a2e7a 100%);
      transform: translateY(-2px);
    }

    #exportCsvBtn, #exportCsvBtn.btn-secondary {
      border: 1px solid rgba(217,111,58,0.18);
      background: linear-gradient(135deg,#f6a25d 0%, #e07a3c 55%, #d96f3a 100%);
      color: #23120a;
      box-shadow: 0 8px 20px rgba(217,111,58,0.10);
    }
    #exportCsvBtn:hover {
      background: linear-gradient(135deg,#ffb46f 0%, #f08a4a 55%, #e27631 100%);
      transform: translateY(-2px);
    }

    #showInputsBtn, #showInputsBtn.btn-secondary {
      border: 1px solid rgba(34,132,150,0.12);
      background: linear-gradient(135deg,#26a5a5 0%, #228496 60%, #1b6b75 100%);
      color: #fff;
      box-shadow: 0 8px 20px rgba(34,132,150,0.08);
    }
    #showInputsBtn:hover {
      background: linear-gradient(135deg,#34b4b4 0%, #2b9aa0 60%, #1f7580 100%);
      transform: translateY(-2px);
    }

    .btn-secondary:focus, #backToHistoryBtn:focus, #exportCsvBtn:focus, #showInputsBtn:focus {
      outline: none;
      box-shadow: 0 0 0 4px rgba(88,44,124,0.07);
    }

    .inputs-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:9999;
    }
    .inputs-modal {
      background:#fff;
      width:min(880px, 94vw);
      max-height: 84vh;
      border-radius:14px;
      overflow:hidden;
      box-shadow:0 18px 50px rgba(30,30,30,0.18);
      display:flex;
      flex-direction:column;
      border: 1px solid rgba(88,44,124,0.04);
    }
    .inputs-modal header {
      padding:14px 18px;
      border-bottom:1px solid rgba(88,44,124,0.06);
      display:flex;
      justify-content:space-between;
      align-items:center;
      background: linear-gradient(90deg, rgba(88,44,124,0.03), rgba(217,111,58,0.02));
    }
    .inputs-modal .body { padding:14px 18px; overflow:auto; background: linear-gradient(180deg,#fff,#fbfbfc); }
    .inputs-modal pre { margin:0; white-space:pre-wrap; word-break:break-word; font-size: 13px; color:#222; }

    @media (max-width:720px) {
      .archived-toolbar-inner { padding:10px; gap:8px; }
      .btn-secondary { padding:8px 10px; font-size:0.95rem; border-radius:8px; }
    }
  `;
  document.head.appendChild(s);
}

function exportRowsToCSV(rows, protocol, projectName) {
  if (!rows || !rows.length) { alert('No rows to export.'); return; }

  const order = {
    MF62: ['number_of_runs','tests','ips','loads','inclination_angle','slip_angle','slip_ratio','test_velocity','job','old_job','template_tydex','tydex_name','p','l'],
    MF52: ['number_of_runs','tests','inflation_pressure','loads','inclination_angle','slip_angle','slip_ratio','test_velocity','job','old_job','template_tydex','tydex_name','p','l'],
    FTire:['number_of_runs','tests','loads','inflation_pressure','test_velocity','longitudinal_slip','slip_angle','inclination_angle','cleat_orientation','job','old_job','template_tydex','tydex_name','p','l'],
    CDTire:['number_of_runs','test_name','inflation_pressure','velocity','preload','camber','slip_angle','displacement','slip_range','cleat','road_surface','job','old_job','template_tydex','tydex_name','p','l'],
    Custom:['number_of_runs','tests','inflation_pressure','loads','inclination_angle','slip_angle','slip_ratio','test_velocity','cleat_orientation','displacement','job','old_job','template_tydex','tydex_name','p','l']
  }[protocol] || Object.keys(rows[0] || {});

  const quoted = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g,'""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };

  const header = order;
  const data = rows.map(r => order.map(k => quoted(r[k])));

  const csv = [header.map(quoted).join(','), ...data.map(line => line.join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (projectName || 'project').replace(/[^\w\-]+/g,'_');
  a.download = `${safeName}_${protocol}_archive.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const INPUT_LABELS = {
  l1: 'Load 1 (kg)', l2: 'Load 2 (kg)', l3: 'Load 3 (kg)', l4: 'Load 4 (kg)', l5: 'Load 5 (kg)',
  load1_kg: 'Load 1 (kg)', load2_kg: 'Load 2 (kg)', load3_kg: 'Load 3 (kg)', load4_kg: 'Load 4 (kg)', load5_kg: 'Load 5 (kg)',
  p1: 'Pressure 1 (PSI)', p2: 'Pressure 2 (PSI)', p3: 'Pressure 3 (PSI)',
  pressure1: 'Pressure 1 (PSI)', pressure2: 'Pressure 2 (PSI)', pressure3: 'Pressure 3 (PSI)',
  ia: 'Inclination Angle (deg)', IA: 'Inclination Angle (deg)',
  sa: 'Slip Angle (deg)', SA: 'Slip Angle (deg)',
  sr: 'Slip Ratio (%)', SR: 'Slip Ratio (%)',
  vel: 'Test Velocity (km/h)', speed_kmph: 'Test Velocity (km/h)',
  rimWidth: 'Rim Width (mm)', width: 'Rim Width (mm)',
  rimDiameter: 'Rim Diameter (in)', diameter: 'Rim Diameter (mm)',
  nominalWidth: 'Nominal Width (mm)', nomwidth: 'Nominal Width (mm)',
  outerDiameter: 'Outer Diameter (mm)', Outer_diameter: 'Outer Diameter (mm)',
  aspectRatio: 'Aspect Ratio (%)', aspratio: 'Aspect Ratio (%)'
};

const INPUT_ORDER = [
  'l1','l2','l3','l4','l5',
  'p1','p2','p3',
  'vel','ia','sa','sr',
  'rimWidth','rimDiameter','nominalWidth','outerDiameter',
  'width','diameter','nomwidth','Outer_diameter',
  'aspectRatio','aspratio',
  'load1_kg','load2_kg','load3_kg','load4_kg','load5_kg',
  'pressure1','pressure2','pressure3','speed_kmph','IA','SA','SR'
];

// FUNCTION HERE (after INPUT_ORDER, before orderIndex)
/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - HTML-safe text
 */
function escapeHtml(text) {
  if (text == null) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}


function orderIndex(k) {
  const i = INPUT_ORDER.indexOf(k);
  return i === -1 ? 9999 : i;
}

function renderInputsModal(inputs, protocol) {
  const entries = Object.entries(inputs || {});
  entries.sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]));

  const rowsHtml = entries.map(([key, value]) => {
    const label = INPUT_LABELS[key] || key;
    const val = (value == null) ? '' : String(value);
    return `
      <div class="inputs-row">
        <div class="inputs-label">${escapeHtml(label)}</div>
        <div class="inputs-value">${escapeHtml(val)}</div>
      </div>
    `;
  }).join('') || `<div class="inputs-empty">No inputs saved for this project.</div>`;

  const modal = document.createElement('div');
  modal.className = 'inputs-modal-backdrop';
  modal.innerHTML = `
    <div class="inputs-modal">
      <div class="inputs-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;background:linear-gradient(90deg, rgba(88,44,124,0.03), rgba(217,111,58,0.02));">
        <div style="font-weight:700">Saved Inputs ${protocol ? `· <span class="inputs-proto">${escapeHtml(protocol)}</span>` : ''}</div>
        <div style="display:flex;gap:8px">
          <button class="inputs-copy btn-secondary" title="Copy JSON">Copy</button>
          <button class="inputs-close btn-secondary" title="Close">Close</button>
        </div>
      </div>
      <div class="inputs-grid" style="padding:14px 16px;max-height:70vh;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${rowsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.inputs-close');
  const copyBtn = modal.querySelector('.inputs-copy');

  closeBtn.onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(inputs, null, 2));
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 900);
    } catch {
      alert('Copy failed.');
    }
  };
}

async function showInputsModal(arg) {
  if (!arg) return;

  if (typeof arg === 'string' || typeof arg === 'number') {
    try {
      //  ADD AUTHORIZATION HEADER
      const r = await fetch(`/api/projects/${encodeURIComponent(arg)}`, {
        headers: getAuthHeaders() //  THIS LINE WAS MISSING
      });
      
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      
      const j = await r.json();
      if (!j.success || !j.project) throw new Error('Project not found');
      
      let inputs = j.project.inputs || {};
      if (typeof inputs === 'string') {
        try { inputs = JSON.parse(inputs); } catch (_) { }
      }
      renderInputsModal(inputs, j.project.protocol || '');
    } catch (e) {
      console.error('Failed to load inputs:', e);
      alert('Failed to load inputs: ' + (e.message || e));
    }
    return;
  }

  let inputs = arg.inputs || arg.project?.inputs || arg;
  let protocol = arg.protocol || arg.project?.protocol || '';
  if (typeof inputs === 'string') {
    try { inputs = JSON.parse(inputs); } catch (_) { }
  }
  renderInputsModal(inputs || {}, protocol || '');
}


/* ---------------- TYDEX SIDEBAR ---------------- */

let currentTydexContent = '';
let currentTydexFilename = '';

async function loadTydexList(projectId) {
  const listEl = document.getElementById('tydex-list');
  if (!listEl) return;
  
  listEl.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    const res = await fetch(`/api/tydex/${projectId}`);
    const files = await res.json();
    
    if (!Array.isArray(files) || files.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No previously generated Tydex files found.</div>';
      return;
    }
    
    listEl.innerHTML = '';
    
    files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'tydex-item';
      item.innerHTML = `
        <div class="tydex-item-info">
          <div class="tydex-filename">${escapeHtml(f.filename)}</div>
          <small class="tydex-meta">${escapeHtml(f.protocol)} • ${formatDate(f.created_at)}</small>
        </div>
        <button class="btn btn-sm tydex-open-btn" data-id="${f.id}" data-filename="${escapeHtml(f.filename)}">
          Open
        </button>
      `;
      
      item.querySelector('.tydex-open-btn').addEventListener('click', () => {
        previewTydex(projectId, f.id, f.filename);
      });
      
      listEl.appendChild(item);
    });
    
  } catch (e) {
    console.error('Error loading Tydex files:', e);
    listEl.innerHTML = '<div class="error-state">Failed to load Tydex files.</div>';
  }
}

async function previewTydex(projectId, fileId, filename) {
  const titleEl = document.getElementById('tydex-preview-title');
  const boxEl = document.getElementById('tydex-preview-box');
  const copyBtn = document.getElementById('copy-tydex-btn');
  const downloadBtn = document.getElementById('download-tydex-btn');
  
  if (!titleEl || !boxEl) return;
  
  titleEl.textContent = `Preview — ${filename}`;
  boxEl.value = 'Loading...';
  
  if (copyBtn) copyBtn.style.display = 'none';
  if (downloadBtn) downloadBtn.style.display = 'none';
  
  try {
    const res = await fetch(`/api/tydex/${projectId}/${fileId}`);
    const data = await res.json();
    
    if (data && data.content) {
      boxEl.value = data.content;
      currentTydexContent = data.content;
      currentTydexFilename = filename;
      
      if (copyBtn) copyBtn.style.display = 'inline-block';
      if (downloadBtn) downloadBtn.style.display = 'inline-block';
    } else {
      boxEl.value = 'No content available.';
    }
    
  } catch (e) {
    console.error('Error loading Tydex content:', e);
    boxEl.value = 'Failed to load content.';
  }
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString();
}

document.getElementById('copy-tydex-btn')?.addEventListener('click', async () => {
  if (!currentTydexContent) return;
  
  try {
    await navigator.clipboard.writeText(currentTydexContent);
    const btn = document.getElementById('copy-tydex-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.backgroundColor = '#28a745';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.backgroundColor = '';
    }, 2000);
  } catch (e) {
    alert('Failed to copy to clipboard');
  }
});

document.getElementById('download-tydex-btn')?.addEventListener('click', () => {
  if (!currentTydexContent || !currentTydexFilename) return;
  
  const blob = new Blob([currentTydexContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentTydexFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('refresh-tydex-btn')?.addEventListener('click', () => {
  const projectId = getProjectIdFromUrl();
  if (projectId) loadTydexList(projectId);
});

// Load Tydex files on page load
setTimeout(() => {
  const projectId = getProjectIdFromUrl();
  if (projectId) {
    loadTydexList(projectId);
    console.log(`Loading Tydex files for project ID: ${projectId}`);
  }
}, 500);

/* ============================================
   MISSING FUNCTIONS - ADD AT END OF FILE
   ============================================ */

/**
 * Setup all event listeners (called on page load)
 */
function setupEventListeners() {
  console.log('✅ Setting up event listeners...');
  
  // Refresh button
  const refreshBtn = document.getElementById('refreshBtnSelect');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshPageSelect);
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  console.log('✅ Event listeners setup complete');
}

/**
 * Broadcast run status via Server-Sent Events (SSE)
 * This is a stub - implement if you have SSE setup
 */
function broadcastRunStatus(runNumber, status, message) {
  console.log(`📡 Broadcast: Run #${runNumber} - ${status} - ${message}`);
  // If you have SSE implemented on server, send event here
  // For now, just log to console
}

/**
 * Check if all runs are complete to enable "Mark Complete" button
 */
function checkAllRunsComplete() {
  const allRows = document.querySelectorAll('tbody tr');
  let completedCount = 0;
  let totalCount = 0;
  
  allRows.forEach(row => {
    const statusCell = row.querySelector('.status-indicator');
    if (statusCell) {
      totalCount++;
      if (statusCell.textContent.includes('Completed ✓')) {
        completedCount++;
      }
    }
  });
  
  console.log(`📊 Progress: ${completedCount}/${totalCount} runs completed`);
  
  // Enable "Mark Complete" button if all tests are done
  const completeBtn = document.getElementById('completeProjectBtn');
  if (completeBtn && completedCount === totalCount && totalCount > 0) {
    completeBtn.disabled = false;
    completeBtn.style.opacity = '1';
    console.log('✅ All tests complete - "Mark Complete" button enabled');
  }
}

/**
 * Load test matrix data for current protocol
 * This function fetches and displays the test matrix
 */
async function loadTestMatrix() {
  console.log('📋 Loading test matrix...');
  
  const referer = document.referrer || '';
  const projectId = getProjectIdFromUrl();
  
  let fetchEndpoint = null;
  let displayFunction = null;
  let tableElement = null;
  
  // Determine which protocol is active
  if (referer.includes('mf52.html') || currentProtocol === 'MF52') {
    fetchEndpoint = '/api/get-mf52-data';
    displayFunction = displayMF52Data;
    tableElement = document.getElementById('mf52Table');
  } else if (referer.includes('mf.html') || currentProtocol === 'MF62') {
    fetchEndpoint = '/api/get-mf-data';
    displayFunction = displayMF62Data;
    tableElement = document.getElementById('mf62Table');
  } else if (referer.includes('ftire.html') || currentProtocol === 'FTire') {
    fetchEndpoint = '/api/get-ftire-data';
    displayFunction = displayFTireData;
    tableElement = document.getElementById('ftireTable');
  } else if (referer.includes('cdtire.html') || currentProtocol === 'CDTire') {
    fetchEndpoint = '/api/get-cdtire-data';
    displayFunction = displayCDTireData;
    tableElement = document.getElementById('cdtireTable');
  } else if (referer.includes('custom.html') || currentProtocol === 'Custom') {
    fetchEndpoint = '/api/get-custom-data';
    displayFunction = displayCustomData;
    tableElement = document.getElementById('customTable');
  }
  
  if (!fetchEndpoint || !displayFunction || !tableElement) {
    console.warn('⚠️ Could not determine protocol for test matrix');
    return;
  }
  
  try {
    // Show the correct table
    tableElement.style.display = 'table';
    
    // Fetch data
    const response = await fetch(fetchEndpoint);
    const data = await response.json();
    
    // Display data
    displayFunction(data);
    
    // Update status indicators
    await updateStatusIndicators();
    
    console.log(`✅ Test matrix loaded: ${data.length} rows`);
    
  } catch (error) {
    console.error('❌ Error loading test matrix:', error);
  }
}

/**
 * Handle batch file execution button click
 */
/**
 * Handle batch file execution button click
 * ✅ FIXED: Runs server-side with logging, no CMD window
 */
document.getElementById('runBatchFileBtn')?.addEventListener('click', async function() {
    const projectName = sessionStorage.getItem('currentProject');
    const protocol = getProtocolFromCurrentTable();
    
    if (!projectName || !protocol) {
        alert('Error: Project information not found');
        return;
    }
    
    // ✅ Better confirmation message
    const confirmed = confirm(
        `Run all ${protocol} tests automatically?\n\n` +
        `✓ Execution will run in the background (no CMD window)\n` +
        `✓ Progress will be logged to project logs folder\n` +
        `✓ You can view logs using the "View Logs" button\n\n` +
        `This may take several minutes to hours depending on test count.\n\n` +
        `Continue?`
    );
    
    if (!confirmed) return;
    
    try {
        // ✅ Show loading indicator
        this.disabled = true;
        this.textContent = 'Starting batch execution...';
        this.style.opacity = '0.6';
        
        const response = await fetch('/api/run-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName, protocol })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(
                `Batch execution started!\n\n` +
                `✓ Running in background (server-side)\n` +
                `✓ Logs are being written to: projects/${projectName}_${protocol}/logs/\n\n` +
                `Click "View Logs" button to monitor progress.`
            );
            
            // ✅ Log activity
            try {
                await fetch('/api/activity-log', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        activity_type: 'Execution',
                        action: 'Batch File Started',
                        description: `Started batch execution for ${projectName} (${protocol})`,
                        status: 'info',
                        metadata: { projectName, protocol }
                    })
                });
            } catch (logError) {
                console.warn('Failed to log activity:', logError);
            }
            
        } else {
            throw new Error(data.message || 'Failed to start batch execution');
        }
        
    } catch (error) {
        console.error('Error running batch file:', error);
        alert(`Error: ${error.message}\n\nPlease check console for details.`);
    } finally {
        // ✅ Reset button
        this.disabled = false;
        this.textContent = 'Run Batch File';
        this.style.opacity = '1';
    }
});

/**
 * Helper function to determine protocol from visible table
 */
function getProtocolFromCurrentTable() {
    const tables = {
        'mf62Table': 'MF62',
        'mf52Table': 'MF52',
        'ftireTable': 'FTire',
        'cdtireTable': 'CDTire',
        'customTable': 'Custom'
    };
    
    for (const [tableId, protocol] of Object.entries(tables)) {
        const table = document.getElementById(tableId);
        if (table && table.style.display !== 'none') {
            return protocol;
        }
    }
    
    return null;
}

/**
 * Handle View Batch File button click
 * ✅ FIXED: Better error messages for missing batch files
 */
document.getElementById('viewBatchFileBtn')?.addEventListener('click', async function() {
    const projectName = sessionStorage.getItem('currentProject');
    const protocol = getProtocolFromCurrentTable();
    
    if (!projectName || !protocol) {
        alert('Error: Project information not found');
        return;
    }
    
    try {
        // Show modal
        const modal = document.getElementById('batchFileModal');
        const contentEl = document.getElementById('batchFileContent');
        const filenameEl = document.getElementById('batchFileName');
        
        modal.style.display = 'flex';
        contentEl.textContent = 'Loading...';
        contentEl.className = 'loading';
        
        // Fetch batch file content
        let response = await fetch(`/api/view-batch-file?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocol)}`);
        let data = await response.json();
        
        // ✅ If batch file doesn't exist, try to generate it
        if (!data.success && data.message && data.message.includes('not found')) {
            contentEl.textContent = 'Batch file not found. Generating...';
            
            const generated = await ensureBatchFileExists(projectName, protocol);
            
            if (generated) {
                // Retry fetching after generation
                response = await fetch(`/api/view-batch-file?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocol)}`);
                data = await response.json();
            }
        }
        
        if (data.success) {
            // Display content with syntax highlighting
            contentEl.className = '';
            contentEl.innerHTML = highlightBatchSyntax(data.content);
            filenameEl.textContent = data.filename;
        } else {
            throw new Error(data.message || 'Failed to load batch file');
        }
        
    } catch (error) {
        console.error('Error viewing batch file:', error);
        const contentEl = document.getElementById('batchFileContent');
        const modal = document.getElementById('batchFileModal');
        
        // Generic error message
        contentEl.className = 'error';
        contentEl.textContent = `Error: ${error.message}`;
        
        // Keep modal open to show the message
        modal.style.display = 'flex';
    }
});

/**
 * Attempt to generate batch file if missing
 * Called when user clicks "View Batch" but file doesn't exist
 */
async function ensureBatchFileExists(projectName, protocol) {
    try {
        console.log(`🔨 Attempting to generate batch file for ${projectName}_${protocol}...`);
        
        const response = await fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName, protocol })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Batch file generated: ${data.testCount || 'unknown'} tests`);
            return true;
        } else {
            console.warn(`⚠️ Batch file generation failed: ${data.message || 'no message'}`);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error generating batch file:', error);
        return false;
    }
}

/**
 * Handle View Logs button click
 */
document.getElementById('viewLogsBtn')?.addEventListener('click', async function() {
    const projectName = sessionStorage.getItem('currentProject');
    const protocol = getProtocolFromCurrentTable();
    
    if (!projectName || !protocol) {
        alert('Error: Project information not found');
        return;
    }
    
    await loadProjectLogs(projectName, protocol);
});

/**
 * Load project logs
 */
async function loadProjectLogs(projectName, protocol) {
    try {
        // Show modal
        const modal = document.getElementById('logsModal');
        const contentEl = document.getElementById('logsContent');
        const filenameEl = document.getElementById('logFileName');
        
        modal.style.display = 'flex';
        contentEl.textContent = 'Loading...';
        contentEl.className = 'loading';
        
        // Fetch log file content
        const response = await fetch(`/api/view-logs?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocol)}`);
        const data = await response.json();
        
        if (data.success) {
            // Display content
            contentEl.className = '';
            contentEl.textContent = data.content;
            filenameEl.textContent = data.filename;
        } else {
            //  CHECK IF IT'S A "NO LOGS" ERROR
            throw new Error(data.message || 'Failed to load logs');
        }
        
    } catch (error) {
        console.error('Error viewing logs:', error);
        const contentEl = document.getElementById('logsContent');
        const modal = document.getElementById('logsModal');
        
        //  IMPROVED: Show user-friendly message for missing logs
        if (error.message && (error.message.includes('No log') || error.message.includes('not found'))) {
            contentEl.className = 'error';
            contentEl.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style="opacity: 0.3; margin-bottom: 20px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#999" stroke-width="2" fill="none"/>
                        <polyline points="14 2 14 8 20 8" stroke="#999" stroke-width="2" fill="none"/>
                        <line x1="16" y1="13" x2="8" y2="13" stroke="#999" stroke-width="2"/>
                        <line x1="16" y1="17" x2="8" y2="17" stroke="#999" stroke-width="2"/>
                    </svg>
                    <h3 style="margin: 0 0 10px 0; color: #666;">No Logs Available Yet</h3>
                    <p style="margin: 0 0 20px 0; color: #888; line-height: 1.6;">
                        Log files will be created when you run test cases.<br>
                        They contain detailed execution information for debugging.
                    </p>
                    <p style="margin: 0; color: #aaa; font-size: 14px;">
                        <strong>To generate logs:</strong><br>
                        1. Click the "Run" button on any test case<br>
                        2. Or use "Run All" to execute all tests<br>
                        3. Logs will be saved in: <code>projects/${projectName}_${protocol}/logs/</code>
                    </p>
                </div>
            `;
        } else {
            // Generic error message
            contentEl.className = 'error';
            contentEl.textContent = `Error: ${error.message}`;
        }
        
        // Keep modal open to show the message
        modal.style.display = 'flex';
    }
}

/**
 * Highlight batch file syntax
 */
function highlightBatchSyntax(content) {
    return content
        .split('\n')
        .map(line => {
            // Highlight comments
            if (line.trim().startsWith('REM') || line.trim().startsWith('::')) {
                return `<span class="comment">${escapeHtml(line)}</span>`;
            }
            // Highlight commands
            if (line.includes('call abaqus')) {
                const parts = line.split(/(\s+)/);
                return parts.map(part => {
                    if (part.includes('call') || part.includes('abaqus')) {
                        return `<span class="command">${escapeHtml(part)}</span>`;
                    } else if (part.includes('job=') || part.includes('input=')) {
                        return `<span class="path">${escapeHtml(part)}</span>`;
                    }
                    return escapeHtml(part);
                }).join('');
            }
            // Highlight cd commands
            if (line.includes('cd /d')) {
                return line.replace(/(cd \/d\s+)(".*")/, '<span class="command">$1</span><span class="path">$2</span>');
            }
            return escapeHtml(line);
        })
        .join('\n');
}

/**
 * Copy batch file content to clipboard
 */
document.getElementById('copyBatchBtn')?.addEventListener('click', async function() {
    const content = document.getElementById('batchFileContent').textContent;
    
    try {
        await navigator.clipboard.writeText(content);
        
        // Visual feedback
        const originalHTML = this.innerHTML;
        this.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2"/></svg>';
        this.style.background = 'rgba(16, 185, 129, 0.2)';
        
        setTimeout(() => {
            this.innerHTML = originalHTML;
            this.style.background = '';
        }, 2000);
        
    } catch (error) {
        alert('Failed to copy to clipboard');
    }
});

/**
 * Copy logs content to clipboard
 */
document.getElementById('copyLogsBtn')?.addEventListener('click', async function() {
    const content = document.getElementById('logsContent').textContent;
    
    try {
        await navigator.clipboard.writeText(content);
        
        // Visual feedback
        const originalHTML = this.innerHTML;
        this.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2"/></svg>';
        this.style.background = 'rgba(16, 185, 129, 0.2)';
        
        setTimeout(() => {
            this.innerHTML = originalHTML;
            this.style.background = '';
        }, 2000);
        
    } catch (error) {
        alert('Failed to copy to clipboard');
    }
});

/**
 * Refresh logs
 */
document.getElementById('refreshLogsBtn')?.addEventListener('click', async function() {
    const projectName = sessionStorage.getItem('currentProject');
    const protocol = getProtocolFromCurrentTable();
    
    if (!projectName || !protocol) return;
    
    // Rotate icon animation
    this.style.transform = 'rotate(360deg)';
    this.style.transition = 'transform 0.5s ease';
    
    await loadProjectLogs(projectName, protocol);
    
    setTimeout(() => {
        this.style.transform = 'rotate(0deg)';
    }, 500);
});

/**
 * Close batch file modal
 */
document.getElementById('closeBatchModal')?.addEventListener('click', function() {
    document.getElementById('batchFileModal').style.display = 'none';
});

/**
 * Close logs modal
 */
document.getElementById('closeLogsModal')?.addEventListener('click', function() {
    document.getElementById('logsModal').style.display = 'none';
});

/**
 * Close modals when clicking outside
 */
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('file-viewer-modal')) {
        event.target.style.display = 'none';
    }
});

/**
 * Close modals with Escape key
 */
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        document.getElementById('batchFileModal').style.display = 'none';
        document.getElementById('logsModal').style.display = 'none';
    }
});