// Background service worker for ProxyForge extension
// Manages proxy rotation and API Gateway integration

import { APIGateway, APIGatewayFactory } from './apiGateway.js';
import { LocalProxyConnector } from './localProxyConnector.js';

class ProxyManager {
  constructor() {
    this.proxyEndpoints = [];
    this.currentProxyIndex = 0;
    this.isEnabled = false;
    this.rotationMode = 'sequential'; // 'sequential' or 'random'
    this.requestCount = 0;
    this.rotateEveryNRequests = 1; // Rotate proxy after N requests
    this.apiGateways = [];
    this.gatewayFactory = new APIGatewayFactory();
    this.activeGateways = new Map(); // Store active gateway instances
    this.localProxy = new LocalProxyConnector(); // Local proxy connection
    this.useLocalProxy = true; // Use local proxy by default
    this.autoRotateMode = false; // Auto-rotate for any URL
    this.autoRotateWhitelist = []; // Domains to auto-rotate
    this.autoRotateBlacklist = ['localhost', '127.0.0.1', 'chrome://', 'chrome-extension://']; // Never auto-rotate these
    this.tabProxyMap = new Map(); // Track proxy per tab
    this.stats = {
      totalRequests: 0,
      rotations: 0,
      startTime: Date.now()
    };
  }

  async init() {
    // Load configuration from storage
    const config = await chrome.storage.local.get([
      'proxyEndpoints', 
      'isEnabled', 
      'rotationMode', 
      'apiGateways',
      'autoRotateMode',
      'autoRotateWhitelist',
      'localProxyConfig',
      'useLocalProxy'
    ]);
    
    if (config.proxyEndpoints) {
      this.proxyEndpoints = config.proxyEndpoints;
    } else {
      // Default to local proxy endpoints
      this.proxyEndpoints = [
        { host: '127.0.0.1', port: 8888, type: 'http', name: 'Local AWS Proxy' }
      ];
    }

    if (config.apiGateways) {
      this.apiGateways = config.apiGateways;
    }

    this.isEnabled = config.isEnabled || false;
    this.rotationMode = config.rotationMode || 'sequential';
    this.autoRotateMode = config.autoRotateMode || false;
    this.autoRotateWhitelist = config.autoRotateWhitelist || [];
    this.useLocalProxy = config.useLocalProxy !== false; // Default to true

    // Connect to local proxy if enabled
    if (this.useLocalProxy) {
      await this.connectToLocalProxy();
    }

    if (this.isEnabled) {
      this.enable();
    }
    
    if (this.autoRotateMode) {
      this.enableAutoRotate();
    }
  }

  // Connect to local proxy service
  async connectToLocalProxy() {
    const result = await this.localProxy.checkConnection();
    
    if (result.connected) {
      console.log('[Local Proxy] Connected successfully');
      
      // Load available gateways
      const gateways = await this.localProxy.listGateways();
      if (gateways.success) {
        console.log(`[Local Proxy] Found ${gateways.gateways.length} AWS API Gateways`);
      }
    } else {
      console.log('[Local Proxy] Not connected:', result.message);
    }
    
    return result;
  }

  // Generate proxy configuration for Chrome proxy API
  generateProxyConfig() {
    // If using local proxy, get config from connector
    if (this.useLocalProxy && this.localProxy.isConnected) {
      return this.localProxy.getProxyConfig();
    }

    // Fallback to regular proxy endpoints
    if (this.proxyEndpoints.length === 0) {
      return { mode: 'direct' };
    }

    const proxy = this.proxyEndpoints[this.currentProxyIndex];
    
    const config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: proxy.type,
          host: proxy.host,
          port: proxy.port
        },
        bypassList: ['localhost', '127.0.0.1', '*.local']
      }
    };

    // If we have API Gateway endpoints, use PAC script instead
    if (this.apiGateways.length > 0) {
      const gateway = this.apiGateways[this.currentProxyIndex % this.apiGateways.length];
      const pacScript = this.generatePACScript(gateway);
      
      return {
        mode: 'pac_script',
        pacScript: {
          data: pacScript
        }
      };
    }

    return config;
  }

  // Generate PAC script for API Gateway routing
  generatePACScript(gatewayUrl) {
    return `
      function FindProxyForURL(url, host) {
        // Skip proxy for local addresses
        if (isPlainHostName(host) ||
            shExpMatch(host, "*.local") ||
            isInNet(dnsResolve(host), "127.0.0.0", "255.0.0.0") ||
            isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||
            isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||
            isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0")) {
          return "DIRECT";
        }
        
        // Route through API Gateway (simulated proxy behavior)
        // Note: Real API Gateway integration would require server-side setup
        return "PROXY ${gatewayUrl.replace('https://', '').replace('http://', '')}:443";
      }
    `;
  }

  // Rotate to next proxy
  rotateProxy() {
    if (this.rotationMode === 'sequential') {
      this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyEndpoints.length;
    } else if (this.rotationMode === 'random') {
      this.currentProxyIndex = Math.floor(Math.random() * this.proxyEndpoints.length);
    }
    
    this.stats.rotations++;
    this.updateProxy();
    
    // Notify popup of rotation
    chrome.runtime.sendMessage({
      type: 'proxyRotated',
      currentProxy: this.getCurrentProxy(),
      stats: this.stats
    }).catch(() => {
      // Popup might not be open
    });
  }

  // Get current proxy info
  getCurrentProxy() {
    if (this.proxyEndpoints.length === 0) {
      return null;
    }
    
    const proxy = this.proxyEndpoints[this.currentProxyIndex];
    if (this.apiGateways.length > 0) {
      const gateway = this.apiGateways[this.currentProxyIndex % this.apiGateways.length];
      return {
        ...proxy,
        gateway: gateway,
        index: this.currentProxyIndex
      };
    }
    
    return {
      ...proxy,
      index: this.currentProxyIndex
    };
  }

  // Update Chrome proxy settings
  async updateProxy() {
    if (!this.isEnabled) {
      chrome.proxy.settings.clear({ scope: 'regular' });
      return;
    }

    const config = this.generateProxyConfig();
    
    chrome.proxy.settings.set({
      value: config,
      scope: 'regular'
    }, () => {
      console.log('Proxy updated:', this.getCurrentProxy());
    });
  }

  // Enable proxy rotation
  enable() {
    this.isEnabled = true;
    this.updateProxy();
    chrome.storage.local.set({ isEnabled: true });
  }

  // Disable proxy rotation
  disable() {
    this.isEnabled = false;
    chrome.proxy.settings.clear({ scope: 'regular' });
    chrome.storage.local.set({ isEnabled: false });
  }

  // Handle request interception for rotation
  handleRequest() {
    if (!this.isEnabled) return;

    this.requestCount++;
    this.stats.totalRequests++;

    if (this.requestCount >= this.rotateEveryNRequests) {
      this.rotateProxy();
      this.requestCount = 0;
    }
  }

  // Add API Gateway endpoint
  addAPIGateway(gatewayUrl) {
    if (!this.apiGateways.includes(gatewayUrl)) {
      this.apiGateways.push(gatewayUrl);
      chrome.storage.local.set({ apiGateways: this.apiGateways });
      
      if (this.isEnabled) {
        this.updateProxy();
      }
    }
  }

  // Remove API Gateway endpoint
  removeAPIGateway(gatewayUrl) {
    const index = this.apiGateways.indexOf(gatewayUrl);
    if (index > -1) {
      this.apiGateways.splice(index, 1);
      chrome.storage.local.set({ apiGateways: this.apiGateways });
      
      if (this.isEnabled) {
        this.updateProxy();
      }
    }
  }

  // Update proxy endpoints
  updateProxyEndpoints(endpoints) {
    this.proxyEndpoints = endpoints;
    chrome.storage.local.set({ proxyEndpoints: endpoints });
    
    if (this.currentProxyIndex >= endpoints.length) {
      this.currentProxyIndex = 0;
    }
    
    if (this.isEnabled) {
      this.updateProxy();
    }
  }

  // Get statistics
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    return {
      ...this.stats,
      uptime: uptime,
      averageRotationTime: this.stats.rotations > 0 ? uptime / this.stats.rotations : 0
    };
  }

  // Create API Gateway dynamically for a URL
  createAPIGatewayForURL(url, config = {}) {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;
      
      // Check if gateway already exists
      if (this.activeGateways.has(origin)) {
        return {
          success: true,
          gateway: this.activeGateways.get(origin),
          message: 'Gateway already exists for this origin'
        };
      }

      // Configure gateway based on URL characteristics
      const gatewayConfig = {
        ...config,
        headers: {
          'Origin': chrome.runtime.getURL(''),
          'X-Extension-Id': chrome.runtime.id,
          ...config.headers
        },
        retries: config.retries || 3,
        timeout: config.timeout || 30000,
        caching: config.caching || { ttl: 300000, maxSize: 50 }
      };

      // Detect API type and apply appropriate template
      let gateway;
      if (url.includes('graphql')) {
        gateway = this.gatewayFactory.createFromTemplate(origin, 'graphql', gatewayConfig);
      } else if (url.includes('ws://') || url.includes('wss://')) {
        gateway = this.gatewayFactory.createFromTemplate(origin, 'websocket', gatewayConfig);
      } else {
        gateway = this.gatewayFactory.createFromTemplate(origin, 'rest', gatewayConfig);
      }

      // Add default interceptors
      gateway.addRequestInterceptor(async (request) => {
        // Add proxy routing if enabled
        if (this.isEnabled && this.proxyEndpoints.length > 0) {
          request.proxyUrl = this.getCurrentProxy();
        }
        
        // Add tracking
        console.log(`[API Gateway] Request: ${request.method} ${request.url}`);
      });

      gateway.addResponseInterceptor(async (response) => {
        // Log response
        console.log(`[API Gateway] Response: ${response.status} in ${response.latency}ms`);
        
        // Update stats
        this.stats.totalRequests++;
      });

      // Store the gateway
      this.activeGateways.set(origin, gateway);
      
      // Persist to storage
      const gatewayUrls = Array.from(this.activeGateways.keys());
      chrome.storage.local.set({ apiGatewayUrls: gatewayUrls });

      return {
        success: true,
        gateway: gateway,
        message: `Gateway created for ${origin}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate API endpoints dynamically
  generateEndpointsForGateway(url, endpoints = []) {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;
      
      const gateway = this.activeGateways.get(origin);
      if (!gateway) {
        return {
          success: false,
          error: 'Gateway not found for this URL'
        };
      }

      const createdEndpoints = [];
      
      // Create endpoints based on specification
      endpoints.forEach(endpoint => {
        if (typeof endpoint === 'string') {
          // Simple endpoint path
          gateway.createEndpoint(endpoint);
          createdEndpoints.push(endpoint);
        } else if (typeof endpoint === 'object') {
          // Complex endpoint with configuration
          const { path, methods, ...config } = endpoint;
          const ep = gateway.createEndpoint(path, methods);
          
          // Apply endpoint-specific configuration
          if (config.middleware) {
            ep.middleware = config.middleware;
          }
          
          createdEndpoints.push(path);
        }
      });

      return {
        success: true,
        endpoints: createdEndpoints,
        gateway: gateway.getStats()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Auto-detect and create REST endpoints
  autoGenerateRESTEndpoints(url, resource) {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;
      
      let gateway = this.activeGateways.get(origin);
      if (!gateway) {
        // Create gateway first
        const result = this.createAPIGatewayForURL(url);
        if (!result.success) {
          return result;
        }
        gateway = result.gateway;
      }

      const restEndpoints = gateway.createRESTEndpoints(resource);
      
      return {
        success: true,
        resource: resource,
        endpoints: {
          list: `GET ${resource}`,
          get: `GET ${resource}/:id`,
          create: `POST ${resource}`,
          update: `PUT ${resource}/:id`,
          patch: `PATCH ${resource}/:id`,
          delete: `DELETE ${resource}/:id`
        },
        methods: restEndpoints
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all active gateways
  getAllGateways() {
    const gateways = [];
    
    this.activeGateways.forEach((gateway, url) => {
      gateways.push({
        url: url,
        stats: gateway.getStats(),
        config: gateway.config
      });
    });

    return gateways;
  }

  // Remove a gateway
  removeGateway(url) {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;
      
      if (this.activeGateways.has(origin)) {
        this.activeGateways.delete(origin);
        
        // Update storage
        const gatewayUrls = Array.from(this.activeGateways.keys());
        chrome.storage.local.set({ apiGatewayUrls: gatewayUrls });
        
        return {
          success: true,
          message: `Gateway removed for ${origin}`
        };
      }

      return {
        success: false,
        error: 'Gateway not found'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Enable auto-rotation mode
  enableAutoRotate() {
    this.autoRotateMode = true;
    chrome.storage.local.set({ autoRotateMode: true });
    
    // Start monitoring tab changes
    this.startTabMonitoring();
  }

  // Disable auto-rotation mode
  disableAutoRotate() {
    this.autoRotateMode = false;
    chrome.storage.local.set({ autoRotateMode: false });
    
    // Stop monitoring tab changes
    this.stopTabMonitoring();
  }

  // Start monitoring tab URL changes
  startTabMonitoring() {
    // Monitor when tabs are updated
    if (!this.tabUpdateListener) {
      this.tabUpdateListener = (tabId, changeInfo, tab) => {
        if (changeInfo.url && this.autoRotateMode) {
          this.handleTabUrlChange(tabId, changeInfo.url);
        }
      };
      chrome.tabs.onUpdated.addListener(this.tabUpdateListener);
    }

    // Monitor when active tab changes
    if (!this.tabActivatedListener) {
      this.tabActivatedListener = (activeInfo) => {
        if (this.autoRotateMode) {
          chrome.tabs.get(activeInfo.tabId, (tab) => {
            if (tab.url) {
              this.handleTabUrlChange(activeInfo.tabId, tab.url);
            }
          });
        }
      };
      chrome.tabs.onActivated.addListener(this.tabActivatedListener);
    }
  }

  // Stop monitoring tab changes
  stopTabMonitoring() {
    if (this.tabUpdateListener) {
      chrome.tabs.onUpdated.removeListener(this.tabUpdateListener);
      this.tabUpdateListener = null;
    }
    
    if (this.tabActivatedListener) {
      chrome.tabs.onActivated.removeListener(this.tabActivatedListener);
      this.tabActivatedListener = null;
    }
  }

  // Handle tab URL changes for auto-rotation
  handleTabUrlChange(tabId, url) {
    try {
      // Check if URL should be auto-rotated
      if (!this.shouldAutoRotate(url)) {
        return;
      }

      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;
      
      // Check if we need to rotate for this tab
      const lastDomain = this.tabProxyMap.get(tabId);
      
      if (lastDomain !== domain) {
        // New domain visited, rotate proxy
        this.rotateProxy();
        this.tabProxyMap.set(tabId, domain);
        
        // Optionally create a gateway for this domain
        if (this.autoCreateGateways) {
          this.createAPIGatewayForURL(url);
        }
        
        console.log(`[Auto-Rotate] Rotated proxy for ${domain}`);
      }
    } catch (error) {
      console.error('[Auto-Rotate] Error handling URL change:', error);
    }
  }

  // Check if URL should trigger auto-rotation
  shouldAutoRotate(url) {
    try {
      // Skip invalid URLs
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;
      const protocol = parsedUrl.protocol;
      
      // Skip non-http(s) protocols
      if (!protocol.startsWith('http')) {
        return false;
      }
      
      // Check blacklist
      for (const blacklisted of this.autoRotateBlacklist) {
        if (domain.includes(blacklisted) || url.includes(blacklisted)) {
          return false;
        }
      }
      
      // If whitelist is empty, rotate for all non-blacklisted domains
      if (this.autoRotateWhitelist.length === 0) {
        return true;
      }
      
      // Check whitelist
      for (const whitelisted of this.autoRotateWhitelist) {
        if (domain.includes(whitelisted)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  // Add domain to whitelist
  addToWhitelist(domain) {
    if (!this.autoRotateWhitelist.includes(domain)) {
      this.autoRotateWhitelist.push(domain);
      chrome.storage.local.set({ autoRotateWhitelist: this.autoRotateWhitelist });
    }
  }

  // Remove domain from whitelist
  removeFromWhitelist(domain) {
    const index = this.autoRotateWhitelist.indexOf(domain);
    if (index > -1) {
      this.autoRotateWhitelist.splice(index, 1);
      chrome.storage.local.set({ autoRotateWhitelist: this.autoRotateWhitelist });
    }
  }

  // Get auto-rotation status
  getAutoRotateStatus() {
    return {
      enabled: this.autoRotateMode,
      whitelist: this.autoRotateWhitelist,
      blacklist: this.autoRotateBlacklist,
      tabProxyMap: Array.from(this.tabProxyMap.entries())
    };
  }
}

// Initialize proxy manager
const proxyManager = new ProxyManager();
proxyManager.init();

// Listen for web requests to trigger rotation
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Only count main frame and sub frame requests
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      proxyManager.handleRequest();
    }
  },
  { urls: ['<all_urls>'] }
);

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'enable':
      proxyManager.enable();
      sendResponse({ success: true });
      break;
      
    case 'disable':
      proxyManager.disable();
      sendResponse({ success: true });
      break;
      
    case 'rotate':
      proxyManager.rotateProxy();
      sendResponse({ success: true, currentProxy: proxyManager.getCurrentProxy() });
      break;
      
    case 'getStatus':
      sendResponse({
        isEnabled: proxyManager.isEnabled,
        currentProxy: proxyManager.getCurrentProxy(),
        proxyEndpoints: proxyManager.proxyEndpoints,
        apiGateways: proxyManager.apiGateways,
        rotationMode: proxyManager.rotationMode,
        stats: proxyManager.getStats()
      });
      break;
      
    case 'updateProxies':
      proxyManager.updateProxyEndpoints(request.proxies);
      sendResponse({ success: true });
      break;
      
    case 'updateRotationMode':
      proxyManager.rotationMode = request.mode;
      chrome.storage.local.set({ rotationMode: request.mode });
      sendResponse({ success: true });
      break;
      
    case 'addAPIGateway':
      proxyManager.addAPIGateway(request.gateway);
      sendResponse({ success: true });
      break;
      
    case 'removeAPIGateway':
      proxyManager.removeAPIGateway(request.gateway);
      sendResponse({ success: true });
      break;
      
    case 'updateRotationFrequency':
      proxyManager.rotateEveryNRequests = request.frequency;
      sendResponse({ success: true });
      break;
      
    case 'createAPIGateway':
      const gatewayResult = proxyManager.createAPIGatewayForURL(request.url, request.config || {});
      sendResponse(gatewayResult);
      break;
      
    case 'generateEndpoints':
      const endpointsResult = proxyManager.generateEndpointsForGateway(request.url, request.endpoints || []);
      sendResponse(endpointsResult);
      break;
      
    case 'autoGenerateREST':
      const restResult = proxyManager.autoGenerateRESTEndpoints(request.url, request.resource);
      sendResponse(restResult);
      break;
      
    case 'getAllGateways':
      const gateways = proxyManager.getAllGateways();
      sendResponse({ success: true, gateways });
      break;
      
    case 'removeGateway':
      const removeResult = proxyManager.removeGateway(request.url);
      sendResponse(removeResult);
      break;
      
    case 'executeGatewayRequest':
      // Execute a request through a gateway
      (async () => {
        try {
          const parsedUrl = new URL(request.url);
          const origin = parsedUrl.origin;
          const gateway = proxyManager.activeGateways.get(origin);
          
          if (!gateway) {
            sendResponse({ success: false, error: 'Gateway not found' });
            return;
          }
          
          const endpoint = gateway.endpoints.get(request.path);
          if (!endpoint) {
            // Create endpoint on the fly if it doesn't exist
            gateway.createEndpoint(request.path, request.method || 'GET');
          }
          
          const handler = gateway.createHandler(request.method || 'GET', request.path);
          const result = await handler(request.data, request.options);
          
          sendResponse({ success: true, data: result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep channel open for async response
      
    case 'enableAutoRotate':
      proxyManager.enableAutoRotate();
      sendResponse({ success: true });
      break;
      
    case 'disableAutoRotate':
      proxyManager.disableAutoRotate();
      sendResponse({ success: true });
      break;
      
    case 'getAutoRotateStatus':
      const autoRotateStatus = proxyManager.getAutoRotateStatus();
      sendResponse({ success: true, ...autoRotateStatus });
      break;
      
    case 'addToWhitelist':
      proxyManager.addToWhitelist(request.domain);
      sendResponse({ success: true });
      break;
      
    case 'removeFromWhitelist':
      proxyManager.removeFromWhitelist(request.domain);
      sendResponse({ success: true });
      break;
      
    case 'getCurrentTabDomain':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            sendResponse({ success: true, domain: url.hostname });
          } catch (error) {
            sendResponse({ success: false, error: 'Invalid URL' });
          }
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      });
      return true; // Keep channel open for async response
      
    case 'checkLocalProxy':
      (async () => {
        const result = await proxyManager.connectToLocalProxy();
        sendResponse(result);
      })();
      return true;
      
    case 'createAWSGateway':
      (async () => {
        const result = await proxyManager.localProxy.createGateway(request.targetUrl, request.region);
        sendResponse(result);
      })();
      return true;
      
    case 'deleteAWSGateway':
      (async () => {
        const result = await proxyManager.localProxy.deleteGateway(request.apiId, request.region);
        sendResponse(result);
      })();
      return true;
      
    case 'listAWSGateways':
      (async () => {
        const result = await proxyManager.localProxy.listGateways();
        sendResponse(result);
      })();
      return true;
      
    case 'rotateAWSGateway':
      (async () => {
        const result = await proxyManager.localProxy.rotateGateway();
        if (result.success) {
          proxyManager.stats.rotations++;
        }
        sendResponse(result);
      })();
      return true;
      
    case 'getLocalProxyStats':
      (async () => {
        const result = await proxyManager.localProxy.getStats();
        sendResponse(result);
      })();
      return true;
      
    case 'toggleLocalProxy':
      proxyManager.useLocalProxy = request.enabled;
      chrome.storage.local.set({ useLocalProxy: request.enabled });
      
      if (request.enabled) {
        proxyManager.connectToLocalProxy();
      }
      
      sendResponse({ success: true, enabled: request.enabled });
      break;
      
    default:
      sendResponse({ error: 'Unknown request type' });
  }
  
  return true; // Keep message channel open for async response
});

// Handle proxy authentication if needed
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    // Get credentials for current proxy if authentication is required
    const proxy = proxyManager.getCurrentProxy();
    
    if (proxy && proxy.username && proxy.password) {
      callback({
        authCredentials: {
          username: proxy.username,
          password: proxy.password
        }
      });
    } else {
      callback();
    }
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

console.log('ProxyForge background service initialized');