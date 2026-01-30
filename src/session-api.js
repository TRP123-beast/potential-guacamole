// Session Management API Endpoints for Dashboard Server

export function registerSessionEndpoints(app) {
    // GET session status
    app.get('/api/session-status', async (req, res) => {
        try {
            const { getSessionMetadata } = await import('./session-manager.js');
            const metadata = await getSessionMetadata();

            res.json({
                success: true,
                session: {
                    isValid: metadata.isValid || false,
                    lastLogin: metadata.lastLogin || null,
                    userEmail: metadata.userEmail || process.env.BROKERBAY_USERNAME || process.env.USER_EMAIL,
                    createdAt: metadata.createdAt || null
                }
            });
        } catch (error) {
            console.error('Error fetching session status:', error);
            res.json({
                success: true,
                session: {
                    isValid: false,
                    lastLogin: null,
                    userEmail: process.env.BROKERBAY_USERNAME || process.env.USER_EMAIL,
                    createdAt: null
                }
            });
        }
    });

    // POST manual login trigger
    app.post('/api/manual-login', (req, res) => {
        try {
            console.log('📝 Manual login requested from dashboard');

            const { spawn } = require('child_process');

            // Spawn the manual-login.js script
            const child = spawn('node', ['manual-login.js'], {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    HEADLESS: 'false' // Always visible for manual login
                },
                detached: true,
                stdio: 'ignore'
            });

            // Unref so the parent process can exit independently
            child.unref();

            console.log('✅ Manual login script started (PID: ' + child.pid + ')');

            res.json({
                success: true,
                message: 'Manual login script started. A browser window should open shortly.',
                pid: child.pid
            });

        } catch (error) {
            console.error('❌ Error starting manual login:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}
