#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const { exit } = require('process');

// Check if outputs.json exists
if (!fs.existsSync('outputs.json')) {
  console.error('❌ outputs.json not found. Run deployment first:');
  console.error('   ./deploy.sh');
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync('outputs.json', 'utf8'));
const elasticIP = outputs.OpcuaBackendStack.ElasticIP;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`🧪 Testing OPCUA Backend at ${elasticIP}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testEndpoint(path, expectedStatus = 200, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: elasticIP,
      port: 3000,
      path,
      method,
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === expectedStatus) {
          console.log(`✅ ${method.padEnd(6)} ${path.padEnd(20)} Status ${res.statusCode} (OK)`);
          resolve({ status: res.statusCode, data });
        } else {
          console.error(`❌ ${method.padEnd(6)} ${path.padEnd(20)} Expected ${expectedStatus}, got ${res.statusCode}`);
          reject(new Error(`Unexpected status code: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ ${method.padEnd(6)} ${path.padEnd(20)} Connection failed: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`❌ ${method.padEnd(6)} ${path.padEnd(20)} Timeout after 5s`);
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

(async () => {
  try {
    console.log('Testing API endpoints:\n');

    // Test health endpoint
    await testEndpoint('/health');

    // Test auth endpoints (should return 405 Method Not Allowed for GET)
    await testEndpoint('/auth/login', 405);

    // Test protected endpoint (should return 401 Unauthorized)
    await testEndpoint('/machines', 401);

    // Test non-existent endpoint (should return 404)
    await testEndpoint('/nonexistent', 404);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Test Summary:');
    console.log('   ✓ Health check endpoint');
    console.log('   ✓ Auth endpoints validation');
    console.log('   ✓ Protected routes security');
    console.log('   ✓ Error handling (404)');
    console.log('');
    console.log(`🌐 Backend URL: http://${elasticIP}:3000`);
    console.log(`📡 MQTT Broker: mqtt://${elasticIP}:1883`);
    console.log(`🔌 WebSocket: ws://${elasticIP}:3000/socket.io/`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Tests failed');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.error('The backend may not be fully started yet.');
    console.error('Wait a few more minutes and try again:\n');
    console.error('  npm run test\n');
    process.exit(1);
  }
})();
