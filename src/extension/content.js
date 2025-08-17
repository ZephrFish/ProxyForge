// Content script for ProxyForge extension
// Monitors and reports network activity to background script

(function() {
  'use strict';

  // Track page information
  const pageInfo = {
    url: window.location.href,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    startTime: Date.now()
  };

  // Send page load information to background script
  chrome.runtime.sendMessage({
    type: 'pageLoad',
    pageInfo: pageInfo
  }).catch(() => {
    // Background script might not be ready
  });

  // Monitor XMLHttpRequests
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this._requestInfo = {
      method: method,
      url: url,
      timestamp: Date.now()
    };
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    
    // Track request
    if (xhr._requestInfo) {
      chrome.runtime.sendMessage({
        type: 'xhrRequest',
        requestInfo: {
          ...xhr._requestInfo,
          origin: window.location.origin
        }
      }).catch(() => {});
    }

    // Add event listeners
    xhr.addEventListener('loadend', function() {
      if (xhr._requestInfo) {
        chrome.runtime.sendMessage({
          type: 'xhrComplete',
          requestInfo: {
            ...xhr._requestInfo,
            status: xhr.status,
            duration: Date.now() - xhr._requestInfo.timestamp
          }
        }).catch(() => {});
      }
    });

    return originalXHRSend.apply(this, arguments);
  };

  // Monitor Fetch API
  const originalFetch = window.fetch;
  
  window.fetch = function(resource, init) {
    const startTime = Date.now();
    const requestInfo = {
      url: typeof resource === 'string' ? resource : resource.url,
      method: (init && init.method) || 'GET',
      timestamp: startTime
    };

    // Track request
    chrome.runtime.sendMessage({
      type: 'fetchRequest',
      requestInfo: {
        ...requestInfo,
        origin: window.location.origin
      }
    }).catch(() => {});

    // Call original fetch and track response
    return originalFetch.apply(this, arguments).then(response => {
      chrome.runtime.sendMessage({
        type: 'fetchComplete',
        requestInfo: {
          ...requestInfo,
          status: response.status,
          duration: Date.now() - startTime
        }
      }).catch(() => {});
      
      return response;
    }).catch(error => {
      chrome.runtime.sendMessage({
        type: 'fetchError',
        requestInfo: {
          ...requestInfo,
          error: error.message,
          duration: Date.now() - startTime
        }
      }).catch(() => {});
      
      throw error;
    });
  };

  // Create visual indicator for proxy status
  function createStatusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'proxyforge-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(102, 126, 234, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
      z-index: 999999;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      display: none;
    `;
    
    indicator.title = 'ProxyForge Active';
    indicator.textContent = 'SB';
    
    indicator.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'rotate' });
      
      // Visual feedback
      indicator.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        indicator.style.transform = '';
      }, 500);
    });
    
    document.body.appendChild(indicator);
    return indicator;
  }

  // Update indicator based on proxy status
  async function updateIndicator() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
      const indicator = document.getElementById('proxyforge-indicator');
      
      if (indicator) {
        if (response.isEnabled) {
          indicator.style.display = 'flex';
          indicator.style.background = 'rgba(0, 210, 211, 0.8)';
          indicator.title = `ProxyForge Active - Proxy ${(response.currentProxy?.index || 0) + 1}`;
        } else {
          indicator.style.display = 'none';
        }
      }
    } catch (error) {
      // Extension context might be invalidated
    }
  }

  // Initialize status indicator when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createStatusIndicator();
      updateIndicator();
    });
  } else {
    createStatusIndicator();
    updateIndicator();
  }

  // Listen for status updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'statusUpdate' || message.type === 'proxyRotated') {
      updateIndicator();
    }
  });

  // Periodically update status
  setInterval(updateIndicator, 5000);

  // Track page visibility changes
  document.addEventListener('visibilitychange', () => {
    chrome.runtime.sendMessage({
      type: 'visibilityChange',
      hidden: document.hidden,
      pageInfo: pageInfo
    }).catch(() => {});
  });

  // Track page unload
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({
      type: 'pageUnload',
      pageInfo: {
        ...pageInfo,
        duration: Date.now() - pageInfo.startTime
      }
    }).catch(() => {});
  });

  // Content script loaded
})();