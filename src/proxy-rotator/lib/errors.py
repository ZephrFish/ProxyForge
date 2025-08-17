"""
Custom error classes and error handling for Proxy Rotator
"""

import json
import logging
from aiohttp import web
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class ProxyRotatorError(Exception):
    """Base exception for all proxy rotator errors"""
    def __init__(self, message: str, code: str = "PROXY_ERROR", status: int = 500):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)

class AWSError(ProxyRotatorError):
    """AWS API related errors"""
    def __init__(self, message: str):
        super().__init__(message, "AWS_ERROR", 503)

class ConfigurationError(ProxyRotatorError):
    """Configuration related errors"""
    def __init__(self, message: str):
        super().__init__(message, "CONFIG_ERROR", 500)

class ValidationError(ProxyRotatorError):
    """Input validation errors"""
    def __init__(self, message: str):
        super().__init__(message, "VALIDATION_ERROR", 400)

class ProxyNotFoundError(ProxyRotatorError):
    """Proxy not found errors"""
    def __init__(self, message: str):
        super().__init__(message, "PROXY_NOT_FOUND", 404)

class ProxyConnectionError(ProxyRotatorError):
    """Proxy connection errors"""
    def __init__(self, message: str):
        super().__init__(message, "PROXY_CONNECTION_ERROR", 502)

class RateLimitError(ProxyRotatorError):
    """Rate limiting errors"""
    def __init__(self, message: str):
        super().__init__(message, "RATE_LIMIT_ERROR", 429)

class AuthenticationError(ProxyRotatorError):
    """Authentication errors"""
    def __init__(self, message: str):
        super().__init__(message, "AUTH_ERROR", 401)

class AuthorizationError(ProxyRotatorError):
    """Authorization errors"""
    def __init__(self, message: str):
        super().__init__(message, "AUTHZ_ERROR", 403)

def error_response(error: Exception, request_id: Optional[str] = None) -> web.Response:
    """
    Create a standardized error response
    
    Args:
        error: The exception that occurred
        request_id: Optional request ID for tracking
        
    Returns:
        aiohttp web.Response with error details
    """
    if isinstance(error, ProxyRotatorError):
        status = error.status
        response_data = {
            "success": False,
            "error": {
                "code": error.code,
                "message": error.message
            }
        }
    else:
        # Generic error handling
        status = 500
        response_data = {
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An internal error occurred"
            }
        }
        # Log the actual error for debugging
        logger.error(f"Unhandled error: {str(error)}", exc_info=True)
    
    if request_id:
        response_data["request_id"] = request_id
    
    return web.json_response(
        response_data,
        status=status,
        headers={'Access-Control-Allow-Origin': '*'}
    )

def handle_aws_error(error: Exception) -> None:
    """
    Handle AWS-specific errors and convert to ProxyRotatorError
    
    Args:
        error: AWS exception
        
    Raises:
        AWSError: Converted error with appropriate message
    """
    from botocore.exceptions import ClientError, NoCredentialsError
    
    if isinstance(error, NoCredentialsError):
        raise AuthenticationError("AWS credentials not configured")
    elif isinstance(error, ClientError):
        error_code = error.response.get('Error', {}).get('Code', 'Unknown')
        error_message = error.response.get('Error', {}).get('Message', str(error))
        
        if error_code == 'UnauthorizedOperation':
            raise AuthorizationError(f"AWS authorization failed: {error_message}")
        elif error_code == 'InvalidParameterValue':
            raise ValidationError(f"Invalid AWS parameter: {error_message}")
        elif error_code == 'ResourceNotFoundException':
            raise ProxyNotFoundError(f"AWS resource not found: {error_message}")
        elif error_code == 'TooManyRequestsException':
            raise RateLimitError(f"AWS rate limit exceeded: {error_message}")
        else:
            raise AWSError(f"AWS error ({error_code}): {error_message}")
    else:
        raise AWSError(f"AWS operation failed: {str(error)}")

class ErrorMiddleware:
    """
    Middleware for handling errors in aiohttp applications
    """
    
    @web.middleware
    async def error_middleware(self, request, handler):
        """
        Catch and handle errors from request handlers
        """
        try:
            response = await handler(request)
            return response
        except web.HTTPException:
            # Re-raise HTTP exceptions (they already have proper status codes)
            raise
        except ProxyRotatorError as e:
            # Handle our custom errors
            logger.warning(f"Request error: {e.code} - {e.message}")
            return error_response(e, request.headers.get('X-Request-ID'))
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Unexpected error handling request: {str(e)}", exc_info=True)
            return error_response(e, request.headers.get('X-Request-ID'))