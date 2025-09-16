// Quick test to verify WebSocket data flow without MQTT
const io = require('socket.io-client');

console.log('🔌 Connecting to WebSocket server...');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  forceNew: true
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');

  // Subscribe to postgres machine 1
  console.log('📡 Subscribing to "postgres machine 1"...');
  socket.emit('subscribe-machine', { deviceId: 'postgres machine 1' });
});

socket.on('subscription-confirmed', (data) => {
  console.log('✅ Subscription confirmed for:', data.deviceId);

  // Request current status
  socket.emit('get-machine-status', { deviceId: 'postgres machine 1' });
});

socket.on('machine-status', (data) => {
  console.log('📊 Machine status received:', data);
});

socket.on('realtime-update', (data) => {
  console.log('⚡ Real-time update received:', {
    deviceId: data.deviceId,
    timestamp: data.timestamp,
    oilTemp: data.data?.Data?.OT,
    temperatures: [data.data?.Data?.T1, data.data?.Data?.T2, data.data?.Data?.T3]
  });
});

socket.on('spc-update', (data) => {
  console.log('📈 SPC update received:', {
    deviceId: data.deviceId,
    cycleNumber: data.data?.Data?.CYCN,
    cycleTime: data.data?.Data?.ECYCT,
    timestamp: data.timestamp
  });
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('💔 Disconnected:', reason);
});

// Keep the script running
setInterval(() => {
  if (socket.connected) {
    socket.emit('ping');
  }
}, 30000);

console.log('🔄 Waiting for WebSocket events...');
console.log('Press Ctrl+C to exit');