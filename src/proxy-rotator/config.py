"""
Configuration management for AWS Proxy Rotator
"""

import os
import json
import yaml
from pathlib import Path
from typing import Any, Dict, Optional

class Config:
    """
    Configuration manager with environment variable support
    """
    
    def __init__(self, config_path: Optional[Path] = None):
        self.base_dir = Path(__file__).parent
        self.config = self._load_default_config()
        
        # Load from file if provided
        if config_path and config_path.exists():
            self._load_config_file(config_path)
        
        # Override with environment variables
        self._load_env_variables()
    
    def _load_default_config(self) -> Dict[str, Any]:
        """Load default configuration"""
        return {
            "aws": {
                "regions": ["us-east-1", "us-west-2", "eu-west-1"],
                "profile": os.environ.get("AWS_PROFILE", "default"),
                "max_retries": 3,
                "timeout": 30,
                "max_gateways_per_region": 10,
                "gateway_prefix": "proxy_rotator",
                "gateway_stage": "proxyrotator"
            },
            "proxy_server": {
                "host": "127.0.0.1",
                "port": 8888,
                "request_timeout": 10,
                "connection_pool_size": 100,
                "health_check_enabled": True,
                "health_check_interval": 60
            },
            "management_server": {
                "host": "127.0.0.1",
                "port": 8889,
                "cors_origins": ["chrome-extension://*", "http://localhost:*"]
            },
            "rotation": {
                "strategy": "round-robin",  # round-robin, random, weighted
                "failover_enabled": True,
                "cache_enabled": True,
                "cache_ttl": 300
            },
            "state": {
                "dir": self.base_dir / "state",
                "file": "api_proxies.json",
                "backup_enabled": True,
                "atomic_writes": True
            },
            "logging": {
                "level": os.environ.get("LOG_LEVEL", "INFO"),
                "file": self.base_dir / "state" / "proxy-rotator.log",
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                "max_size": 10485760,  # 10MB
                "backup_count": 5
            },
            "security": {
                "rate_limit_enabled": True,
                "rate_limit_requests": 100,
                "rate_limit_window": 60,
                "allowed_targets": [],  # Empty means all allowed
                "blocked_targets": [],
                "require_https": False
            }
        }
    
    def _load_config_file(self, config_path: Path) -> None:
        """Load configuration from file"""
        try:
            if config_path.suffix in ['.yaml', '.yml']:
                with open(config_path, 'r') as f:
                    file_config = yaml.safe_load(f)
            elif config_path.suffix == '.json':
                with open(config_path, 'r') as f:
                    file_config = json.load(f)
            else:
                raise ValueError(f"Unsupported config file format: {config_path.suffix}")
            
            # Merge with default config
            self._merge_config(self.config, file_config)
        except Exception as e:
            print(f"Warning: Failed to load config from {config_path}: {e}")
    
    def _load_env_variables(self) -> None:
        """Load configuration from environment variables"""
        env_mappings = {
            "AWS_PROXY_REGIONS": ("aws.regions", lambda x: x.split(',')),
            "AWS_PROXY_PROFILE": ("aws.profile", str),
            "AWS_PROXY_MAX_RETRIES": ("aws.max_retries", int),
            "AWS_PROXY_TIMEOUT": ("aws.timeout", int),
            "PROXY_PORT": ("proxy_server.port", int),
            "PROXY_TIMEOUT": ("proxy_server.request_timeout", int),
            "MANAGEMENT_PORT": ("management_server.port", int),
            "ROTATION_STRATEGY": ("rotation.strategy", str),
            "LOG_LEVEL": ("logging.level", str),
            "RATE_LIMIT_ENABLED": ("security.rate_limit_enabled", lambda x: x.lower() == 'true'),
            "RATE_LIMIT_REQUESTS": ("security.rate_limit_requests", int),
            "REQUIRE_HTTPS": ("security.require_https", lambda x: x.lower() == 'true')
        }
        
        for env_var, (config_path, converter) in env_mappings.items():
            value = os.environ.get(env_var)
            if value:
                try:
                    converted_value = converter(value)
                    self._set_nested(self.config, config_path, converted_value)
                except Exception as e:
                    print(f"Warning: Failed to set {config_path} from {env_var}: {e}")
    
    def _merge_config(self, base: Dict, override: Dict) -> None:
        """Recursively merge override config into base config"""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value
    
    def _set_nested(self, config: Dict, path: str, value: Any) -> None:
        """Set nested configuration value using dot notation"""
        keys = path.split('.')
        current = config
        
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        current[keys[-1]] = value
    
    def get(self, path: str, default: Any = None) -> Any:
        """Get configuration value using dot notation"""
        keys = path.split('.')
        current = self.config
        
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default
        
        return current
    
    def get_aws_regions(self) -> list:
        """Get configured AWS regions"""
        regions = self.get("aws.regions", ["us-east-1"])
        if isinstance(regions, str):
            regions = [r.strip() for r in regions.split(',')]
        return regions
    
    def get_logging_config(self) -> Dict[str, Any]:
        """Get logging configuration"""
        return self.get("logging", {})
    
    def save(self, path: Path) -> None:
        """Save current configuration to file"""
        try:
            if path.suffix in ['.yaml', '.yml']:
                with open(path, 'w') as f:
                    yaml.dump(self.config, f, default_flow_style=False)
            elif path.suffix == '.json':
                with open(path, 'w') as f:
                    json.dump(self.config, f, indent=2)
            else:
                raise ValueError(f"Unsupported config file format: {path.suffix}")
        except Exception as e:
            print(f"Error saving config to {path}: {e}")

# Global config instance
_config: Optional[Config] = None

def get_config(config_path: Optional[Path] = None) -> Config:
    """Get or create global config instance"""
    global _config
    if _config is None:
        _config = Config(config_path)
    return _config

def reload_config(config_path: Optional[Path] = None) -> Config:
    """Reload configuration from file"""
    global _config
    _config = Config(config_path)
    return _config

# Convenience exports for backward compatibility
def get_config_value(path: str, default: Any = None) -> Any:
    """Get configuration value"""
    return get_config().get(path, default)

# Export commonly used values
STATE_DIR = Path(__file__).parent / "state"
PROXIES_FILE = STATE_DIR / "api_proxies.json"
DEFAULT_REGION = "us-east-1"
GATEWAY_PREFIX = "proxy_rotator"
GATEWAY_STAGE = "proxyrotator"
DEFAULT_PROXY_PORT = 8888
DEFAULT_MANAGEMENT_PORT = 8889
DEFAULT_HOST = "127.0.0.1"
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
PROXY_TIMEOUT = 10
ROTATION_MODE = "round-robin"
MAX_GATEWAYS_PER_REGION = 10
AWS_PROFILE = os.environ.get("AWS_PROFILE", "default")