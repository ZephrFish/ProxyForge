#!/usr/bin/env python3
"""
Simple HTTP Proxy for AWS Proxy Rotator
Routes HTTP traffic through rotating AWS API Gateway endpoints
"""

import asyncio
import aiohttp
from aiohttp import web
import logging
import json
from pathlib import Path
from urllib.parse import urlparse
import ssl
import certifi

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SimpleHTTPProxy:
    """Simple HTTP proxy that routes through API Gateways"""
    
    def __init__(self, base_dir: Path, port: int = 8888):
        self.base_dir = base_dir
        self.port = port
        self.state_dir = base_dir / "state"
        self.proxies_file = self.state_dir / "api_proxies.json"
        self.proxy_endpoints = []
        self.request_count = 0
        
    def load_proxy_endpoints(self):
        """Load available API Gateway proxy endpoints"""
        if self.proxies_file.exists():
            with open(self.proxies_file, "r") as f:
                data = json.load(f)
                for region, proxies in data.get("gateways", {}).items():
                    for proxy in proxies:
                        if proxy.get("status") == "active":
                            # Add all active proxies
                            self.proxy_endpoints.append({
                                "url": proxy["proxy_url"],
                                "target": proxy["target_url"],
                                "region": region,
                                "api_id": proxy["api_id"]
                            })
        
        if not self.proxy_endpoints:
            logger.error("No suitable API Gateway proxies found.")
            logger.info("Create proxies with: ./proxy-rotator create --url https://httpbin.org --regions us-east-1,us-west-2,eu-west-1")
        else:
            logger.info(f"Loaded {len(self.proxy_endpoints)} proxy endpoints")
            for p in self.proxy_endpoints:
                logger.info(f"  - {p['region']}: {p['api_id']} => {p['target']}")

    def get_next_proxy(self):
        """Get next proxy in round-robin fashion"""
        if not self.proxy_endpoints:
            return None
        proxy = self.proxy_endpoints[self.request_count % len(self.proxy_endpoints)]
        self.request_count += 1
        return proxy

    async def proxy_request(self, request):
        """Proxy the HTTP request through an API Gateway"""
        try:
            # Get next proxy endpoint
            proxy = self.get_next_proxy()
            if not proxy:
                return web.Response(text="No proxies available", status=503)
            
            # Parse the incoming request
            # For proxy requests, the full URL is in the path
            if request.path.startswith('http'):
                target_url = request.path
            else:
                # Regular path request
                target_url = f"http://{request.headers.get('Host', 'httpbin.org')}{request.path_qs}"
            
            # Extract just the path from the target URL
            parsed = urlparse(target_url)
            path = parsed.path or '/'
            if parsed.query:
                path += '?' + parsed.query
            
            # Build the gateway URL
            gateway_url = proxy['url'].rstrip('/') + path
            
            logger.info(f"[{proxy['region']}] {request.method} {target_url} => {gateway_url}")
            
            # Prepare headers
            headers = dict(request.headers)
            # Remove hop-by-hop headers
            for h in ['host', 'connection', 'keep-alive', 'proxy-authenticate', 
                     'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade']:
                headers.pop(h, None)
            
            # Make the request through the API Gateway
            async with aiohttp.ClientSession() as session:
                body = await request.read() if request.body_exists else None
                
                async with session.request(
                    method=request.method,
                    url=gateway_url,
                    headers=headers,
                    data=body,
                    allow_redirects=False,
                    ssl=ssl.create_default_context(cafile=certifi.where()),
                    timeout=aiohttp.ClientTimeout(total=PROXY_TIMEOUT)
                ) as resp:
                    response_body = await resp.read()
                    
                    # Build response
                    response_headers = dict(resp.headers)
                    # Remove hop-by-hop headers from response
                    for h in ['connection', 'keep-alive', 'transfer-encoding']:
                        response_headers.pop(h, None)
                    
                    return web.Response(
                        body=response_body,
                        status=resp.status,
                        headers=response_headers
                    )
                    
        except asyncio.TimeoutError:
            logger.error("Request timeout")
            return web.Response(text="Gateway Timeout", status=504)
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            return web.Response(text=f"Proxy Error: {str(e)}", status=502)

    async def handle_connect(self, request):
        """Handle CONNECT method for HTTPS"""
        # CONNECT requires establishing a TCP tunnel which is complex
        # For now, we'll just acknowledge it
        logger.info(f"CONNECT {request.path}")
        return web.Response(status=200)

    async def start(self):
        """Start the proxy server"""
        self.load_proxy_endpoints()
        
        if not self.proxy_endpoints:
            print("\nNo proxies found. Run: ./proxy-rotator create --url <target>")
            return
        
        app = web.Application()
        
        # Handle all requests
        app.router.add_route('*', '/{path:.*}', self.proxy_request)
        
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', self.port)
        await site.start()
        
        print(f"\nProxy server started on localhost:{self.port}")
        print(f"Active gateways: {len(self.proxy_endpoints)}")
        print(f"Test: curl -x http://localhost:{self.port} http://httpbin.org/ip")
        print(f"Press Ctrl+C to stop\n")
        
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            pass  # Server stopped
            await runner.cleanup()


def main():
    """Main entry point"""
    import sys
    base_dir = Path(__file__).parent.parent
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
    
    proxy = SimpleHTTPProxy(base_dir, port)
    try:
        asyncio.run(proxy.start())
    except KeyboardInterrupt:
        pass  # Shutting down


if __name__ == "__main__":
    main()