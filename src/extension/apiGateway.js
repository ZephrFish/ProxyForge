// API Gateway Factory System for ProxyForge
// Dynamically generates and manages API gateways for any URL

class APIGateway {
  constructor(baseUrl, config = {}) {
    this.baseUrl = this.normalizeUrl(baseUrl);
    this.config = {
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      headers: config.headers || {},
      rateLimit: config.rateLimit || null,
      caching: config.caching || false,
      authentication: config.authentication || null,
      transformers: config.transformers || {},
      interceptors: config.interceptors || { request: [], response: [] }
    };
    
    this.endpoints = new Map();
    this.middleware = [];
    this.metrics = {
      requests: 0,
      errors: 0,
      latency: [],
      lastRequest: null
    };
    
    this.rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
    this.cache = config.caching ? new CacheManager(config.caching) : null;
  }

  normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname.replace(/\/$/, '');
    } catch (e) {
      // If not a valid URL, assume it's a relative path
      if (url.startsWith('/')) {
        return url;
      }
      return '/' + url;
    }
  }

  // Create a new endpoint dynamically
  createEndpoint(path, methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
    // Ensure methods is always an array
    const methodArray = Array.isArray(methods) ? methods : [methods];
    
    const endpoint = {
      path: this.normalizePath(path),
      methods: methodArray,
      handlers: {},
      middleware: [],
      created: Date.now()
    };

    methodArray.forEach(method => {
      endpoint.handlers[method] = this.createHandler(method, path);
    });

    this.endpoints.set(path, endpoint);
    return endpoint;
  }

  normalizePath(path) {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return path.replace(/\/$/, '') || '/';
  }

  // Create a request handler for a specific method and path
  createHandler(method, path) {
    return async (data = {}, options = {}) => {
      const request = this.buildRequest(method, path, data, options);
      
      // Apply request interceptors
      for (const interceptor of this.config.interceptors.request) {
        await interceptor(request);
      }

      // Rate limiting
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      // Check cache for GET requests
      if (this.cache && method === 'GET') {
        const cached = await this.cache.get(request.cacheKey);
        if (cached) {
          this.metrics.requests++;
          return cached;
        }
      }

      // Execute request with retry logic
      let lastError;
      for (let attempt = 0; attempt <= this.config.retries; attempt++) {
        try {
          const response = await this.executeRequest(request);
          
          // Apply response interceptors
          for (const interceptor of this.config.interceptors.response) {
            await interceptor(response);
          }

          // Cache successful GET responses
          if (this.cache && method === 'GET' && response.ok) {
            await this.cache.set(request.cacheKey, response.data);
          }

          this.updateMetrics(response);
          return response.data;
        } catch (error) {
          lastError = error;
          if (attempt < this.config.retries) {
            await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
          }
        }
      }

      this.metrics.errors++;
      throw lastError;
    };
  }

  buildRequest(method, path, data, options) {
    const url = new URL(this.baseUrl + this.normalizePath(path));
    
    // Add query parameters for GET requests
    if (method === 'GET' && data) {
      Object.keys(data).forEach(key => {
        url.searchParams.append(key, data[key]);
      });
    }

    const headers = {
      ...this.config.headers,
      ...options.headers,
      'Content-Type': 'application/json'
    };

    // Add authentication headers
    if (this.config.authentication) {
      this.applyAuthentication(headers);
    }

    const request = {
      url: url.toString(),
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
      cacheKey: `${method}:${url.toString()}`,
      ...options
    };

    return request;
  }

  applyAuthentication(headers) {
    const auth = this.config.authentication;
    
    switch (auth.type) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.token}`;
        break;
      case 'apiKey':
        if (auth.location === 'header') {
          headers[auth.key || 'X-API-Key'] = auth.value;
        }
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
        break;
      case 'oauth2':
        headers['Authorization'] = `Bearer ${auth.accessToken}`;
        break;
    }
  }

  async executeRequest(request) {
    const startTime = performance.now();
    
    try {
      // Create fetch options
      const fetchOptions = {
        method: request.method,
        headers: request.headers
      };
      
      // Only add body for methods that support it
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        fetchOptions.body = request.body;
      }
      
      // Add timeout if supported
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        fetchOptions.signal = AbortSignal.timeout(this.config.timeout);
      }
      
      const response = await fetch(request.url, fetchOptions);

      const data = await this.parseResponse(response);
      const endTime = performance.now();

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        latency: endTime - startTime,
        timestamp: Date.now()
      };
    } catch (error) {
      const endTime = performance.now();
      
      // Handle different types of errors
      let errorMessage = error.message;
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error or CORS issue. The target server may not allow requests from browser extensions.';
      } else if (error.name === 'AbortError') {
        errorMessage = `Request timeout after ${this.config.timeout}ms`;
      }
      
      throw {
        error: errorMessage,
        latency: endTime - startTime,
        timestamp: Date.now(),
        request
      };
    }
  }

  async parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      return await response.json();
    } else if (contentType.includes('text/')) {
      return await response.text();
    } else if (contentType.includes('application/octet-stream')) {
      return await response.blob();
    } else {
      return await response.text();
    }
  }

  updateMetrics(response) {
    this.metrics.requests++;
    this.metrics.latency.push(response.latency);
    this.metrics.lastRequest = response.timestamp;
    
    // Keep only last 100 latency measurements
    if (this.metrics.latency.length > 100) {
      this.metrics.latency.shift();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Add request interceptor
  addRequestInterceptor(interceptor) {
    this.config.interceptors.request.push(interceptor);
  }

  // Add response interceptor
  addResponseInterceptor(interceptor) {
    this.config.interceptors.response.push(interceptor);
  }

  // Get gateway statistics
  getStats() {
    const avgLatency = this.metrics.latency.length > 0
      ? this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length
      : 0;

    return {
      baseUrl: this.baseUrl,
      endpoints: Array.from(this.endpoints.keys()),
      totalRequests: this.metrics.requests,
      totalErrors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0,
      averageLatency: avgLatency,
      lastRequest: this.metrics.lastRequest
    };
  }

  // Create REST endpoints automatically
  createRESTEndpoints(resource) {
    const resourcePath = this.normalizePath(resource);
    
    // Create standard REST endpoints
    const endpoints = {
      list: this.createEndpoint(resourcePath, 'GET'),
      get: this.createEndpoint(`${resourcePath}/:id`, 'GET'),
      create: this.createEndpoint(resourcePath, 'POST'),
      update: this.createEndpoint(`${resourcePath}/:id`, ['PUT', 'PATCH']),
      delete: this.createEndpoint(`${resourcePath}/:id`, 'DELETE')
    };

    // Return convenience methods
    return {
      list: (params = {}) => endpoints.list.handlers.GET(params),
      get: (id, params = {}) => {
        const path = `${resourcePath}/${id}`;
        return this.createHandler('GET', path)(params);
      },
      create: (data) => endpoints.create.handlers.POST(data),
      update: (id, data) => {
        const path = `${resourcePath}/${id}`;
        return this.createHandler('PUT', path)(data);
      },
      patch: (id, data) => {
        const path = `${resourcePath}/${id}`;
        return this.createHandler('PATCH', path)(data);
      },
      delete: (id) => {
        const path = `${resourcePath}/${id}`;
        return this.createHandler('DELETE', path)();
      }
    };
  }

  // Create GraphQL endpoint
  createGraphQLEndpoint(path = '/graphql') {
    const endpoint = this.createEndpoint(path, 'POST');
    
    return {
      query: (query, variables = {}) => {
        return endpoint.handlers.POST({ query, variables });
      },
      mutation: (mutation, variables = {}) => {
        return endpoint.handlers.POST({ query: mutation, variables });
      }
    };
  }

  // WebSocket support
  createWebSocketEndpoint(path) {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + this.normalizePath(path);
    
    return {
      connect: (options = {}) => {
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = options.onOpen || (() => {});
        ws.onmessage = options.onMessage || (() => {});
        ws.onerror = options.onError || (() => {});
        ws.onclose = options.onClose || (() => {});
        
        return {
          send: (data) => ws.send(JSON.stringify(data)),
          close: () => ws.close(),
          socket: ws
        };
      }
    };
  }
}

// Rate Limiter implementation
class RateLimiter {
  constructor(config) {
    this.maxRequests = config.maxRequests || 10;
    this.windowMs = config.windowMs || 1000;
    this.queue = [];
    this.processing = false;
  }

  async acquire() {
    return new Promise(resolve => {
      this.queue.push(resolve);
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxRequests);
      batch.forEach(resolve => resolve());
      
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.windowMs));
      }
    }

    this.processing = false;
  }
}

// Cache Manager implementation
class CacheManager {
  constructor(config) {
    this.ttl = config.ttl || 300000; // 5 minutes default
    this.maxSize = config.maxSize || 100;
    this.cache = new Map();
  }

  async get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  async set(key, data) {
    // Enforce max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }
}

// API Gateway Factory
class APIGatewayFactory {
  constructor() {
    this.gateways = new Map();
    this.templates = new Map();
    
    // Register default templates
    this.registerTemplate('rest', {
      headers: { 'Accept': 'application/json' },
      caching: { ttl: 300000, maxSize: 50 },
      retries: 3,
      timeout: 30000
    });
    
    this.registerTemplate('graphql', {
      headers: { 'Content-Type': 'application/json' },
      retries: 2,
      timeout: 60000
    });
    
    this.registerTemplate('websocket', {
      retries: 5,
      timeout: 10000
    });
  }

  // Create or get existing gateway
  create(url, config = {}) {
    const normalizedUrl = new URL(url).origin;
    
    if (this.gateways.has(normalizedUrl)) {
      return this.gateways.get(normalizedUrl);
    }
    
    const gateway = new APIGateway(normalizedUrl, config);
    this.gateways.set(normalizedUrl, gateway);
    
    return gateway;
  }

  // Create gateway from template
  createFromTemplate(url, templateName, overrides = {}) {
    const template = this.templates.get(templateName);
    
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }
    
    const config = { ...template, ...overrides };
    return this.create(url, config);
  }

  // Register a new template
  registerTemplate(name, config) {
    this.templates.set(name, config);
  }

  // Get all active gateways
  getAll() {
    return Array.from(this.gateways.entries()).map(([url, gateway]) => ({
      url,
      stats: gateway.getStats()
    }));
  }

  // Clear all gateways
  clearAll() {
    this.gateways.clear();
  }

  // Remove specific gateway
  remove(url) {
    const normalizedUrl = new URL(url).origin;
    return this.gateways.delete(normalizedUrl);
  }
}

// Export for use in extension
export { APIGateway, APIGatewayFactory };