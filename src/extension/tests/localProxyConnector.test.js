// Unit tests for Local Proxy Connector
import { LocalProxyConnector } from '../localProxyConnector.js';

describe('Unit: LocalProxyConnector', () => {
  let connector;
  let fetchStub;
  
  beforeEach(() => {
    connector = new LocalProxyConnector();
    // Stub fetch for testing
    fetchStub = sinon.stub(window, 'fetch');
  });
  
  afterEach(() => {
    fetchStub.restore();
  });
  
  describe('Connection Management', () => {
    it('should initialize with correct default values', () => {
      expect(connector.localProxyHost).to.equal('127.0.0.1');
      expect(connector.localProxyPort).to.equal(8888);
      expect(connector.managementPort).to.equal(8889);
      expect(connector.isConnected).to.be.false;
      expect(connector.activeGateways).to.be.empty;
    });
    
    it('should check connection successfully', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ gateways: ['gateway1', 'gateway2'] })
      });
      
      const result = await connector.checkConnection();
      
      expect(result.connected).to.be.true;
      expect(result.message).to.equal('Connected to local proxy service');
      expect(connector.isConnected).to.be.true;
      expect(connector.activeGateways).to.have.lengthOf(2);
    });
    
    it('should handle connection failure', async () => {
      fetchStub.rejects(new Error('Connection refused'));
      
      const result = await connector.checkConnection();
      
      expect(result.connected).to.be.false;
      expect(result.error).to.equal('Local proxy service not running');
      expect(connector.isConnected).to.be.false;
    });
    
    it('should retry connection on failure', async () => {
      const clock = sinon.useFakeTimers();
      fetchStub.rejects(new Error('Connection refused'));
      
      await connector.checkConnection();
      expect(connector.connectionRetries).to.equal(1);
      
      clock.tick(2000);
      await Promise.resolve(); // Let promises settle
      
      clock.restore();
    });
  });
  
  describe('Proxy Configuration', () => {
    it('should return direct mode when not connected', () => {
      connector.isConnected = false;
      const config = connector.getProxyConfig();
      expect(config.mode).to.equal('direct');
    });
    
    it('should return proper proxy config when connected', () => {
      connector.isConnected = true;
      const config = connector.getProxyConfig();
      
      expect(config.mode).to.equal('fixed_servers');
      expect(config.rules.singleProxy).to.deep.equal({
        scheme: 'http',
        host: '127.0.0.1',
        port: 8888
      });
      expect(config.rules.bypassList).to.include('localhost');
      expect(config.rules.bypassList).to.include('127.0.0.1');
    });
  });
  
  describe('Gateway Management', () => {
    it('should create gateway successfully', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ 
          gateway: { id: 'gw-123', url: 'https://api.gateway.com' }
        })
      });
      
      const result = await connector.createGateway('https://example.com', 'us-east-1');
      
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Gateway created in us-east-1');
      expect(result.gateway).to.have.property('id', 'gw-123');
      
      // Verify fetch was called correctly
      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal('http://127.0.0.1:8889/create-gateway');
      expect(options.method).to.equal('POST');
      expect(JSON.parse(options.body)).to.deep.equal({
        target_url: 'https://example.com',
        region: 'us-east-1'
      });
    });
    
    it('should handle gateway creation failure', async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => 'Invalid target URL'
      });
      
      const result = await connector.createGateway('invalid-url', 'us-east-1');
      
      expect(result.success).to.be.false;
      expect(result.error).to.equal('Invalid target URL');
    });
    
    it('should delete gateway successfully', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ success: true })
      });
      
      const result = await connector.deleteGateway('api-123', 'us-east-1');
      
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Gateway deleted');
    });
    
    it('should list gateways successfully', async () => {
      const mockGateways = [
        { api_id: 'gw-1', region: 'us-east-1', target: 'https://example1.com' },
        { api_id: 'gw-2', region: 'us-west-2', target: 'https://example2.com' }
      ];
      
      fetchStub.resolves({
        ok: true,
        json: async () => ({ gateways: mockGateways })
      });
      
      const result = await connector.listGateways();
      
      expect(result.success).to.be.true;
      expect(result.gateways).to.have.lengthOf(2);
      expect(connector.activeGateways).to.deep.equal(mockGateways);
    });
  });
  
  describe('Gateway Rotation', () => {
    it('should rotate gateway successfully', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ 
          current_gateway: { api_id: 'gw-2', region: 'us-west-2' }
        })
      });
      
      const result = await connector.rotateGateway();
      
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Rotated to next gateway');
      expect(result.currentGateway).to.have.property('api_id', 'gw-2');
    });
    
    it('should handle rotation failure', async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => 'No gateways available'
      });
      
      const result = await connector.rotateGateway();
      
      expect(result.success).to.be.false;
      expect(result.error).to.equal('Failed to rotate gateway');
    });
  });
  
  describe('Statistics', () => {
    it('should retrieve statistics successfully', async () => {
      const mockStats = {
        totalRequests: 100,
        totalRotations: 25,
        uptime: 3600000,
        averageLatency: 150
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => mockStats
      });
      
      const result = await connector.getStats();
      
      expect(result.success).to.be.true;
      expect(result.stats).to.deep.equal(mockStats);
    });
  });
  
  describe('Settings Management', () => {
    it('should update settings successfully', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ success: true })
      });
      
      const settings = {
        rotationMode: 'random',
        rotateEveryNRequests: 5
      };
      
      const result = await connector.updateSettings(settings);
      
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Settings updated');
      
      // Verify settings were sent correctly
      const [url, options] = fetchStub.firstCall.args;
      expect(JSON.parse(options.body)).to.deep.equal(settings);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      fetchStub.rejects(new Error('Network error'));
      
      const result = await connector.createGateway('https://example.com');
      
      expect(result.success).to.be.false;
      expect(result.error).to.include('Failed to create gateway');
    });
    
    it('should handle service unavailable', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      
      const result = await connector.getStats();
      
      expect(result.success).to.be.false;
      expect(result.error).to.equal('Service not available');
    });
  });
});