// Local Proxy Connector for ProxyForge
// Connects to the local AWS proxy rotator service

class LocalProxyConnector {
  constructor() {
    this.localProxyHost = '127.0.0.1';
    this.localProxyPort = 8888;
    this.managementPort = 8889; // Management API port
    this.isConnected = false;
    this.activeGateways = [];
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  // Check if local proxy service is running
  async checkConnection() {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.isConnected = true;
        this.activeGateways = data.gateways || [];
        this.connectionRetries = 0;
        return {
          connected: true,
          gateways: this.activeGateways,
          message: 'Connected to local proxy service'
        };
      }
    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;
      
      if (this.connectionRetries < this.maxRetries) {
        // Retry connection
        setTimeout(() => this.checkConnection(), 2000);
      }
      
      return {
        connected: false,
        error: 'Local proxy service not running',
        message: 'Please start the proxy-rotator service'
      };
    }
  }

  // Get proxy configuration for Chrome
  getProxyConfig() {
    if (!this.isConnected) {
      return { mode: 'direct' };
    }

    return {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: 'http',
          host: this.localProxyHost,
          port: this.localProxyPort
        },
        bypassList: [
          'localhost',
          '127.0.0.1',
          '*.local',
          '<local>'
        ]
      }
    };
  }

  // Request a new API Gateway to be created
  async createGateway(targetUrl, region = 'us-east-1') {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/create-gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_url: targetUrl,
          region: region
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          gateway: data.gateway,
          message: `Gateway created in ${region}`
        };
      } else {
        const error = await response.text();
        return {
          success: false,
          error: error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to create gateway: ' + error.message
      };
    }
  }

  // Delete an API Gateway
  async deleteGateway(apiId, region) {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/delete-gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_id: apiId,
          region: region
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Gateway deleted'
        };
      } else {
        const error = await response.text();
        return {
          success: false,
          error: error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to delete gateway: ' + error.message
      };
    }
  }

  // Get list of active gateways
  async listGateways() {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/list-gateways`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.activeGateways = data.gateways || [];
        return {
          success: true,
          gateways: this.activeGateways
        };
      } else {
        return {
          success: false,
          error: 'Failed to list gateways'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Service not available'
      };
    }
  }

  // Rotate to next gateway
  async rotateGateway() {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          currentGateway: data.current_gateway,
          message: 'Rotated to next gateway'
        };
      } else {
        return {
          success: false,
          error: 'Failed to rotate gateway'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Service not available'
      };
    }
  }

  // Get current statistics
  async getStats() {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          stats: data
        };
      } else {
        return {
          success: false,
          error: 'Failed to get stats'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Service not available'
      };
    }
  }

  // Update local proxy settings
  async updateSettings(settings) {
    try {
      const response = await fetch(`http://${this.localProxyHost}:${this.managementPort}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Settings updated'
        };
      } else {
        return {
          success: false,
          error: 'Failed to update settings'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Service not available'
      };
    }
  }
}

// Export for use in extension
export { LocalProxyConnector };