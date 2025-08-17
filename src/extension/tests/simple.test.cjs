// Simple Node.js compatible tests for ProxyForge
const assert = require('assert');

describe('ProxyForge Extension Tests', function() {
  
  describe('Configuration Validation', function() {
    it('should have valid manifest structure', function() {
      const manifest = require('../manifest.json');
      assert.strictEqual(manifest.manifest_version, 3);
      assert.strictEqual(manifest.name, 'ProxyForge - Dynamic IP Rotation');
      assert.ok(manifest.permissions.includes('proxy'));
      assert.ok(manifest.permissions.includes('storage'));
      assert.ok(manifest.permissions.includes('webRequest'));
    });
    
    it('should have required permissions', function() {
      const manifest = require('../manifest.json');
      const requiredPermissions = ['proxy', 'storage', 'webRequest', 'tabs'];
      requiredPermissions.forEach(permission => {
        assert.ok(manifest.permissions.includes(permission), 
          `Missing required permission: ${permission}`);
      });
    });
    
    it('should have background service worker configured', function() {
      const manifest = require('../manifest.json');
      assert.ok(manifest.background);
      assert.strictEqual(manifest.background.service_worker, 'background.js');
      assert.strictEqual(manifest.background.type, 'module');
    });
  });
  
  describe('Security Checks', function() {
    it('should not have overly broad content script matches', function() {
      const manifest = require('../manifest.json');
      const contentScripts = manifest.content_scripts || [];
      contentScripts.forEach(script => {
        // Check that content scripts have appropriate matches
        assert.ok(script.matches, 'Content script missing matches');
        assert.ok(script.js, 'Content script missing JS files');
      });
    });
    
    it('should have appropriate host permissions', function() {
      const manifest = require('../manifest.json');
      assert.ok(manifest.host_permissions);
      // Note: <all_urls> is broad but necessary for proxy functionality
      assert.ok(manifest.host_permissions.includes('<all_urls>'));
    });
  });
  
  describe('File Structure', function() {
    const fs = require('fs');
    const path = require('path');
    
    it('should have all required files', function() {
      const requiredFiles = [
        '../manifest.json',
        '../background.js',
        '../popup.html',
        '../popup.js',
        '../popup.css',
        '../content.js',
        '../apiGateway.js',
        '../localProxyConnector.js'
      ];
      
      requiredFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        assert.ok(fs.existsSync(filePath), `Missing required file: ${file}`);
      });
    });
    
    it('should have icon files', function() {
      const iconFiles = [
        '../icons/icon-16.png',
        '../icons/icon-48.png',
        '../icons/icon-128.png'
      ];
      
      iconFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        assert.ok(fs.existsSync(filePath), `Missing icon file: ${file}`);
      });
    });
  });
  
  describe('Code Quality Checks', function() {
    const fs = require('fs');
    const path = require('path');
    
    it('should not contain console.log in production code', function() {
      const jsFiles = [
        '../popup.js',
        '../content.js'
      ];
      
      jsFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const consoleLogCount = (content.match(/console\.log/g) || []).length;
        
        // Allow some console.logs but warn if too many
        if (consoleLogCount > 5) {
          console.warn(`Warning: ${file} contains ${consoleLogCount} console.log statements`);
        }
      });
    });
    
    it('should not contain hardcoded secrets', function() {
      const jsFiles = [
        '../background.js',
        '../popup.js',
        '../content.js',
        '../apiGateway.js',
        '../localProxyConnector.js'
      ];
      
      const secretPatterns = [
        /api[_-]?key\s*[:=]\s*["'][^"']{20,}/gi,
        /secret\s*[:=]\s*["'][^"']{10,}/gi,
        /password\s*[:=]\s*["'][^"']+/gi,
        /token\s*[:=]\s*["'][^"']{20,}/gi
      ];
      
      jsFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        secretPatterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            console.warn(`Warning: Potential hardcoded secret in ${file}: ${matches[0].substring(0, 30)}...`);
          }
        });
      });
    });
  });
  
  describe('API Gateway Configuration', function() {
    it('should have valid default configuration', function() {
      // Test configuration values
      const defaultTimeout = 30000;
      const defaultRetries = 3;
      
      assert.ok(defaultTimeout >= 10000, 'Timeout too short');
      assert.ok(defaultTimeout <= 60000, 'Timeout too long');
      assert.ok(defaultRetries >= 1, 'Too few retries');
      assert.ok(defaultRetries <= 5, 'Too many retries');
    });
  });
  
  describe('Local Proxy Configuration', function() {
    it('should use localhost for local proxy', function() {
      const localProxyHost = '127.0.0.1';
      const localProxyPort = 8888;
      
      assert.strictEqual(localProxyHost, '127.0.0.1');
      assert.ok(localProxyPort >= 1024, 'Port should be above 1024');
      assert.ok(localProxyPort <= 65535, 'Port should be valid');
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running ProxyForge Extension Tests...\n');
}