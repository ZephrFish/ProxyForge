"""
Input validation utilities for Proxy Rotator
"""

import re
from urllib.parse import urlparse
from typing import Optional, List
import ipaddress

# AWS region validation
AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
    'eu-north-1', 'eu-south-1', 'ap-south-1', 'ap-northeast-1',
    'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
    'ap-southeast-2', 'ap-east-1', 'ca-central-1',
    'sa-east-1', 'me-south-1', 'af-south-1'
]

# API ID pattern for AWS API Gateway
API_ID_PATTERN = re.compile(r'^[a-z0-9]{10}$')

# URL validation pattern
URL_PATTERN = re.compile(
    r'^https?://'  # http:// or https://
    r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
    r'localhost|'  # localhost...
    r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
    r'(?::\d+)?'  # optional port
    r'(?:/?|[/?]\S+)$', re.IGNORECASE
)

class ValidationError(Exception):
    """Raised when validation fails"""
    pass

def validate_url(url: str) -> str:
    """
    Validate and normalize URL
    
    Args:
        url: URL to validate
        
    Returns:
        Normalized URL
        
    Raises:
        ValidationError: If URL is invalid
    """
    if not url:
        raise ValidationError("URL cannot be empty")
    
    # Add scheme if missing
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    # Parse URL
    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            raise ValidationError(f"Invalid URL: {url}")
    except Exception as e:
        raise ValidationError(f"Invalid URL: {url} - {str(e)}")
    
    # Check against pattern
    if not URL_PATTERN.match(url):
        raise ValidationError(f"Invalid URL format: {url}")
    
    return url

def validate_region(region: str) -> str:
    """
    Validate AWS region
    
    Args:
        region: AWS region code
        
    Returns:
        Valid region
        
    Raises:
        ValidationError: If region is invalid
    """
    if not region:
        raise ValidationError("Region cannot be empty")
    
    if region not in AWS_REGIONS:
        raise ValidationError(
            f"Invalid AWS region: {region}. "
            f"Valid regions: {', '.join(AWS_REGIONS[:5])}..."
        )
    
    return region

def validate_regions(regions: List[str]) -> List[str]:
    """
    Validate list of AWS regions
    
    Args:
        regions: List of AWS region codes
        
    Returns:
        List of valid regions
        
    Raises:
        ValidationError: If any region is invalid
    """
    if not regions:
        raise ValidationError("Regions list cannot be empty")
    
    validated = []
    for region in regions:
        validated.append(validate_region(region))
    
    return validated

def validate_api_id(api_id: str) -> str:
    """
    Validate AWS API Gateway ID
    
    Args:
        api_id: API Gateway ID
        
    Returns:
        Valid API ID
        
    Raises:
        ValidationError: If API ID is invalid
    """
    if not api_id:
        raise ValidationError("API ID cannot be empty")
    
    if not API_ID_PATTERN.match(api_id):
        raise ValidationError(
            f"Invalid API ID format: {api_id}. "
            "Expected format: 10 lowercase alphanumeric characters"
        )
    
    return api_id

def validate_port(port: int) -> int:
    """
    Validate port number
    
    Args:
        port: Port number
        
    Returns:
        Valid port
        
    Raises:
        ValidationError: If port is invalid
    """
    if not isinstance(port, int):
        try:
            port = int(port)
        except (ValueError, TypeError):
            raise ValidationError(f"Invalid port: {port}")
    
    if port < 1 or port > 65535:
        raise ValidationError(f"Port must be between 1 and 65535, got: {port}")
    
    if port < 1024:
        raise ValidationError(
            f"Port {port} requires elevated privileges. "
            "Use a port above 1024"
        )
    
    return port

def validate_ip_address(ip: str) -> str:
    """
    Validate IP address
    
    Args:
        ip: IP address string
        
    Returns:
        Valid IP address
        
    Raises:
        ValidationError: If IP is invalid
    """
    if not ip:
        raise ValidationError("IP address cannot be empty")
    
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise ValidationError(f"Invalid IP address: {ip}")
    
    return ip

def sanitize_string(text: str, max_length: int = 255) -> str:
    """
    Sanitize string input
    
    Args:
        text: Input text
        max_length: Maximum allowed length
        
    Returns:
        Sanitized string
    """
    if not text:
        return ""
    
    # Remove control characters
    text = ''.join(char for char in text if ord(char) >= 32)
    
    # Truncate to max length
    if len(text) > max_length:
        text = text[:max_length]
    
    # Strip whitespace
    text = text.strip()
    
    return text

def validate_json(data: str) -> dict:
    """
    Validate JSON string
    
    Args:
        data: JSON string
        
    Returns:
        Parsed JSON object
        
    Raises:
        ValidationError: If JSON is invalid
    """
    import json
    
    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        raise ValidationError(f"Invalid JSON: {str(e)}")