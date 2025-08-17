# ProxyForge

Dynamic IP rotation through AWS API Gateway proxies with browser control.

## Setup

Install Python dependencies:
```bash
cd src/proxy-rotator
pip install -r requirements.txt
```

Configure AWS:
```bash
aws configure
# Enter AWS Access Key ID
# Enter AWS Secret Access Key
# Default region: us-east-1
```

## What stuff is

- **src/extension/** - Chrome extension for proxy control
- **src/proxy-rotator/** - Python service that manages AWS gateways
- **proxy-rotator** - CLI tool for gateway operations
- **setup.py** - Automated setup script

## Running the Thing

Start proxy service with management API:
```bash
cd src/proxy-rotator
./proxy-rotator server
# Proxy runs on port 8888
# Management API runs on port 8889
```

Install Chrome extension:
1. Open `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked → Select `src/extension/`
4. Click extension icon to enable proxy

## Command Line Usage

Create gateways:
```bash
./proxy-rotator create --url https://httpbin.org --regions us-east-1,us-west-2
```

List gateways:
```bash
./proxy-rotator list
```

Test connectivity:
```bash
./proxy-rotator test
```

Delete all:
```bash
./proxy-rotator delete --all
```

## Extension Features

- **Manual Mode** - Click to enable/disable proxy
- **Auto-Rotation** - Rotates proxy when changing domains
- **Statistics** - Tracks requests, rotations, uptime
- **Gateway Manager** - Create/delete gateways from browser

## Architecture

Browser extension connects to local proxy server on port 8888, which routes traffic through rotating AWS API Gateway endpoints. Management API on port 8889 allows browser to control gateway creation and deletion.

## Testing

Run extension tests:
```bash
cd src/extension/tests
npm install
npm test
```

Test proxy connectivity:
```bash
curl -x http://localhost:8888 https://httpbin.org/ip
# IP should change on each request
```

## AWS Costs

API Gateway charges per million requests. Delete unused gateways to avoid costs:
```bash
./proxy-rotator delete --all
```