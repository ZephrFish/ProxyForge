// Popup script for ProxyForge extension

// DOM elements
const toggleBtn = document.getElementById('toggleBtn');
const rotateBtn = document.getElementById('rotateBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const currentProxyInfo = document.getElementById('currentProxyInfo');
const totalRequests = document.getElementById('totalRequests');
const rotations = document.getElementById('rotations');
const uptime = document.getElementById('uptime');
const avgRotation = document.getElementById('avgRotation');
const rotationMode = document.getElementById('rotationMode');
const rotationFrequency = document.getElementById('rotationFrequency');
const configureProxiesBtn = document.getElementById('configureProxiesBtn');
const configureGatewaysBtn = document.getElementById('configureGatewaysBtn');

// Auto-rotation elements
const autoRotateToggle = document.getElementById('autoRotateToggle');
const autoRotateConfig = document.getElementById('autoRotateConfig');
const currentDomain = document.getElementById('currentDomain');
const addCurrentDomainBtn = document.getElementById('addCurrentDomainBtn');
const whitelistDomains = document.getElementById('whitelistDomains');
const newWhitelistDomain = document.getElementById('newWhitelistDomain');
const addWhitelistBtn = document.getElementById('addWhitelistBtn');

// Local proxy elements
const localProxyIndicator = document.getElementById('localProxyIndicator');
const localProxyStatus = document.getElementById('localProxyStatus');
const awsGatewayInfo = document.getElementById('awsGatewayInfo');
const activeGatewayCount = document.getElementById('activeGatewayCount');
const currentRegion = document.getElementById('currentRegion');
const createGatewayBtn = document.getElementById('createGatewayBtn');
const viewGatewaysBtn = document.getElementById('viewGatewaysBtn');

// Modals
const proxyModal = document.getElementById('proxyModal');
const gatewayModal = document.getElementById('gatewayModal');
const proxyList = document.getElementById('proxyList');
const addProxyBtn = document.getElementById('addProxyBtn');
const saveProxiesBtn = document.getElementById('saveProxiesBtn');
const cancelProxiesBtn = document.getElementById('cancelProxiesBtn');

// API Gateway elements
const newGatewayUrl = document.getElementById('newGatewayUrl');
const gatewayType = document.getElementById('gatewayType');
const gatewayAuth = document.getElementById('gatewayAuth');
const authConfig = document.getElementById('authConfig');
const authValue = document.getElementById('authValue');
const createGatewayBtn = document.getElementById('createGatewayBtn');
const autoDetectBtn = document.getElementById('autoDetectBtn');
const activeGatewaysList = document.getElementById('activeGatewaysList');
const testGatewayBtn = document.getElementById('testGatewayBtn');
const exportConfigBtn = document.getElementById('exportConfigBtn');
const importConfigBtn = document.getElementById('importConfigBtn');
const closeGatewayBtn = document.getElementById('closeGatewayBtn');

let currentStatus = null;
let tempProxies = [];

// Initialize popup
async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
  updateUI(response);
  currentStatus = response;
  
  // Load current settings
  rotationMode.value = response.rotationMode || 'sequential';
  
  // Check local proxy connection
  checkLocalProxy();
  
  // Load auto-rotation status
  loadAutoRotateStatus();
  
  // Load current tab domain
  loadCurrentDomain();
  
  // Start periodic updates
  setInterval(updateStats, 1000);
  setInterval(checkLocalProxy, 5000); // Check connection every 5 seconds
}

// Update UI based on status
function updateUI(status) {
  if (status.isEnabled) {
    toggleBtn.textContent = 'Disable Proxy';
    toggleBtn.classList.add('active');
    statusDot.classList.add('active');
    statusText.textContent = 'Active';
    rotateBtn.disabled = false;
  } else {
    toggleBtn.textContent = 'Enable Proxy';
    toggleBtn.classList.remove('active');
    statusDot.classList.remove('active');
    statusText.textContent = 'Inactive';
    rotateBtn.disabled = true;
  }
  
  updateProxyInfo(status.currentProxy);
  updateStatistics(status.stats);
}

// Update proxy information display
function updateProxyInfo(proxy) {
  if (!proxy) {
    currentProxyInfo.innerHTML = '<p class="no-proxy">No proxy active</p>';
    return;
  }
  
  let html = '';
  if (proxy.gateway) {
    html = `
      <p><strong>Type:</strong> API Gateway</p>
      <p><strong>Gateway:</strong> ${proxy.gateway.substring(0, 40)}...</p>
      <p><strong>Index:</strong> ${proxy.index + 1}</p>
    `;
  } else {
    html = `
      <p><strong>Host:</strong> ${proxy.host}</p>
      <p><strong>Port:</strong> ${proxy.port}</p>
      <p><strong>Type:</strong> ${proxy.type}</p>
      <p><strong>Index:</strong> ${proxy.index + 1}</p>
    `;
  }
  
  currentProxyInfo.innerHTML = html;
}

// Update statistics display
function updateStatistics(stats) {
  if (!stats) return;
  
  totalRequests.textContent = stats.totalRequests || 0;
  rotations.textContent = stats.rotations || 0;
  
  // Format uptime
  const uptimeSeconds = Math.floor((stats.uptime || 0) / 1000);
  if (uptimeSeconds < 60) {
    uptime.textContent = `${uptimeSeconds}s`;
  } else if (uptimeSeconds < 3600) {
    const minutes = Math.floor(uptimeSeconds / 60);
    const seconds = uptimeSeconds % 60;
    uptime.textContent = `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    uptime.textContent = `${hours}h ${minutes}m`;
  }
  
  // Format average rotation time
  const avgRotationSeconds = Math.floor((stats.averageRotationTime || 0) / 1000);
  if (avgRotationSeconds < 60) {
    avgRotation.textContent = `${avgRotationSeconds}s`;
  } else {
    const minutes = Math.floor(avgRotationSeconds / 60);
    avgRotation.textContent = `${minutes}m`;
  }
}

// Update stats periodically
async function updateStats() {
  if (currentStatus && currentStatus.isEnabled) {
    const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
    updateStatistics(response.stats);
  }
}

// Toggle proxy on/off
toggleBtn.addEventListener('click', async () => {
  const type = currentStatus.isEnabled ? 'disable' : 'enable';
  const response = await chrome.runtime.sendMessage({ type });
  
  if (response.success) {
    currentStatus.isEnabled = !currentStatus.isEnabled;
    const newStatus = await chrome.runtime.sendMessage({ type: 'getStatus' });
    updateUI(newStatus);
    currentStatus = newStatus;
  }
});

// Rotate proxy manually
rotateBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'rotate' });
  
  if (response.success) {
    updateProxyInfo(response.currentProxy);
    // Flash rotation button
    rotateBtn.style.background = 'rgba(0, 210, 211, 0.5)';
    setTimeout(() => {
      rotateBtn.style.background = '';
    }, 300);
  }
});

// Update rotation mode
rotationMode.addEventListener('change', async (e) => {
  await chrome.runtime.sendMessage({
    type: 'updateRotationMode',
    mode: e.target.value
  });
});

// Update rotation frequency
rotationFrequency.addEventListener('change', async (e) => {
  const frequency = parseInt(e.target.value) || 1;
  await chrome.runtime.sendMessage({
    type: 'updateRotationFrequency',
    frequency: frequency
  });
});

// Configure proxies modal
configureProxiesBtn.addEventListener('click', () => {
  proxyModal.classList.add('show');
  loadProxyList();
});

// Load proxy list into modal
async function loadProxyList() {
  const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
  tempProxies = response.proxyEndpoints || [];
  renderProxyList();
}

// Render proxy list
function renderProxyList() {
  proxyList.innerHTML = '';
  
  tempProxies.forEach((proxy, index) => {
    const item = document.createElement('div');
    item.className = 'proxy-item';
    item.innerHTML = `
      <input type="text" value="${proxy.host}:${proxy.port}" data-index="${index}" readonly>
      <button data-index="${index}">Remove</button>
    `;
    
    item.querySelector('button').addEventListener('click', () => {
      tempProxies.splice(index, 1);
      renderProxyList();
    });
    
    proxyList.appendChild(item);
  });
}

// Add new proxy
addProxyBtn.addEventListener('click', () => {
  const host = prompt('Enter proxy host:');
  if (!host) return;
  
  const port = prompt('Enter proxy port:');
  if (!port) return;
  
  const type = prompt('Enter proxy type (http/socks5):', 'http');
  if (!type) return;
  
  tempProxies.push({ host, port: parseInt(port), type });
  renderProxyList();
});

// Save proxies
saveProxiesBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({
    type: 'updateProxies',
    proxies: tempProxies
  });
  proxyModal.classList.remove('show');
});

// Cancel proxy configuration
cancelProxiesBtn.addEventListener('click', () => {
  proxyModal.classList.remove('show');
});

// Configure API Gateways modal
configureGatewaysBtn.addEventListener('click', () => {
  gatewayModal.classList.add('show');
  loadActiveGateways();
});

// Load active gateways
async function loadActiveGateways() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAllGateways' });
    if (response && response.success && response.gateways) {
      renderActiveGateways(response.gateways);
    } else {
      renderActiveGateways([]);
    }
  } catch (error) {
    console.error('Error loading gateways:', error);
    renderActiveGateways([]);
  }
}

// Render active gateways
function renderActiveGateways(gateways) {
  if (gateways.length === 0) {
    activeGatewaysList.innerHTML = '<p class="no-gateways">No active gateways</p>';
    return;
  }
  
  activeGatewaysList.innerHTML = '';
  
  gateways.forEach((gateway) => {
    const item = document.createElement('div');
    item.className = 'gateway-item';
    
    const stats = gateway.stats || {};
    item.innerHTML = `
      <div class="gateway-header">
        <h4>${gateway.url}</h4>
        <button class="btn-small btn-danger" data-url="${gateway.url}">Remove</button>
      </div>
      <div class="gateway-stats">
        <span>Endpoints: ${stats.endpoints ? stats.endpoints.length : 0}</span>
        <span>Requests: ${stats.totalRequests || 0}</span>
        <span>Errors: ${stats.totalErrors || 0}</span>
        <span>Avg Latency: ${Math.round(stats.averageLatency || 0)}ms</span>
      </div>
      <div class="gateway-actions">
        <button class="btn-small" data-action="test" data-url="${gateway.url}">Test</button>
        <button class="btn-small" data-action="endpoints" data-url="${gateway.url}">View Endpoints</button>
        <button class="btn-small" data-action="rest" data-url="${gateway.url}">Generate REST</button>
      </div>
    `;
    
    // Add event listeners
    item.querySelector('.btn-danger').addEventListener('click', async () => {
      const result = await chrome.runtime.sendMessage({
        type: 'removeGateway',
        url: gateway.url
      });
      if (result.success) {
        loadActiveGateways();
      }
    });
    
    item.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        const url = e.target.dataset.url;
        
        switch(action) {
          case 'test':
            await testGateway(url);
            break;
          case 'endpoints':
            await showEndpoints(url);
            break;
          case 'rest':
            await generateRESTEndpoints(url);
            break;
        }
      });
    });
    
    activeGatewaysList.appendChild(item);
  });
}

// Authentication type change handler
gatewayAuth.addEventListener('change', () => {
  if (gatewayAuth.value === 'none') {
    authConfig.classList.add('hidden');
  } else {
    authConfig.classList.remove('hidden');
    
    switch(gatewayAuth.value) {
      case 'bearer':
        authValue.placeholder = 'Enter Bearer token';
        break;
      case 'apiKey':
        authValue.placeholder = 'Enter API key';
        break;
      case 'basic':
        authValue.placeholder = 'username:password';
        break;
    }
  }
});

// Create new gateway
createGatewayBtn.addEventListener('click', async () => {
  const url = newGatewayUrl.value.trim();
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  
  // Build configuration
  const config = {
    timeout: 30000,
    retries: 3,
    caching: gatewayType.value === 'rest' ? { ttl: 300000, maxSize: 50 } : false
  };
  
  // Add authentication if needed
  if (gatewayAuth.value !== 'none' && authValue.value) {
    switch(gatewayAuth.value) {
      case 'bearer':
        config.authentication = {
          type: 'bearer',
          token: authValue.value
        };
        break;
      case 'apiKey':
        config.authentication = {
          type: 'apiKey',
          location: 'header',
          key: 'X-API-Key',
          value: authValue.value
        };
        break;
      case 'basic':
        const [username, password] = authValue.value.split(':');
        config.authentication = {
          type: 'basic',
          username,
          password
        };
        break;
    }
  }
  
  const result = await chrome.runtime.sendMessage({
    type: 'createAPIGateway',
    url: url,
    config: config
  });
  
  if (result.success) {
    alert(`Gateway created for ${result.message}`);
    newGatewayUrl.value = '';
    authValue.value = '';
    gatewayAuth.value = 'none';
    authConfig.classList.add('hidden');
    loadActiveGateways();
  } else {
    alert(`Error: ${result.error}`);
  }
});

// Auto-detect endpoints
autoDetectBtn.addEventListener('click', async () => {
  const url = newGatewayUrl.value.trim();
  if (!url) {
    alert('Please enter a URL first');
    return;
  }
  
  // Try to detect common API patterns
  const commonEndpoints = [
    '/api', '/v1', '/v2', '/graphql',
    '/users', '/auth', '/login', '/products',
    '/orders', '/search', '/admin'
  ];
  
  const result = await chrome.runtime.sendMessage({
    type: 'generateEndpoints',
    url: url,
    endpoints: commonEndpoints
  });
  
  if (result.success) {
    alert(`Generated ${result.endpoints.length} endpoints for ${url}`);
    loadActiveGateways();
  } else {
    alert(`Error: ${result.error}`);
  }
});

// Test gateway
async function testGateway(url) {
  try {
    // First check if gateway exists
    const gateways = await chrome.runtime.sendMessage({ type: 'getAllGateways' });
    const gatewayExists = gateways.gateways && gateways.gateways.some(g => g.url === url);
    
    if (!gatewayExists) {
      alert('Gateway not found. Please create it first.');
      return;
    }
    
    // Try a simple test - just check if the gateway is configured properly
    const gateway = gateways.gateways.find(g => g.url === url);
    
    if (gateway && gateway.stats) {
      alert(`Gateway Configuration Test Passed!\n\nURL: ${gateway.url}\nEndpoints: ${gateway.stats.endpoints ? gateway.stats.endpoints.length : 0}\nTotal Requests: ${gateway.stats.totalRequests || 0}\n\nNote: Actual API calls may fail due to CORS restrictions in browser extensions. For production use, configure proper CORS headers on your API server or use a proxy service.`);
    } else {
      alert('Gateway exists but has no statistics yet.');
    }
  } catch (error) {
    alert(`Gateway test error:\n${error.message || error}`);
  }
}

// Show endpoints
async function showEndpoints(url) {
  const response = await chrome.runtime.sendMessage({ type: 'getAllGateways' });
  const gateway = response.gateways.find(g => g.url === url);
  
  if (gateway && gateway.stats && gateway.stats.endpoints) {
    alert(`Endpoints for ${url}:\n\n${gateway.stats.endpoints.join('\n')}`);
  } else {
    alert('No endpoints configured for this gateway');
  }
}

// Generate REST endpoints
async function generateRESTEndpoints(url) {
  const resource = prompt('Enter resource name (e.g., users, products):');
  if (!resource) return;
  
  const result = await chrome.runtime.sendMessage({
    type: 'autoGenerateREST',
    url: url,
    resource: resource
  });
  
  if (result.success) {
    const endpoints = Object.entries(result.endpoints)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    alert(`REST endpoints generated for ${resource}:\n\n${endpoints}`);
    loadActiveGateways();
  } else {
    alert(`Error: ${result.error}`);
  }
}

// Export configuration
exportConfigBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'getAllGateways' });
  const config = {
    gateways: response.gateways,
    exportDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'proxyforge-gateways.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Import configuration
importConfigBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const config = JSON.parse(event.target.result);
        
        if (config.gateways && Array.isArray(config.gateways)) {
          for (const gateway of config.gateways) {
            await chrome.runtime.sendMessage({
              type: 'createAPIGateway',
              url: gateway.url,
              config: gateway.config || {}
            });
          }
          
          alert(`Imported ${config.gateways.length} gateways`);
          loadActiveGateways();
        }
      } catch (error) {
        alert('Invalid configuration file');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
});

// Test selected gateway
testGatewayBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'getAllGateways' });
  if (response.gateways.length === 0) {
    alert('No gateways available to test');
    return;
  }
  
  const url = response.gateways[0].url;
  await testGateway(url);
});

// Close gateway modal
closeGatewayBtn.addEventListener('click', () => {
  gatewayModal.classList.remove('show');
});

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'proxyRotated') {
    updateProxyInfo(message.currentProxy);
    updateStatistics(message.stats);
  }
});

// Auto-rotation functions
async function loadAutoRotateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAutoRotateStatus' });
    if (response && response.success) {
      autoRotateToggle.checked = response.enabled;
      
      if (response.enabled) {
        autoRotateConfig.classList.remove('hidden');
      } else {
        autoRotateConfig.classList.add('hidden');
      }
      
      renderWhitelist(response.whitelist || []);
    }
  } catch (error) {
    console.error('Error loading auto-rotate status:', error);
  }
}

async function loadCurrentDomain() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getCurrentTabDomain' });
    if (response && response.success) {
      currentDomain.textContent = response.domain;
    } else {
      currentDomain.textContent = '-';
    }
  } catch (error) {
    console.error('Error loading current domain:', error);
    currentDomain.textContent = '-';
  }
}

function renderWhitelist(domains) {
  if (domains.length === 0) {
    whitelistDomains.innerHTML = '<p style="text-align: center; opacity: 0.7; font-size: 12px;">All sites enabled (no whitelist)</p>';
    return;
  }
  
  whitelistDomains.innerHTML = '';
  
  domains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'domain-item';
    item.innerHTML = `
      <span>${domain}</span>
      <button data-domain="${domain}">Remove</button>
    `;
    
    item.querySelector('button').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
        type: 'removeFromWhitelist',
        domain: domain
      });
      loadAutoRotateStatus();
    });
    
    whitelistDomains.appendChild(item);
  });
}

// Auto-rotate toggle handler
autoRotateToggle.addEventListener('change', async () => {
  if (autoRotateToggle.checked) {
    await chrome.runtime.sendMessage({ type: 'enableAutoRotate' });
    autoRotateConfig.classList.remove('hidden');
    
    // Also enable proxy if not already enabled
    if (currentStatus && !currentStatus.isEnabled) {
      await chrome.runtime.sendMessage({ type: 'enable' });
      const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
      updateUI(response);
      currentStatus = response;
    }
  } else {
    await chrome.runtime.sendMessage({ type: 'disableAutoRotate' });
    autoRotateConfig.classList.add('hidden');
  }
  
  loadAutoRotateStatus();
});

// Add current domain to whitelist
addCurrentDomainBtn.addEventListener('click', async () => {
  const domain = currentDomain.textContent;
  if (domain && domain !== '-') {
    await chrome.runtime.sendMessage({
      type: 'addToWhitelist',
      domain: domain
    });
    loadAutoRotateStatus();
  }
});

// Add new domain to whitelist
addWhitelistBtn.addEventListener('click', async () => {
  const domain = newWhitelistDomain.value.trim();
  if (domain) {
    await chrome.runtime.sendMessage({
      type: 'addToWhitelist',
      domain: domain
    });
    newWhitelistDomain.value = '';
    loadAutoRotateStatus();
  }
});

// Local proxy functions
async function checkLocalProxy() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'checkLocalProxy' });
    
    if (response && response.connected) {
      localProxyIndicator.classList.add('connected');
      localProxyStatus.textContent = 'Connected';
      awsGatewayInfo.classList.remove('hidden');
      
      // Get gateway list
      const gateways = await chrome.runtime.sendMessage({ type: 'listAWSGateways' });
      if (gateways && gateways.success) {
        activeGatewayCount.textContent = gateways.gateways.length;
        if (gateways.gateways.length > 0) {
          currentRegion = gateways.gateways[0].region || '-';
        }
      }
    } else {
      localProxyIndicator.classList.remove('connected');
      localProxyStatus.textContent = 'Not Connected';
      awsGatewayInfo.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error checking local proxy:', error);
    localProxyIndicator.classList.remove('connected');
    localProxyStatus.textContent = 'Error';
  }
}

// Create AWS Gateway button handler
if (createGatewayBtn) {
  createGatewayBtn.addEventListener('click', async () => {
    const targetUrl = prompt('Enter target URL for the gateway:');
    if (!targetUrl) return;
    
    const region = prompt('Enter AWS region (e.g., us-east-1):', 'us-east-1');
    if (!region) return;
    
    const result = await chrome.runtime.sendMessage({
      type: 'createAWSGateway',
      targetUrl: targetUrl,
      region: region
    });
    
    if (result.success) {
      alert('Gateway created successfully!');
      checkLocalProxy();
    } else {
      alert('Failed to create gateway: ' + result.error);
    }
  });
}

// View AWS Gateways button handler
if (viewGatewaysBtn) {
  viewGatewaysBtn.addEventListener('click', async () => {
    const gateways = await chrome.runtime.sendMessage({ type: 'listAWSGateways' });
    
    if (gateways.success && gateways.gateways.length > 0) {
      let message = 'Active AWS API Gateways:\n\n';
      gateways.gateways.forEach((gw, index) => {
        message += `${index + 1}. Region: ${gw.region}\n`;
        message += `   API ID: ${gw.api_id}\n`;
        message += `   Target: ${gw.target}\n`;
        message += `   Status: ${gw.status}\n\n`;
      });
      alert(message);
    } else {
      alert('No active AWS API Gateways found.\n\nCreate one using the "Create Gateway" button.');
    }
  });
}

// Initialize on load
init();