// Unit tests for API Gateway functionality
import { APIGateway, APIGatewayFactory } from '../apiGateway.js';

describe('Unit: APIGateway', () => {
  let gateway;
  
  beforeEach(() => {
    gateway = new APIGateway('https://api.example.com');
  });
  
  describe('URL Normalization', () => {
    it('should normalize URLs correctly', () => {
      expect(gateway.normalizeUrl('https://api.example.com/')).to.equal('https://api.example.com');
      expect(gateway.normalizeUrl('https://api.example.com/path')).to.equal('https://api.example.com/path');
      expect(gateway.normalizeUrl('/relative/path')).to.equal('/relative/path');
    });
    
    it('should handle invalid URLs gracefully', () => {
      expect(gateway.normalizeUrl('not-a-url')).to.equal('/not-a-url');
      expect(gateway.normalizeUrl('')).to.equal('/');
    });
  });
  
  describe('Path Normalization', () => {
    it('should normalize paths correctly', () => {
      expect(gateway.normalizePath('path')).to.equal('/path');
      expect(gateway.normalizePath('/path')).to.equal('/path');
      expect(gateway.normalizePath('/path/')).to.equal('/path');
      expect(gateway.normalizePath('')).to.equal('/');
    });
  });
  
  describe('Endpoint Creation', () => {
    it('should create endpoints with default methods', () => {
      const endpoint = gateway.createEndpoint('/users');
      expect(endpoint).to.have.property('path', '/users');
      expect(endpoint.methods).to.include.members(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
      expect(endpoint.handlers).to.have.all.keys('GET', 'POST', 'PUT', 'DELETE', 'PATCH');
    });
    
    it('should create endpoints with specific methods', () => {
      const endpoint = gateway.createEndpoint('/users', ['GET', 'POST']);
      expect(endpoint.methods).to.deep.equal(['GET', 'POST']);
      expect(endpoint.handlers).to.have.all.keys('GET', 'POST');
    });
    
    it('should handle single method as string', () => {
      const endpoint = gateway.createEndpoint('/users', 'GET');
      expect(endpoint.methods).to.deep.equal(['GET']);
      expect(endpoint.handlers).to.have.all.keys('GET');
    });
  });
  
  describe('Request Building', () => {
    it('should build GET requests correctly', () => {
      const request = gateway.buildRequest('GET', '/users', { page: 1, limit: 10 });
      expect(request.url).to.include('page=1');
      expect(request.url).to.include('limit=10');
      expect(request.method).to.equal('GET');
      expect(request.body).to.be.undefined;
    });
    
    it('should build POST requests correctly', () => {
      const data = { name: 'John', email: 'john@example.com' };
      const request = gateway.buildRequest('POST', '/users', data);
      expect(request.method).to.equal('POST');
      expect(request.body).to.equal(JSON.stringify(data));
      expect(request.headers['Content-Type']).to.equal('application/json');
    });
  });
  
  describe('Authentication', () => {
    it('should apply Bearer token authentication', () => {
      gateway.config.authentication = { type: 'bearer', token: 'test-token' };
      const headers = {};
      gateway.applyAuthentication(headers);
      expect(headers.Authorization).to.equal('Bearer test-token');
    });
    
    it('should apply API key authentication', () => {
      gateway.config.authentication = { 
        type: 'apiKey', 
        location: 'header',
        key: 'X-API-Key',
        value: 'test-key'
      };
      const headers = {};
      gateway.applyAuthentication(headers);
      expect(headers['X-API-Key']).to.equal('test-key');
    });
    
    it('should apply Basic authentication', () => {
      gateway.config.authentication = { 
        type: 'basic',
        username: 'user',
        password: 'pass'
      };
      const headers = {};
      gateway.applyAuthentication(headers);
      expect(headers.Authorization).to.equal('Basic ' + btoa('user:pass'));
    });
  });
  
  describe('REST Endpoints', () => {
    it('should create standard REST endpoints', () => {
      const rest = gateway.createRESTEndpoints('/users');
      expect(rest).to.have.all.keys('list', 'get', 'create', 'update', 'patch', 'delete');
      expect(typeof rest.list).to.equal('function');
      expect(typeof rest.get).to.equal('function');
      expect(typeof rest.create).to.equal('function');
    });
  });
  
  describe('Statistics', () => {
    it('should track request statistics', () => {
      const stats = gateway.getStats();
      expect(stats).to.have.property('baseUrl', 'https://api.example.com');
      expect(stats).to.have.property('endpoints');
      expect(stats).to.have.property('totalRequests', 0);
      expect(stats).to.have.property('totalErrors', 0);
      expect(stats).to.have.property('errorRate', 0);
      expect(stats).to.have.property('averageLatency', 0);
    });
    
    it('should update metrics correctly', () => {
      gateway.updateMetrics({ latency: 100 });
      gateway.updateMetrics({ latency: 200 });
      const stats = gateway.getStats();
      expect(stats.totalRequests).to.equal(2);
      expect(stats.averageLatency).to.equal(150);
    });
  });
});

describe('Unit: APIGatewayFactory', () => {
  let factory;
  
  beforeEach(() => {
    factory = new APIGatewayFactory();
  });
  
  describe('Gateway Creation', () => {
    it('should create new gateways', () => {
      const gateway = factory.create('https://api.example.com');
      expect(gateway).to.be.instanceOf(APIGateway);
      expect(gateway.baseUrl).to.equal('https://api.example.com');
    });
    
    it('should reuse existing gateways for same URL', () => {
      const gateway1 = factory.create('https://api.example.com');
      const gateway2 = factory.create('https://api.example.com');
      expect(gateway1).to.equal(gateway2);
    });
    
    it('should create different gateways for different URLs', () => {
      const gateway1 = factory.create('https://api1.example.com');
      const gateway2 = factory.create('https://api2.example.com');
      expect(gateway1).to.not.equal(gateway2);
    });
  });
  
  describe('Template Management', () => {
    it('should have default templates', () => {
      const restGateway = factory.createFromTemplate('https://api.example.com', 'rest');
      expect(restGateway.config.headers.Accept).to.equal('application/json');
      expect(restGateway.config.caching).to.be.an('object');
    });
    
    it('should allow registering custom templates', () => {
      factory.registerTemplate('custom', { timeout: 5000, retries: 5 });
      const gateway = factory.createFromTemplate('https://api.example.com', 'custom');
      expect(gateway.config.timeout).to.equal(5000);
      expect(gateway.config.retries).to.equal(5);
    });
    
    it('should throw error for unknown template', () => {
      expect(() => {
        factory.createFromTemplate('https://api.example.com', 'unknown');
      }).to.throw('Template \'unknown\' not found');
    });
  });
  
  describe('Gateway Management', () => {
    it('should list all active gateways', () => {
      factory.create('https://api1.example.com');
      factory.create('https://api2.example.com');
      const all = factory.getAll();
      expect(all).to.have.lengthOf(2);
      expect(all[0]).to.have.property('url');
      expect(all[0]).to.have.property('stats');
    });
    
    it('should remove specific gateway', () => {
      factory.create('https://api.example.com');
      const removed = factory.remove('https://api.example.com');
      expect(removed).to.be.true;
      const all = factory.getAll();
      expect(all).to.have.lengthOf(0);
    });
    
    it('should clear all gateways', () => {
      factory.create('https://api1.example.com');
      factory.create('https://api2.example.com');
      factory.clearAll();
      const all = factory.getAll();
      expect(all).to.have.lengthOf(0);
    });
  });
});

describe('Unit: RateLimiter', () => {
  it('should limit requests according to configuration', async () => {
    const gateway = new APIGateway('https://api.example.com', {
      rateLimit: { maxRequests: 2, windowMs: 100 }
    });
    
    const start = Date.now();
    const promises = [];
    
    // Create 4 requests
    for (let i = 0; i < 4; i++) {
      promises.push(gateway.rateLimiter.acquire());
    }
    
    await Promise.all(promises);
    const elapsed = Date.now() - start;
    
    // Should take at least 100ms for the second batch
    expect(elapsed).to.be.at.least(100);
  });
});

describe('Unit: CacheManager', () => {
  it('should cache and retrieve data', async () => {
    const gateway = new APIGateway('https://api.example.com', {
      caching: { ttl: 1000, maxSize: 10 }
    });
    
    await gateway.cache.set('key1', { data: 'test' });
    const cached = await gateway.cache.get('key1');
    expect(cached).to.deep.equal({ data: 'test' });
  });
  
  it('should expire cached data after TTL', async () => {
    const gateway = new APIGateway('https://api.example.com', {
      caching: { ttl: 50, maxSize: 10 }
    });
    
    await gateway.cache.set('key1', { data: 'test' });
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 60));
    
    const cached = await gateway.cache.get('key1');
    expect(cached).to.be.null;
  });
  
  it('should enforce max cache size', async () => {
    const gateway = new APIGateway('https://api.example.com', {
      caching: { ttl: 1000, maxSize: 2 }
    });
    
    await gateway.cache.set('key1', 'data1');
    await gateway.cache.set('key2', 'data2');
    await gateway.cache.set('key3', 'data3');
    
    // First key should be evicted
    const cached1 = await gateway.cache.get('key1');
    const cached2 = await gateway.cache.get('key2');
    const cached3 = await gateway.cache.get('key3');
    
    expect(cached1).to.be.null;
    expect(cached2).to.equal('data2');
    expect(cached3).to.equal('data3');
  });
});