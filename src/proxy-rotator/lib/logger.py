"""
Centralized logging configuration for Proxy Rotator
"""

import logging
import logging.handlers
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
try:
    from config import LOG_LEVEL, LOG_FILE, STATE_DIR
except ImportError:
    LOG_LEVEL = "INFO"
    LOG_FILE = Path(__file__).parent.parent / "state" / "proxy-rotator.log"
    STATE_DIR = Path(__file__).parent.parent / "state"

def setup_logging(name: str = None, level: str = None, log_file: bool = True):
    """
    Set up logging configuration
    
    Args:
        name: Logger name (None for root logger)
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Whether to log to file in addition to console
    
    Returns:
        Configured logger instance
    """
    # Create logger
    logger = logging.getLogger(name)
    
    # Set level
    log_level = getattr(logging, level or LOG_LEVEL)
    logger.setLevel(log_level)
    
    # Remove existing handlers
    logger.handlers = []
    
    # Console handler with color support
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    
    # Create formatters
    if sys.stdout.isatty():
        # Color formatter for terminal output
        console_format = ColoredFormatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    else:
        # Plain formatter for non-terminal output
        console_format = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)
    
    # File handler if requested
    if log_file:
        # Ensure log directory exists
        STATE_DIR.mkdir(exist_ok=True)
        
        # Rotating file handler (10MB max, keep 5 backups)
        file_handler = logging.handlers.RotatingFileHandler(
            LOG_FILE,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5
        )
        file_handler.setLevel(log_level)
        
        file_format = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(file_format)
        logger.addHandler(file_handler)
    
    return logger

class ColoredFormatter(logging.Formatter):
    """
    Colored formatter for terminal output
    """
    
    # Color codes
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record):
        # Add color to log level
        levelname = record.levelname
        if levelname in self.COLORS:
            record.levelname = f"{self.COLORS[levelname]}{levelname}{self.RESET}"
        
        # Format the message
        formatted = super().format(record)
        
        # Reset levelname for next use
        record.levelname = levelname
        
        return formatted

def get_logger(name: str) -> logging.Logger:
    """
    Get a configured logger instance
    
    Args:
        name: Logger name (typically __name__)
    
    Returns:
        Configured logger
    """
    return setup_logging(name)

# Request logging middleware for aiohttp
class RequestLogger:
    """
    Middleware for logging HTTP requests and responses
    """
    
    def __init__(self, logger: logging.Logger = None):
        self.logger = logger or get_logger('http.request')
    
    @staticmethod
    def middleware(logger: logging.Logger = None):
        """
        Create request logging middleware for aiohttp
        """
        request_logger = RequestLogger(logger)
        
        async def request_logging_middleware(app, handler):
            async def middleware_handler(request):
                # Log request
                request_logger.log_request(request)
                
                # Process request
                try:
                    response = await handler(request)
                    # Log response
                    request_logger.log_response(request, response)
                    return response
                except Exception as e:
                    # Log error
                    request_logger.log_error(request, e)
                    raise
            
            return middleware_handler
        
        return request_logging_middleware
    
    def log_request(self, request):
        """Log incoming request"""
        self.logger.info(
            f"Request: {request.method} {request.path} "
            f"from {request.remote}"
        )
        
        if self.logger.isEnabledFor(logging.DEBUG):
            self.logger.debug(f"Headers: {dict(request.headers)}")
    
    def log_response(self, request, response):
        """Log outgoing response"""
        self.logger.info(
            f"Response: {request.method} {request.path} "
            f"status={response.status}"
        )
    
    def log_error(self, request, error):
        """Log request error"""
        self.logger.error(
            f"Error: {request.method} {request.path} "
            f"error={str(error)}"
        )

# Convenience function for quick logging setup
def quick_setup(level: str = "INFO"):
    """
    Quick setup for basic logging to console
    
    Args:
        level: Log level string
    """
    logging.basicConfig(
        level=getattr(logging, level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )