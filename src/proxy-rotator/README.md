# AWS Proxy Rotator

IP rotation tool using AWS API Gateway endpoints. Each request through the proxy uses a different IP address.

## Features

- **Automatic IP Rotation** - Different IP for each request
- **Multi-Region Support** - Deploy proxies across AWS regions
- **Local Proxy Server** - Browser-friendly proxy on localhost
- **Cost Effective** - ~$3.50 per million requests
- **Easy Setup** - Single command deployment

## Installation

```bash
# Clone or download the tool
cd aws-proxy-rotator

# Make executable
chmod +x proxy-rotator

# Install dependencies
pip3 install boto3 aiohttp certifi tldextract
```

## AWS Setup

1. **Install AWS CLI**:
```bash
# macOS
brew install awscli

# Linux
sudo apt install awscli
```

2. **Configure AWS Credentials**:
```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-1
# Default output: json
```

## Quick Start

### Create Proxies
```bash
# Create proxies in default regions
./proxy-rotator create --url https://httpbin.org

# Create in specific regions
./proxy-rotator create --url https://httpbin.org --regions us-east-1,us-west-2,eu-west-1

# Create multiple proxies
./proxy-rotator create --url https://httpbin.org --count 5
```

### List Proxies
```bash
# List all proxies
./proxy-rotator list

# List by region
./proxy-rotator list --region us-east-1
```

### Start Local Proxy Server
```bash
# Start on default port 8080
./proxy-rotator local

# Start on custom port
./proxy-rotator local --port 3128
```

### Browser Configuration

**Chrome**:
```bash
google-chrome --proxy-server="http://localhost:8080"
```

**Firefox**:
- Settings → Network Settings → Manual proxy
- HTTP Proxy: `localhost`, Port: `8080`

**Command Line**:
```bash
export http_proxy=http://localhost:8080
export https_proxy=http://localhost:8080
curl https://api.ipify.org  # Each request gets different IP
```

### Test Proxies
```bash
# Test all proxies
./proxy-rotator test

# Test specific proxy
./proxy-rotator test --url https://abc123.execute-api.us-east-1.amazonaws.com/proxyrotator/
```

### Delete Proxies
```bash
# Delete all proxies
./proxy-rotator delete --all

# Delete specific proxy
./proxy-rotator delete --api-id abc123 --region us-east-1
```

## How It Works

1. **API Gateway Creation**: Creates REST APIs in multiple AWS regions
2. **Proxy Endpoints**: Each gateway acts as a proxy server
3. **IP Rotation**: AWS assigns different IPs for each request
4. **Local Server**: Routes browser traffic through gateways
5. **Round-Robin**: Distributes requests across endpoints

## Cost

AWS API Gateway pricing (as of 2024):
- **REST API Calls**: $3.50 per million requests
- **Data Transfer**: $0.09/GB for first 10TB
- **No charges for**: Creating/maintaining APIs

Example monthly costs:
- Light use (100K requests): ~$0.35
- Moderate use (1M requests): ~$3.50
- Heavy use (10M requests): ~$35.00

## Examples

### Web Scraping
```python
import requests
import random

# Get list of proxy URLs
proxies = [
    "https://abc123.execute-api.us-east-1.amazonaws.com/proxyrotator/",
    "https://def456.execute-api.us-west-2.amazonaws.com/proxyrotator/",
    "https://ghi789.execute-api.eu-west-1.amazonaws.com/proxyrotator/"
]

# Rotate through proxies
for url in urls_to_scrape:
    proxy = random.choice(proxies)
    response = requests.get(url, proxies={"https": proxy})
    print(response.text)
```

### API Rate Limit Bypass
```bash
# Each curl uses different IP
for i in {1..100}; do
    curl -x http://localhost:8080 https://api.example.com/endpoint
    sleep 1
done
```

## Troubleshooting

### No proxies found
```bash
# Check AWS credentials
aws sts get-caller-identity

# Create new proxies
./proxy-rotator create --url https://httpbin.org
```

### Connection refused on localhost
```bash
# Start the local proxy server
./proxy-rotator local --port 8080
```

### Rate limiting on API Gateway
AWS API Gateway has rate limits for creation/deletion. Wait a few minutes between operations.

## Security Notes

- API Gateways are public endpoints (no auth by default)
- Target servers see AWS IPs, not yours
- SSL/TLS terminated at gateway
- Consider adding API keys for production
- Rotate proxies regularly

## License

MIT License - Use at your own risk

## Support

For issues or questions, please check the documentation or create an issue on GitHub.