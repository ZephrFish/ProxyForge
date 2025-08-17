// Integration tests for ProxyForge extension

describe('Integration: Extension Flow', () => {
  describe('Proxy Activation Flow', () => {
    it('should enable proxy and update Chrome settings', async () => {
      // Send enable message
      const response = await chrome.runtime.sendMessage({ type: 'enable' });
      expect(response.success).to.be.true;
      
      // Verify proxy settings were updated
      const proxySettings = await chrome.proxy.settings.get({});
      expect(proxySettings.value).to.not.be.null;
    });
    
    it('should disable proxy and clear settings', async () => {
      // Enable first
      await chrome.runtime.sendMessage({ type: 'enable' });
      
      // Then disable
      const response = await chrome.runtime.sendMessage({ type: 'disable' });
      expect(response.success).to.be.true;
      
      // Verify proxy settings were cleared
      const proxySettings = await chrome.proxy.settings.get({});
      expect(proxySettings.value).to.be.null;
    });
  });
  
  describe('Auto-Rotation Flow', () => {
    it('should enable auto-rotation and start monitoring', async () => {
      // Enable auto-rotation
      const response = await chrome.runtime.sendMessage({ type: 'enableAutoRotate' });
      expect(response.success).to.be.true;
      
      // Check status
      const status = await chrome.runtime.sendMessage({ type: 'getAutoRotateStatus' });
      expect(status.enabled).to.be.true;
    });
    
    it('should add domain to whitelist', async () => {
      // Add domain
      const response = await chrome.runtime.sendMessage({ 
        type: 'addToWhitelist',
        domain: 'example.com'
      });
      expect(response.success).to.be.true;
      
      // Verify it was added
      const status = await chrome.runtime.sendMessage({ type: 'getAutoRotateStatus' });
      expect(status.whitelist).to.include('example.com');
    });
    
    it('should remove domain from whitelist', async () => {
      // Add domain first
      await chrome.runtime.sendMessage({ 
        type: 'addToWhitelist',
        domain: 'example.com'
      });
      
      // Remove domain
      const response = await chrome.runtime.sendMessage({ 
        type: 'removeFromWhitelist',
        domain: 'example.com'
      });
      expect(response.success).to.be.true;
      
      // Verify it was removed
      const status = await chrome.runtime.sendMessage({ type: 'getAutoRotateStatus' });
      expect(status.whitelist).to.not.include('example.com');
    });
  });
  
  describe('Gateway Management Flow', () => {
    it('should create API gateway', async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'createAPIGateway',
        url: 'https://api.example.com',
        config: { timeout: 30000 }
      });
      
      // This would succeed if gateway creation logic is working
      expect(response).to.have.property('success');
    });
    
    it('should list all gateways', async () => {
      // Create a gateway first
      await chrome.runtime.sendMessage({
        type: 'createAPIGateway',
        url: 'https://api.example.com',
        config: {}
      });
      
      // List gateways
      const response = await chrome.runtime.sendMessage({ type: 'getAllGateways' });
      expect(response).to.have.property('success');
      expect(response).to.have.property('gateways');
    });
    
    it('should generate REST endpoints', async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'autoGenerateREST',
        url: 'https://api.example.com',
        resource: '/users'
      });
      
      expect(response).to.have.property('success');
      if (response.success) {
        expect(response).to.have.property('endpoints');
      }
    });
  });
  
  describe('Storage Persistence', () => {
    it('should persist settings across sessions', async () => {
      // Set some settings
      await chrome.runtime.sendMessage({
        type: 'updateRotationMode',
        mode: 'random'
      });
      
      await chrome.runtime.sendMessage({
        type: 'updateRotationFrequency',
        frequency: 5
      });
      
      // Get status to verify persistence
      const status = await chrome.runtime.sendMessage({ type: 'getStatus' });
      expect(status.rotationMode).to.equal('random');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid message types gracefully', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'invalidType' });
      expect(response.error).to.equal('Unknown request type');
    });
    
    it('should handle malformed URLs', async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'createAPIGateway',
        url: 'not-a-valid-url',
        config: {}
      });
      
      expect(response.success).to.be.false;
      expect(response).to.have.property('error');
    });
  });
});

describe('Integration: Local Proxy Connection', () => {
  describe('Connection Flow', () => {
    it('should check local proxy connection', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'checkLocalProxy' });
      expect(response).to.have.property('connected');
      expect(response).to.have.property('message');
    });
    
    it('should toggle local proxy usage', async () => {
      // Enable local proxy
      let response = await chrome.runtime.sendMessage({ 
        type: 'toggleLocalProxy',
        enabled: true
      });
      expect(response.success).to.be.true;
      expect(response.enabled).to.be.true;
      
      // Disable local proxy
      response = await chrome.runtime.sendMessage({ 
        type: 'toggleLocalProxy',
        enabled: false
      });
      expect(response.success).to.be.true;
      expect(response.enabled).to.be.false;
    });
  });
});

describe('Integration: UI State Synchronization', () => {
  it('should update UI when proxy is rotated', (done) => {
    // Listen for proxy rotation message
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'proxyRotated') {
        expect(message).to.have.property('currentProxy');
        expect(message).to.have.property('stats');
        done();
      }
    });
    
    // Trigger rotation
    chrome.runtime.sendMessage({ type: 'rotate' });
  });
  
  it('should get current tab domain', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'getCurrentTabDomain' });
    expect(response).to.have.property('success');
    if (response.success) {
      expect(response).to.have.property('domain');
    }
  });
});

describe('Integration: End-to-End Workflow', () => {
  it('should complete full proxy rotation workflow', async () => {
    // 1. Check initial status
    let status = await chrome.runtime.sendMessage({ type: 'getStatus' });
    expect(status).to.have.property('isEnabled');
    
    // 2. Enable proxy
    await chrome.runtime.sendMessage({ type: 'enable' });
    
    // 3. Enable auto-rotation
    await chrome.runtime.sendMessage({ type: 'enableAutoRotate' });
    
    // 4. Add domain to whitelist
    await chrome.runtime.sendMessage({
      type: 'addToWhitelist',
      domain: 'test.com'
    });
    
    // 5. Rotate proxy
    const rotateResponse = await chrome.runtime.sendMessage({ type: 'rotate' });
    expect(rotateResponse.success).to.be.true;
    
    // 6. Check final status
    status = await chrome.runtime.sendMessage({ type: 'getStatus' });
    expect(status.isEnabled).to.be.true;
    
    // 7. Cleanup - disable everything
    await chrome.runtime.sendMessage({ type: 'disableAutoRotate' });
    await chrome.runtime.sendMessage({ type: 'disable' });
  });
});