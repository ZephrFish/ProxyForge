#!/usr/bin/env python3
"""
Setup script for ProxyForge
"""

import subprocess
import sys
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"\n{description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"[OK] {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[FAIL] {description} failed:")
        print(f"  Command: {command}")
        print(f"  Error: {e.stderr}")
        return False

def check_requirements():
    """Check if required tools are installed"""
    print("Checking requirements...")
    
    requirements = [
        ("python3", "python3 --version"),
        ("pip3", "pip3 --version"),
        ("node", "node --version"),
        ("npm", "npm --version"),
        ("aws", "aws --version")
    ]
    
    missing = []
    for tool, check_cmd in requirements:
        if not run_command(check_cmd, f"Checking {tool}"):
            missing.append(tool)
    
    if missing:
        print(f"\n[ERROR] Missing required tools: {', '.join(missing)}")
        print("\nPlease install the missing tools and run setup again.")
        return False
    
    print("[OK] All requirements met")
    return True

def setup_proxy_rotator():
    """Setup proxy rotator dependencies"""
    print("\nSetting up proxy rotator...")
    
    base_dir = Path(__file__).parent
    proxy_dir = base_dir / "proxy-rotator"
    
    # Install Python dependencies
    cmd = f"cd {proxy_dir} && pip3 install -r requirements.txt"
    if not run_command(cmd, "Installing Python dependencies"):
        return False
    
    # Make proxy-rotator executable
    proxy_script = proxy_dir / "proxy-rotator"
    if proxy_script.exists():
        proxy_script.chmod(0o755)
        print("[OK] Made proxy-rotator executable")
    
    return True

def setup_extension_tests():
    """Setup extension test dependencies"""
    print("\nSetting up extension tests...")
    
    base_dir = Path(__file__).parent
    test_dir = base_dir / "extension" / "tests"
    
    if not test_dir.exists():
        print("Extension test directory not found, skipping")
        return True
    
    # Install Node.js dependencies
    cmd = f"cd {test_dir} && npm install"
    if not run_command(cmd, "Installing Node.js dependencies"):
        return False
    
    return True

def create_config_file():
    """Create configuration file if it doesn't exist"""
    print("\n Setting up configuration...")
    
    base_dir = Path(__file__).parent
    proxy_dir = base_dir / "proxy-rotator"
    config_file = proxy_dir / "config.yaml"
    example_file = proxy_dir / "config.example.yaml"
    
    if not config_file.exists() and example_file.exists():
        import shutil
        shutil.copy2(example_file, config_file)
        print("[OK] Created config.yaml from example")
    elif config_file.exists():
        print("[OK] Configuration file already exists")
    else:
        print(" No configuration example found")
    
    return True

def verify_setup():
    """Verify the setup is working"""
    print("\n🔍 Verifying setup...")
    
    base_dir = Path(__file__).parent
    proxy_dir = base_dir / "proxy-rotator"
    
    # Test proxy-rotator command
    cmd = f"cd {proxy_dir} && ./proxy-rotator --help"
    if not run_command(cmd, "Testing proxy-rotator command"):
        return False
    
    # Test extension tests if available
    test_dir = base_dir / "extension" / "tests"
    if test_dir.exists():
        cmd = f"cd {test_dir} && npm test 2>/dev/null || echo 'Tests not configured'"
        run_command(cmd, "Testing extension test suite")
    
    print("Setup verification completed")
    return True

def print_next_steps():
    """Print next steps for the user"""
    print("\n" + "="*60)
    print("ProxyForge Setup Complete!")
    print("="*60)
    
    print("\n Next Steps:")
    print("1. Configure AWS credentials:")
    print("   aws configure")
    
    print("\n2. Create some proxy gateways:")
    print("   cd proxy-rotator")
    print("   ./proxy-rotator create --url https://httpbin.org --regions us-east-1,us-west-2")
    
    print("\n3. Start the proxy server:")
    print("   ./proxy-rotator server")
    
    print("\n4. Load the browser extension:")
    print("   - Open Chrome and go to chrome://extensions/")
    print("   - Enable Developer mode")
    print("   - Click 'Load unpacked'")
    print("   - Select the 'extension' directory")
    
    print("\n5. Test the setup:")
    print("   - Click the extension icon to enable proxy")
    print("   - Visit https://httpbin.org/ip to see IP rotation")
    
    print("\n Documentation:")
    print("   - README.md - Project overview")
    print("   - README_INTEGRATED.md - Detailed documentation")
    print("   - SETUP_GUIDE.md - Complete setup guide")
    
    print("\nConfiguration:")
    print("   - Edit proxy-rotator/config.yaml for custom settings")
    print("   - Use environment variables for temporary overrides")
    
    print("\n" + "="*60)

def main():
    """Main setup function"""
    print("ProxyForge Setup")
    print("=" * 30)
    
    steps = [
        check_requirements,
        setup_proxy_rotator,
        setup_extension_tests,
        create_config_file,
        verify_setup
    ]
    
    for step in steps:
        if not step():
            print(f"\n Setup failed at step: {step.__name__}")
            print("Please fix the issues above and run setup again.")
            sys.exit(1)
    
    print_next_steps()

if __name__ == "__main__":
    main()
