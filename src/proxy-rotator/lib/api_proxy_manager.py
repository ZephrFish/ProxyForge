#!/usr/bin/env python3
"""
API Gateway Proxy Manager for AWS Proxy Rotator
Provides IP rotation through AWS API Gateway endpoints
Based on FireProx concept - each request gets a different IP
"""

import boto3
import json
import logging
import tldextract
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import sys

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
try:
    from config import (
        STATE_DIR, PROXIES_FILE, DEFAULT_REGION, 
        GATEWAY_PREFIX, GATEWAY_STAGE, MAX_GATEWAYS_PER_REGION,
        AWS_PROFILE
    )
except ImportError:
    # Fallback to defaults if config not available
    STATE_DIR = Path(__file__).parent.parent / "state"
    PROXIES_FILE = STATE_DIR / "api_proxies.json"
    DEFAULT_REGION = "us-east-1"
    GATEWAY_PREFIX = "proxy_rotator"
    GATEWAY_STAGE = "prod"
    MAX_GATEWAYS_PER_REGION = 10
    AWS_PROFILE = "default"

logger = logging.getLogger(__name__)


class APIProxyManager:
    """Manages AWS API Gateway proxies for IP rotation"""

    def __init__(self, base_dir: Path = None):
        self.base_dir = base_dir or Path(__file__).parent.parent
        self.state_dir = STATE_DIR
        self.proxies_file = PROXIES_FILE
        self.client = None
        self.region = None
        self.load_proxies()

    def load_proxies(self):
        """Load existing proxy configurations"""
        if self.proxies_file.exists():
            with open(self.proxies_file, "r") as f:
                self.proxies = json.load(f)
        else:
            self.proxies = {"gateways": {}, "metadata": {}}

    def save_proxies(self):
        """Save proxy configurations"""
        self.proxies["metadata"]["last_updated"] = datetime.now().isoformat()
        with open(self.proxies_file, "w") as f:
            json.dump(self.proxies, f, indent=2, default=str)

    def init_aws_client(self, region: str = None, profile: Optional[str] = None):
        region = region or DEFAULT_REGION
        """Initialize AWS API Gateway client"""
        try:
            if profile:
                session = boto3.Session(profile_name=profile, region_name=region)
                self.client = session.client('apigateway')
            else:
                self.client = boto3.client('apigateway', region_name=region)
            
            self.region = region
            # Test connection
            self.client.get_account()
            return True
        except Exception as e:
            logger.error(f"Failed to initialize AWS client: {e}")
            return False

    def get_proxy_template(self, target_url: str, title: str = None) -> bytes:
        """Generate API Gateway swagger template for proxy"""
        if target_url[-1] == '/':
            target_url = target_url[:-1]

        if not title:
            title = f'proxy_rotator_{tldextract.extract(target_url).domain}'
        
        version_date = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        
        template = {
            "swagger": "2.0",
            "info": {
                "version": version_date,
                "title": title
            },
            "basePath": "/",
            "schemes": ["https"],
            "paths": {
                "/": {
                    "get": {
                        "parameters": [
                            {
                                "name": "proxy",
                                "in": "path",
                                "required": True,
                                "type": "string"
                            },
                            {
                                "name": "X-My-X-Forwarded-For",
                                "in": "header",
                                "required": False,
                                "type": "string"
                            }
                        ],
                        "responses": {},
                        "x-amazon-apigateway-integration": {
                            "uri": f"{target_url}/",
                            "responses": {
                                "default": {
                                    "statusCode": "200"
                                }
                            },
                            "requestParameters": {
                                "integration.request.path.proxy": "method.request.path.proxy",
                                "integration.request.header.X-Forwarded-For": "method.request.header.X-My-X-Forwarded-For"
                            },
                            "passthroughBehavior": "when_no_match",
                            "httpMethod": "ANY",
                            "cacheNamespace": "proxyrotator",
                            "cacheKeyParameters": ["method.request.path.proxy"],
                            "type": "http_proxy"
                        }
                    }
                },
                "/{proxy+}": {
                    "x-amazon-apigateway-any-method": {
                        "produces": ["application/json"],
                        "parameters": [
                            {
                                "name": "proxy",
                                "in": "path",
                                "required": True,
                                "type": "string"
                            },
                            {
                                "name": "X-My-X-Forwarded-For",
                                "in": "header",
                                "required": False,
                                "type": "string"
                            }
                        ],
                        "responses": {},
                        "x-amazon-apigateway-integration": {
                            "uri": f"{target_url}/{{proxy}}",
                            "responses": {
                                "default": {
                                    "statusCode": "200"
                                }
                            },
                            "requestParameters": {
                                "integration.request.path.proxy": "method.request.path.proxy",
                                "integration.request.header.X-Forwarded-For": "method.request.header.X-My-X-Forwarded-For"
                            },
                            "passthroughBehavior": "when_no_match",
                            "httpMethod": "ANY",
                            "cacheNamespace": "proxyrotator",
                            "cacheKeyParameters": ["method.request.path.proxy"],
                            "type": "http_proxy"
                        }
                    }
                }
            }
        }
        
        return json.dumps(template).encode('utf-8')

    def create_proxy(self, target_url: str, name: Optional[str] = None, regions: Optional[List[str]] = None) -> List[Dict]:
        """Create API Gateway proxy endpoints in specified regions"""
        if not regions:
            regions = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
        
        created_proxies = []
        
        for region in regions:
            try:
                logger.info(f"Creating proxy in {region} for {target_url}")
                
                # Initialize client for this region
                if not self.init_aws_client(region):
                    logger.error(f"Failed to initialize client for {region}")
                    continue
                
                # Generate template
                title = name or f"proxy_rotator_{region}"
                template = self.get_proxy_template(target_url, title)
                
                # Import REST API
                response = self.client.import_rest_api(
                    parameters={
                        'endpointConfigurationTypes': 'REGIONAL'
                    },
                    body=template
                )
                
                api_id = response['id']
                api_name = response['name']
                
                # Create deployment
                deployment = self.client.create_deployment(
                    restApiId=api_id,
                    stageName='proxyrotator',
                    stageDescription='AWS Proxy Rotator',
                    description='AWS Proxy Rotator Deployment'
                )
                
                # Generate proxy URL
                proxy_url = f"https://{api_id}.execute-api.{region}.amazonaws.com/proxyrotator/"
                
                proxy_info = {
                    "api_id": api_id,
                    "name": api_name,
                    "region": region,
                    "proxy_url": proxy_url,
                    "target_url": target_url,
                    "created_at": datetime.now().isoformat(),
                    "status": "active"
                }
                
                created_proxies.append(proxy_info)
                
                # Store in state
                if region not in self.proxies["gateways"]:
                    self.proxies["gateways"][region] = []
                self.proxies["gateways"][region].append(proxy_info)
                
                logger.info(f"\033[92mCreated proxy in {region}: {proxy_url} => {target_url}\033[0m")
                
            except Exception as e:
                logger.error(f"Failed to create proxy in {region}: {e}")
        
        self.save_proxies()
        return created_proxies

    def list_proxies(self, region: Optional[str] = None) -> List[Dict]:
        """List all API Gateway proxies"""
        proxies = []
        
        if region:
            regions = [region]
        else:
            # Get all regions with proxies
            regions = list(self.proxies["gateways"].keys())
        
        for region in regions:
            try:
                if not self.init_aws_client(region):
                    continue
                
                # Get APIs from AWS
                response = self.client.get_rest_apis()
                
                for item in response['items']:
                    if item['name'].startswith('proxy_rotator'):
                        api_id = item['id']
                        proxy_url = f"https://{api_id}.execute-api.{region}.amazonaws.com/proxyrotator/"
                        
                        # Try to get target URL from integration
                        try:
                            resources = self.client.get_resources(restApiId=api_id)
                            for resource in resources['items']:
                                if resource['path'] == '/{proxy+}':
                                    integration = self.client.get_integration(
                                        restApiId=api_id,
                                        resourceId=resource['id'],
                                        httpMethod='ANY'
                                    )
                                    target_url = integration['uri'].replace('/{proxy}', '')
                                    break
                        except:
                            target_url = "Unknown"
                        
                        proxy_info = {
                            "api_id": api_id,
                            "name": item['name'],
                            "region": region,
                            "proxy_url": proxy_url,
                            "target_url": target_url,
                            "created_at": item.get('createdDate', 'Unknown'),
                            "status": "active"
                        }
                        proxies.append(proxy_info)
                        
            except Exception as e:
                logger.error(f"Failed to list proxies in {region}: {e}")
        
        return proxies

    def delete_proxy(self, api_id: str, region: str) -> bool:
        """Delete an API Gateway proxy"""
        try:
            if not self.init_aws_client(region):
                return False
            
            response = self.client.delete_rest_api(restApiId=api_id)
            
            # Remove from state
            if region in self.proxies["gateways"]:
                self.proxies["gateways"][region] = [
                    p for p in self.proxies["gateways"][region] 
                    if p["api_id"] != api_id
                ]
            
            self.save_proxies()
            logger.info(f"Deleted proxy {api_id} in {region}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete proxy {api_id}: {e}")
            return False

    def delete_all_proxies(self, region: Optional[str] = None) -> int:
        """Delete all API Gateway proxies"""
        deleted_count = 0
        proxies = self.list_proxies(region)
        
        for proxy in proxies:
            if self.delete_proxy(proxy["api_id"], proxy["region"]):
                deleted_count += 1
        
        return deleted_count

    def update_proxy(self, api_id: str, region: str, new_target_url: str) -> bool:
        """Update the target URL of an existing proxy"""
        try:
            if not self.init_aws_client(region):
                return False
            
            if new_target_url[-1] == '/':
                new_target_url = new_target_url[:-1]
            
            # Get resource ID for /{proxy+} path
            resources = self.client.get_resources(restApiId=api_id)
            resource_id = None
            
            for resource in resources['items']:
                if resource['path'] == '/{proxy+}':
                    resource_id = resource['id']
                    break
            
            if not resource_id:
                logger.error(f"Could not find resource for API {api_id}")
                return False
            
            # Update integration
            response = self.client.update_integration(
                restApiId=api_id,
                resourceId=resource_id,
                httpMethod='ANY',
                patchOperations=[
                    {
                        'op': 'replace',
                        'path': '/uri',
                        'value': f'{new_target_url}/{{proxy}}',
                    },
                ]
            )
            
            # Redeploy
            self.client.create_deployment(
                restApiId=api_id,
                stageName='proxyrotator',
                description='Updated target URL'
            )
            
            # Update state
            if region in self.proxies["gateways"]:
                for proxy in self.proxies["gateways"][region]:
                    if proxy["api_id"] == api_id:
                        proxy["target_url"] = new_target_url
                        proxy["updated_at"] = datetime.now().isoformat()
            
            self.save_proxies()
            logger.info(f"Updated proxy {api_id} target to {new_target_url}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update proxy {api_id}: {e}")
            return False

    def get_random_proxy(self, region: Optional[str] = None) -> Optional[str]:
        """Get a random proxy URL from available proxies"""
        import random
        
        proxies = self.list_proxies(region)
        if proxies:
            selected = random.choice(proxies)
            return selected["proxy_url"]
        return None

    def rotate_proxy_ips(self, target_url: str, count: int = 5) -> List[str]:
        """Create multiple proxy endpoints for IP rotation"""
        regions = [
            "us-east-1", "us-west-1", "us-west-2", 
            "eu-west-1", "eu-central-1", "ap-southeast-1",
            "ap-northeast-1", "ca-central-1"
        ]
        
        # Select random regions up to count
        import random
        selected_regions = random.sample(regions, min(count, len(regions)))
        
        proxies = self.create_proxy(target_url, regions=selected_regions)
        
        return [p["proxy_url"] for p in proxies]

    def test_proxy(self, proxy_url: str) -> bool:
        """Test if a proxy is working"""
        try:
            import requests
            response = requests.get(proxy_url, timeout=10)
            return response.status_code < 500
        except Exception as e:
            logger.error(f"Proxy test failed for {proxy_url}: {e}")
            return False

    def get_proxy_stats(self) -> Dict:
        """Get statistics about proxies"""
        stats = {
            "total_proxies": 0,
            "by_region": {},
            "by_status": {"active": 0, "inactive": 0}
        }
        
        for region, proxies in self.proxies["gateways"].items():
            stats["by_region"][region] = len(proxies)
            stats["total_proxies"] += len(proxies)
            
            for proxy in proxies:
                if proxy.get("status") == "active":
                    stats["by_status"]["active"] += 1
                else:
                    stats["by_status"]["inactive"] += 1
        
        return stats