"""
Utility functions for AWS Proxy Rotator
"""

import json
import logging
import time
import random
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
from functools import wraps
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Valid AWS regions
VALID_AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
    'eu-north-1', 'eu-south-1', 'ap-south-1', 'ap-northeast-1',
    'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
    'ap-southeast-2', 'ap-east-1', 'ca-central-1',
    'sa-east-1', 'me-south-1', 'af-south-1'
]

def setup_logging(config: Dict[str, Any]) -> None:
    """
    Setup logging configuration from config dict
    """
    level = config.get('level', 'INFO')
    format_str = config.get('format', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    logging.basicConfig(
        level=getattr(logging, level),
        format=format_str,
        datefmt='%Y-%m-%d %H:%M:%S'
    )

def validate_url(url: str) -> bool:
    """
    Validate if a URL is properly formatted
    """
    if not url:
        return False
    
    try:
        parsed = urlparse(url)
        return all([parsed.scheme, parsed.netloc])
    except Exception:
        return False

def validate_aws_region(region: str) -> bool:
    """
    Validate if a region is a valid AWS region
    """
    return region in VALID_AWS_REGIONS

def validate_aws_regions(regions: List[str]) -> List[str]:
    """
    Validate and filter valid AWS regions from a list
    """
    valid_regions = []
    for region in regions:
        if validate_aws_region(region):
            valid_regions.append(region)
        else:
            logger.warning(f"Invalid AWS region: {region}")
    return valid_regions

def sanitize_url_for_logging(url: str) -> str:
    """
    Sanitize URL for safe logging (remove sensitive info)
    """
    if not url:
        return ""
    
    try:
        parsed = urlparse(url)
        # Remove credentials if present
        if parsed.username or parsed.password:
            netloc = parsed.hostname
            if parsed.port:
                netloc = f"{netloc}:{parsed.port}"
            sanitized = parsed._replace(netloc=netloc)
            return sanitized.geturl()
        return url
    except Exception:
        # If parsing fails, return domain only
        return url.split('?')[0].split('#')[0]

def retry_with_exponential_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True
):
    """
    Decorator for retrying functions with exponential backoff
    """
    def decorator(func):
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            last_exception = None
            
            for retry in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    if retry < max_retries - 1:
                        delay = min(base_delay * (exponential_base ** retry), max_delay)
                        if jitter:
                            delay = delay * (0.5 + random.random())
                        
                        logger.warning(
                            f"Attempt {retry + 1}/{max_retries} failed for {func.__name__}: {e}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(f"All {max_retries} attempts failed for {func.__name__}")
            
            raise last_exception
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            last_exception = None
            
            for retry in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    if retry < max_retries - 1:
                        delay = min(base_delay * (exponential_base ** retry), max_delay)
                        if jitter:
                            delay = delay * (0.5 + random.random())
                        
                        logger.warning(
                            f"Attempt {retry + 1}/{max_retries} failed for {func.__name__}: {e}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        await asyncio.sleep(delay)
                    else:
                        logger.error(f"All {max_retries} attempts failed for {func.__name__}")
            
            raise last_exception
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

def save_json_safe(
    filepath: Path,
    data: Dict,
    atomic: bool = True,
    backup: bool = True,
    indent: int = 2
) -> bool:
    """
    Safely save JSON data to file with atomic writes and backup
    """
    try:
        # Create backup if requested
        if backup and filepath.exists():
            backup_path = filepath.with_suffix('.json.bak')
            backup_path.write_bytes(filepath.read_bytes())
        
        # Convert data to JSON
        json_str = json.dumps(data, indent=indent, default=str)
        
        if atomic:
            # Write to temporary file first
            temp_path = filepath.with_suffix('.json.tmp')
            temp_path.write_text(json_str)
            # Atomic rename
            temp_path.replace(filepath)
        else:
            # Direct write
            filepath.write_text(json_str)
        
        return True
    except Exception as e:
        logger.error(f"Failed to save JSON to {filepath}: {e}")
        return False

def load_json_safe(
    filepath: Path,
    default: Optional[Dict] = None
) -> Dict:
    """
    Safely load JSON data from file with fallback
    """
    if default is None:
        default = {}
    
    try:
        if filepath.exists():
            with open(filepath, 'r') as f:
                return json.load(f)
        else:
            logger.debug(f"File {filepath} does not exist, using default")
            return default
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {filepath}: {e}")
        # Try backup if exists
        backup_path = filepath.with_suffix('.json.bak')
        if backup_path.exists():
            logger.info("Attempting to load from backup")
            try:
                with open(backup_path, 'r') as f:
                    return json.load(f)
            except Exception:
                pass
        return default
    except Exception as e:
        logger.error(f"Failed to load JSON from {filepath}: {e}")
        return default

class CircuitBreaker:
    """
    Circuit breaker pattern implementation for fault tolerance
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exception: type = Exception
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'closed'  # closed, open, half-open
    
    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Call function through circuit breaker
        """
        if self.state == 'open':
            if self.last_failure_time and \
               (time.time() - self.last_failure_time) > self.recovery_timeout:
                self.state = 'half-open'
                logger.info(f"Circuit breaker entering half-open state for {func.__name__}")
            else:
                logger.warning(f"Circuit breaker is open for {func.__name__}")
                return None
        
        try:
            result = func(*args, **kwargs)
            if self.state == 'half-open':
                self.state = 'closed'
                self.failure_count = 0
                logger.info(f"Circuit breaker closed for {func.__name__}")
            return result
        except self.expected_exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.failure_count >= self.failure_threshold:
                self.state = 'open'
                logger.error(
                    f"Circuit breaker opened for {func.__name__} "
                    f"after {self.failure_count} failures"
                )
            raise e
    
    def reset(self):
        """Reset circuit breaker to closed state"""
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'closed'

def chunk_list(lst: List[Any], chunk_size: int) -> List[List[Any]]:
    """
    Split a list into chunks of specified size
    """
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]

def format_bytes(num_bytes: int) -> str:
    """
    Format bytes into human-readable string
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"

def format_duration(seconds: float) -> str:
    """
    Format duration in seconds to human-readable string
    """
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        return f"{seconds/3600:.1f}h"

def is_valid_api_id(api_id: str) -> bool:
    """
    Check if string is a valid AWS API Gateway ID
    """
    # AWS API Gateway IDs are typically 10 alphanumeric characters
    return bool(re.match(r'^[a-z0-9]{10}$', api_id))

def extract_domain(url: str) -> str:
    """
    Extract domain from URL
    """
    try:
        parsed = urlparse(url)
        return parsed.netloc or parsed.path.split('/')[0]
    except Exception:
        return url

def generate_unique_id(prefix: str = "") -> str:
    """
    Generate a unique ID with optional prefix
    """
    import uuid
    unique_id = str(uuid.uuid4())[:8]
    return f"{prefix}{unique_id}" if prefix else unique_id