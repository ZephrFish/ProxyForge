// Mock Chrome Extension API for testing
window.chrome = {
  runtime: {
    sendMessage: function(message, callback) {
      // Mock implementation
      if (callback) {
        setTimeout(() => {
          callback({ success: true, mocked: true });
        }, 10);
      }
      return Promise.resolve({ success: true, mocked: true });
    },
    onMessage: {
      addListener: function(callback) {
        // Store callback for testing
        this.listeners = this.listeners || [];
        this.listeners.push(callback);
      },
      removeListener: function(callback) {
        this.listeners = this.listeners || [];
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      },
      trigger: function(message, sender, sendResponse) {
        // Trigger all listeners for testing
        this.listeners = this.listeners || [];
        this.listeners.forEach(listener => {
          listener(message, sender, sendResponse);
        });
      }
    },
    getURL: function(path) {
      return 'chrome-extension://mock-extension-id/' + path;
    },
    id: 'mock-extension-id'
  },
  
  storage: {
    local: {
      data: {},
      get: function(keys, callback) {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (this.data[key] !== undefined) {
              result[key] = this.data[key];
            }
          });
        } else if (typeof keys === 'string') {
          if (this.data[keys] !== undefined) {
            result[keys] = this.data[keys];
          }
        } else if (keys === null || keys === undefined) {
          Object.assign(result, this.data);
        }
        
        if (callback) {
          setTimeout(() => callback(result), 10);
        }
        return Promise.resolve(result);
      },
      set: function(items, callback) {
        Object.assign(this.data, items);
        if (callback) {
          setTimeout(() => callback(), 10);
        }
        return Promise.resolve();
      },
      clear: function(callback) {
        this.data = {};
        if (callback) {
          setTimeout(() => callback(), 10);
        }
        return Promise.resolve();
      }
    }
  },
  
  proxy: {
    settings: {
      value: null,
      set: function(config, callback) {
        this.value = config.value;
        if (callback) {
          setTimeout(() => callback(), 10);
        }
        return Promise.resolve();
      },
      clear: function(options, callback) {
        this.value = null;
        if (callback) {
          setTimeout(() => callback(), 10);
        }
        return Promise.resolve();
      },
      get: function(options, callback) {
        if (callback) {
          setTimeout(() => callback({ value: this.value }), 10);
        }
        return Promise.resolve({ value: this.value });
      }
    }
  },
  
  tabs: {
    query: function(queryInfo, callback) {
      // Mock tab data
      const mockTabs = [
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          active: true
        }
      ];
      
      if (callback) {
        setTimeout(() => callback(mockTabs), 10);
      }
      return Promise.resolve(mockTabs);
    },
    get: function(tabId, callback) {
      const mockTab = {
        id: tabId,
        url: 'https://example.com',
        title: 'Example'
      };
      
      if (callback) {
        setTimeout(() => callback(mockTab), 10);
      }
      return Promise.resolve(mockTab);
    },
    onUpdated: {
      addListener: function(callback) {
        this.listeners = this.listeners || [];
        this.listeners.push(callback);
      },
      removeListener: function(callback) {
        this.listeners = this.listeners || [];
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      }
    },
    onActivated: {
      addListener: function(callback) {
        this.listeners = this.listeners || [];
        this.listeners.push(callback);
      },
      removeListener: function(callback) {
        this.listeners = this.listeners || [];
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      }
    }
  },
  
  webRequest: {
    onBeforeRequest: {
      addListener: function(callback, filter, extraInfoSpec) {
        this.listeners = this.listeners || [];
        this.listeners.push({ callback, filter, extraInfoSpec });
      },
      removeListener: function(callback) {
        this.listeners = this.listeners || [];
        this.listeners = this.listeners.filter(l => l.callback !== callback);
      }
    },
    onAuthRequired: {
      addListener: function(callback, filter, extraInfoSpec) {
        this.listeners = this.listeners || [];
        this.listeners.push({ callback, filter, extraInfoSpec });
      },
      removeListener: function(callback) {
        this.listeners = this.listeners || [];
        this.listeners = this.listeners.filter(l => l.callback !== callback);
      }
    }
  }
};