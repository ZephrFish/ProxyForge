#!/usr/bin/env python3
"""
Management API Server for AWS Proxy Rotator
Provides HTTP API for browser extension to control proxy operations
"""

import asyncio
import json
import logging
from aiohttp import web
from pathlib import Path
import sys
from datetime import datetime
from typing import Dict

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
try:
    from config import (
        DEFAULT_PROXY_PORT, DEFAULT_MANAGEMENT_PORT,
        DEFAULT_HOST, LOG_LEVEL
    )
except ImportError:
    # Fallback to defaults
    DEFAULT_PROXY_PORT = 8888
    DEFAULT_MANAGEMENT_PORT = 8889
    DEFAULT_HOST = "127.0.0.1"
    LOG_LEVEL = "INFO"

from api_proxy_manager import APIProxyManager
from local_proxy import SimpleHTTPProxy
from validators import validate_url, validate_region, ValidationError
from errors import error_response, handle_aws_error, ProxyRotatorError

logging.basicConfig(level=getattr(logging, LOG_LEVEL))
logger = logging.getLogger(__name__)


class ProxyManagementServer:
    """HTTP API server for managing proxy operations"""
    
    def __init__(self, base_dir: Path = None, management_port: int = None, proxy_port: int = None):
        self.base_dir = base_dir or Path(__file__).parent.parent
        self.management_port = management_port or DEFAULT_MANAGEMENT_PORT
        self.proxy_port = proxy_port or DEFAULT_PROXY_PORT
        self.proxy_manager = APIProxyManager(base_dir)
        self.proxy_server = SimpleHTTPProxy(base_dir, proxy_port)
        self.proxy_task = None
        
    async def handle_cors(self, request):
        """Add CORS headers for browser extension"""
        return web.Response(
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        )
    
    async def status(self, request):
        """Get current proxy status"""
        try:
            self.proxy_server.load_proxy_endpoints()
            gateways = []
            
            # Load gateway information
            if self.proxy_server.proxies_file.exists():
                with open(self.proxy_server.proxies_file, 'r') as f:
                    data = json.load(f)
                    for region, proxies in data.get('gateways', {}).items():
                        for proxy in proxies:
                            gateways.append({
                                'api_id': proxy.get('api_id'),
                                'region': region,
                                'target': proxy.get('target_url'),
                                'status': proxy.get('status'),
                                'proxy_url': proxy.get('proxy_url')
                            })
            
            return web.json_response({
                'connected': True,
                'proxy_port': self.proxy_port,
                'management_port': self.management_port,
                'gateways': gateways,
                'active_count': len(gateways),
                'proxy_running': self.proxy_task is not None and not self.proxy_task.done()
            }, headers={'Access-Control-Allow-Origin': '*'})
            
        except Exception as e:
            logger.error(f"Status error: {e}")
            return web.json_response({
                'connected': False,
                'error': str(e)
            }, status=500, headers={'Access-Control-Allow-Origin': '*'})
    
    async def create_gateway(self, request):
        """Create a new API Gateway proxy"""
        try:
            data = await request.json()
            
            # Validate inputs
            try:
                target_url = validate_url(data.get('target_url', 'https://httpbin.org'))
                region = validate_region(data.get('region', 'us-east-1'))
            except ValidationError as e:
                return error_response(e)
            
            # Initialize AWS client
            if not self.proxy_manager.init_aws_client(region):
                from errors import AuthenticationError
                return error_response(
                    AuthenticationError('Failed to initialize AWS client. Check credentials.')
                )
            
            # Create the gateway
            try:
                result = self.proxy_manager.create_proxy(target_url, region)
            except Exception as e:
                handle_aws_error(e)
            
            if result:
                # Reload proxy endpoints
                self.proxy_server.load_proxy_endpoints()
                
                return web.json_response({
                    'success': True,
                    'gateway': {
                        'api_id': result.get('api_id'),
                        'region': region,
                        'target': target_url,
                        'proxy_url': result.get('proxy_url'),
                        'status': 'active'
                    },
                    'message': f'Gateway created in {region}'
                }, headers={'Access-Control-Allow-Origin': '*'})
            else:
                from errors import ProxyRotatorError
                return error_response(
                    ProxyRotatorError('Failed to create gateway')
                )
                
        except ProxyRotatorError as e:
            return error_response(e)
        except Exception as e:
            logger.error(f"Create gateway error: {e}", exc_info=True)
            return error_response(e)
    
    async def delete_gateway(self, request):
        """Delete an API Gateway proxy"""
        try:
            data = await request.json()
            api_id = data.get('api_id')
            region = data.get('region', 'us-east-1')
            
            if not api_id:
                return web.json_response({
                    'success': False,
                    'error': 'api_id is required'
                }, status=400, headers={'Access-Control-Allow-Origin': '*'})
            
            # Initialize AWS client
            if not self.proxy_manager.init_aws_client(region):
                return web.json_response({
                    'success': False,
                    'error': 'Failed to initialize AWS client'
                }, status=500, headers={'Access-Control-Allow-Origin': '*'})
            
            # Delete the gateway
            success = self.proxy_manager.delete_proxy(api_id, region)
            
            if success:
                # Reload proxy endpoints
                self.proxy_server.load_proxy_endpoints()
                
                return web.json_response({
                    'success': True,
                    'message': f'Gateway {api_id} deleted'
                }, headers={'Access-Control-Allow-Origin': '*'})
            else:
                return web.json_response({
                    'success': False,
                    'error': 'Failed to delete gateway'
                }, status=500, headers={'Access-Control-Allow-Origin': '*'})
                
        except Exception as e:
            logger.error(f"Delete gateway error: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500, headers={'Access-Control-Allow-Origin': '*'})
    
    async def list_gateways(self, request):
        """List all active gateways"""
        try:
            gateways = []
            
            if self.proxy_server.proxies_file.exists():
                with open(self.proxy_server.proxies_file, 'r') as f:
                    data = json.load(f)
                    for region, proxies in data.get('gateways', {}).items():
                        for proxy in proxies:
                            if proxy.get('status') == 'active':
                                gateways.append({
                                    'api_id': proxy.get('api_id'),
                                    'region': region,
                                    'target': proxy.get('target_url'),
                                    'proxy_url': proxy.get('proxy_url'),
                                    'status': proxy.get('status'),
                                    'created': proxy.get('created_at')
                                })
            
            return web.json_response({
                'success': True,
                'gateways': gateways,
                'count': len(gateways)
            }, headers={'Access-Control-Allow-Origin': '*'})
            
        except Exception as e:
            logger.error(f"List gateways error: {e}")
            return web.json_response({
                'success': False,
                'error': str(e),
                'gateways': []
            }, status=500, headers={'Access-Control-Allow-Origin': '*'})
    
    async def rotate_gateway(self, request):
        """Force rotation to next gateway"""
        try:
            current = self.proxy_server.get_next_proxy()
            
            if current:
                return web.json_response({
                    'success': True,
                    'current_gateway': {
                        'url': current.get('url'),
                        'region': current.get('region'),
                        'api_id': current.get('api_id')
                    },
                    'message': 'Rotated to next gateway'
                }, headers={'Access-Control-Allow-Origin': '*'})
            else:
                return web.json_response({
                    'success': False,
                    'error': 'No gateways available'
                }, status=404, headers={'Access-Control-Allow-Origin': '*'})
                
        except Exception as e:
            logger.error(f"Rotate error: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500, headers={'Access-Control-Allow-Origin': '*'})
    
    async def get_stats(self, request):
        """Get proxy statistics"""
        try:
            stats = {
                'total_requests': self.proxy_server.request_count,
                'active_gateways': len(self.proxy_server.proxy_endpoints),
                'uptime': int((datetime.now() - datetime.fromtimestamp(
                    self.proxy_server.request_count)).total_seconds()) if self.proxy_server.request_count > 0 else 0
            }
            
            return web.json_response({
                'success': True,
                **stats
            }, headers={'Access-Control-Allow-Origin': '*'})
            
        except Exception as e:
            logger.error(f"Stats error: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500, headers={'Access-Control-Allow-Origin': '*'})
    
    async def update_settings(self, request):
        """Update proxy settings"""
        try:
            data = await request.json()
            
            # Update any settings here
            # For example: rotation mode, frequency, etc.
            
            return web.json_response({
                'success': True,
                'message': 'Settings updated'
            }, headers={'Access-Control-Allow-Origin': '*'})
            
        except Exception as e:
            logger.error(f"Settings error: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500, headers={'Access-Control-Allow-Origin': '*'})
    
    async def start_proxy_server(self, app):
        """Start the proxy server in background"""
        try:
            self.proxy_task = asyncio.create_task(self.proxy_server.start())
            logger.info(f"Proxy server starting on port {self.proxy_port}")
        except Exception as e:
            logger.error(f"Failed to start proxy server: {e}")
    
    async def cleanup(self, app):
        """Cleanup on shutdown"""
        if self.proxy_task and not self.proxy_task.done():
            self.proxy_task.cancel()
            try:
                await self.proxy_task
            except asyncio.CancelledError:
                pass
    
    async def start(self):
        """Start the management server"""
        app = web.Application()
        
        # Add routes
        app.router.add_options('/{path:.*}', self.handle_cors)  # Handle CORS preflight
        app.router.add_get('/status', self.status)
        app.router.add_get('/list-gateways', self.list_gateways)
        app.router.add_get('/stats', self.get_stats)
        app.router.add_post('/create-gateway', self.create_gateway)
        app.router.add_post('/delete-gateway', self.delete_gateway)
        app.router.add_post('/rotate', self.rotate_gateway)
        app.router.add_post('/settings', self.update_settings)
        
        # Start proxy server in background
        app.on_startup.append(self.start_proxy_server)
        app.on_cleanup.append(self.cleanup)
        
        # Start management server
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', self.management_port)
        
        print(f"\nAWS Proxy Rotator Management Server")
        print(f"=" * 50)
        print(f"Management API: http://127.0.0.1:{self.management_port}")
        print(f"Proxy Server: http://127.0.0.1:{self.proxy_port}")
        print(f"Browser Extension: Ready to connect")
        print(f"=" * 50)
        print(f"\nAPI Endpoints:")
        print(f"  GET  /status         - Check server status")
        print(f"  GET  /list-gateways  - List all gateways")
        print(f"  POST /create-gateway - Create new gateway")
        print(f"  POST /delete-gateway - Delete gateway")
        print(f"  POST /rotate         - Force rotation")
        print(f"\nServer is running. Press Ctrl+C to stop.\n")
        
        await site.start()
        
        # Keep running
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            print("\n\nShutting down servers...")
        finally:
            await runner.cleanup()


async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='AWS Proxy Rotator Management Server')
    parser.add_argument('--management-port', type=int, default=8889,
                       help='Management API port (default: 8889)')
    parser.add_argument('--proxy-port', type=int, default=8888,
                       help='Proxy server port (default: 8888)')
    parser.add_argument('--base-dir', type=Path, default=Path.cwd(),
                       help='Base directory for configuration')
    
    args = parser.parse_args()
    
    server = ProxyManagementServer(
        base_dir=args.base_dir,
        management_port=args.management_port,
        proxy_port=args.proxy_port
    )
    
    await server.start()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nGoodbye!")
        sys.exit(0)