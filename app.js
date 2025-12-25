// ============================================================================
// CRANE MONITOR - JAVASCRIPT APPLICATION
// ============================================================================

class CraneMonitor {
    constructor() {
        this.ws = null;
        this.reconnectInterval = 5000;
        this.reconnectTimer = null;
        this.data = {};
        
        this.init();
    }

    init() {
        console.log('🚀 Crane Monitor Starting...');
        this.updateConnectionStatus(false);
        // this.startMockData(); // Using mock data for testing

        // Connect to the backend WebSocket server
        this.setupWebSocket();
    }

    // ========================================================================
    // WEBSOCKET CONNECTION (for real hardware)
    // ========================================================================

    setupWebSocket() {
        // Build websocket URL using current host and token from localStorage
        const token = localStorage.getItem('monitor_token');
        if (!token) {
            // not authenticated — redirect to login
            window.location.href = '/login.html';
            return;
        }
        const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${scheme}://${location.host}/ws?token=${encodeURIComponent(token)}`;

        console.log(`🔌 Connecting to ${wsUrl}...`);
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => this.onConnect();
            this.ws.onmessage = (event) => this.onMessage(event);
            this.ws.onerror = (error) => this.onError(error);
            this.ws.onclose = () => this.onDisconnect();
        } catch (error) {
            console.error('❌ WebSocket error:', error);
            this.updateConnectionStatus(false);
            this.scheduleReconnect();
        }
    }

    onConnect() {
        console.log('✅ Connected to crane');
        this.updateConnectionStatus(true);
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('📦 Received:', data);
            this.data = data;
            this.updateUI(data);
        } catch (error) {
            console.error('❌ Parse error:', error);
        }
    }

    onError(error) {
        console.error('❌ WebSocket error:', error);
    }

    onDisconnect() {
        console.log('❌ Disconnected from crane');
        this.updateConnectionStatus(false);
        this.scheduleReconnect();
    }

    scheduleReconnect() {
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                console.log('🔄 Attempting to reconnect...');
                this.setupWebSocket();
            }, this.reconnectInterval);
        }
    }

    updateConnectionStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('connection-text');
        
        if (connected) {
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('online');
            statusDot.classList.add('offline');
            statusText.textContent = 'Mock Data';
        }
    }

    // ========================================================================
    // UI UPDATE
    // ========================================================================

    updateUI(data) {
        // Real-time values
        this.updateElement('load-value', data.load?.toFixed(2) || '0.00');
        this.updateElement('swl-value', data.swl?.toFixed(2) || '0.00');
        this.updateElement('trolley-value', data.trolley?.toFixed(2) || '0.00');
        this.updateElement('wind-value', data.wind?.toFixed(1) || '0.0');
        
        // Load percentage
        if (data.load && data.swl && data.swl > 0) {
            const percent = (data.load / data.swl * 100).toFixed(1);
            const percentEl = document.getElementById('load-percent');
            percentEl.textContent = `${percent}%`;
            
            // Color coding
            percentEl.className = '';
            if (percent >= 95) percentEl.classList.add('danger');
            else if (percent >= 80) percentEl.classList.add('warning');
        }
        
        // Safety status
        this.updateSafetyStatus(data.safety_level || 'safe');
        
        // Test mode
        this.updateTestMode(data.test_mode || {});
        
        // Operations
        this.updateOperation('hoist-op', data.hoist_active);
        this.updateOperation('trolley-op', data.trolley_active);
        this.updateOperation('slew-op', data.slew_active);
        
        // Utilization
        this.updateElement('util-time', data.utilization_minutes || '0');
        this.updateUtilStatus(data.utilization_active);
        
        // Counters
        this.updateElement('counter-hookup', data.counters?.hookup || '0');
        this.updateElement('counter-hookdown', data.counters?.hookdown || '0');
        
        // Status info
        this.updateElement('status-word', `0x${(data.status_word || 0).toString(16).toUpperCase().padStart(4, '0')}`);
        this.updateElement('last-update', new Date().toLocaleTimeString());
        
        // Badges
        this.updateBadge('overload-badge', data.overload_active);
        this.updateBadge('bypass-badge', data.bypass_active);
    }

    updateElement(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    updateSafetyStatus(level) {
        const statusLight = document.querySelector('.status-light');
        const statusText = document.querySelector('.status-text');
        const banner = document.getElementById('safety-banner');
        const message = document.getElementById('safety-message');
        
        statusLight.className = 'status-light';
        banner.className = 'safety-banner';
        
        switch(level) {
            case 'safe':
                statusLight.classList.add('safe');
                statusText.textContent = 'Safe';
                banner.classList.add('hidden');
                break;
            case 'warning':
                statusLight.classList.add('warning');
                statusText.textContent = 'Warning';
                message.textContent = '⚠️ Load approaching limit';
                banner.classList.remove('hidden');
                break;
            case 'overload':
            case 'cutoff':
                statusLight.classList.add('danger');
                statusText.textContent = level === 'cutoff' ? 'CUTOFF' : 'Overload';
                message.textContent = '🚨 OVERLOAD - Operations stopped';
                banner.classList.add('danger');
                banner.classList.remove('hidden');
                break;
        }
    }

    updateTestMode(testData) {
        const badge = document.getElementById('test-status-badge');
        const statusText = document.getElementById('test-status-text');
        const timer = document.getElementById('test-timer');
        const warning = document.getElementById('test-warning');
        
        badge.className = 'test-status-badge';
        if (testData.in_progress) {
            badge.classList.add('active');
            statusText.textContent = 'In Progress';
        } else if (testData.all_complete) {
            badge.classList.add('complete');
            statusText.textContent = 'Complete';
        } else {
            statusText.textContent = 'Not Started';
        }
        
        if (testData.in_progress && testData.remaining_seconds !== undefined) {
            const minutes = Math.floor(testData.remaining_seconds / 60);
            const seconds = testData.remaining_seconds % 60;
            timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            timer.textContent = '10:00';
        }
        
        this.updateTestIndicator('test-ls1', testData.ls1_tested, testData.ls1_hit);
        this.updateTestIndicator('test-ls2', testData.ls2_tested, testData.ls2_hit);
        this.updateTestIndicator('test-ls3', testData.ls3_tested, testData.ls3_hit);
        this.updateTestIndicator('test-ls4', testData.ls4_tested, testData.ls4_hit);
        
        if (testData.warning_active) {
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    }

    updateTestIndicator(elementId, tested, hit) {
        const element = document.getElementById(elementId);
        if (!element) return; // element removed from DOM (e.g. tilt not required)

        const indicator = element.querySelector('.test-indicator');
        if (!indicator) return;

        indicator.className = 'test-indicator';

        if (hit) {
            indicator.classList.add(tested ? 'yellow' : 'red');
        } else {
            indicator.classList.add(tested ? 'green' : 'grey');
        }
    }

    updateOperation(id, active) {
        const element = document.getElementById(id);
        if (!element) return; // operation element removed from DOM

        const status = element.querySelector('.op-status');
        if (!status) return;

        status.className = 'op-status';
        if (active) {
            status.classList.add('active');
            status.textContent = 'ON';
        } else {
            status.textContent = 'OFF';
        }
    }

    updateUtilStatus(active) {
        const status = document.getElementById('util-status');
        const dot = status.querySelector('.status-dot');
        const text = status.querySelector('span:last-child');
        
        if (active) {
            dot.classList.add('online');
            text.textContent = 'Active';
        } else {
            dot.classList.remove('online');
            text.textContent = 'Inactive';
        }
    }

    updateBadge(id, active) {
        const badge = document.getElementById(id);
        const status = badge.querySelector('.badge-status');
        
        status.className = 'badge-status';
        if (active) {
            status.classList.add('active');
            status.textContent = 'ON';
        } else {
            status.textContent = 'OFF';
        }
    }

    // ========================================================================
    // MOCK DATA (for testing without hardware)
    // ========================================================================

    startMockData() {
        console.log('📊 Using mock data');
        this.updateConnectionStatus(false);
        
        setInterval(() => {
            const mockData = {
                load: 15.5 + Math.random() * 5,
                swl: 100.0,
                trolley: 25.3 + Math.random() * 2,
                hook: 10.8 + Math.random() * 1,
                wind: 3.2 + Math.random() * 2,
                safety_level: 'safe',
                hoist_active: Math.random() > 0.7,
                trolley_active: Math.random() > 0.8,
                slew_active: Math.random() > 0.9,
                utilization_active: Math.random() > 0.5,
                utilization_minutes: 245,
                overload_active: false,
                bypass_active: false,
                status_word: 0x0123,
                counters: {
                    hookup: 42,
                    hookdown: 38,
                    trolleyin: 15,
                    trolleyout: 12
                },
                test_mode: {
                    in_progress: false,
                    all_complete: true,
                    ls1_tested: true,
                    ls2_tested: true,
                    ls3_tested: true,
                    ls4_tested: true,
                    ls1_hit: false,
                    ls2_hit: false,
                    ls3_hit: false,
                    ls4_hit: false,
                    remaining_seconds: 600,
                    warning_active: false
                }
            };
            
            this.updateUI(mockData);
        }, 1000);
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏗️ Crane Monitor Loaded');
    const app = new CraneMonitor();
});

