export interface MediaUpdate {
    title: string;
    artist: string;
    album: string;
    artwork: string;
    isPlaying: boolean;
    source: string;
    position: number;
    duration: number;
}

export class MediaService {
    private static instance: MediaService;
    private socket: WebSocket | null = null;
    private listeners: ((update: MediaUpdate) => void)[] = [];
    private reconnectTimeout: number | null = null;
    private pollInterval: any = null;
    private isConnecting = false;

    private constructor() {
        this.connect();
    }

    public static getInstance(): MediaService {
        if (!MediaService.instance) {
            MediaService.instance = new MediaService();
        }
        return MediaService.instance;
    }

    private lastSpawnAttempt = 0;

    private connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        
        console.log('[MediaPlugin] Connecting to companion...');
        this.socket = new WebSocket('ws://127.0.0.1:8181');

        this.socket.onopen = () => {
            console.log('[MediaPlugin] Connected to companion');
            this.isConnecting = false;
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            
            // Request initial state
            this.sendCommand('request-update');
            
            // Start polling every second as requested
            if (this.pollInterval) clearInterval(this.pollInterval);
            this.pollInterval = setInterval(() => this.sendCommand('request-update'), 1000);
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'update') {
                    this.notifyListeners(message.data);
                }
            } catch (err) {
                console.error('[MediaPlugin] Error parsing message', err);
            }
        };

        this.socket.onclose = () => {
            this.isConnecting = false;
            console.log('[MediaPlugin] Connection closed, reconnecting in 5s...');
            
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
            
            this.scheduleReconnect();
            this.tryInitializeCompanion(); // Hands-free initialization attempt
        };

        this.socket.onerror = (err) => {
            this.isConnecting = false;
            console.error('[MediaPlugin] WebSocket error', err);
            this.tryInitializeCompanion();
        };
    }

    private async tryInitializeCompanion() {
        // Debounce spawn attempts (at most once every 30 seconds)
        const now = Date.now();
        if (now - this.lastSpawnAttempt < 30000) return;
        this.lastSpawnAttempt = now;

        // Try to initialize the companion app using whatever APIs might be available in Pengu context
        // This is the "hands-free" part requested by the user.
        
        // 1. Try to open via custom protocol (requires it to be registered at least once)
        try {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'media-companion://start';
            document.body.appendChild(iframe);
            setTimeout(() => {
                if (iframe.parentElement) document.body.removeChild(iframe);
            }, 1000);
        } catch (e) {}

        // 2. If papi is available, try to use its native spawn capabilities
        const anyWindow = window as any;
        if (anyWindow.papi && anyWindow.papi.native && anyWindow.papi.native.spawn) {
            try {
                // If we can find where we are, we can try to launch the exe next to us
                const pluginPath = anyWindow.papi.plugin?.getPluginPath?.() || "";
                if (pluginPath) {
                    const companionPath = pluginPath + "\\MediaCompanion.exe";
                    console.log('[MediaPlugin] Attempting to spawn:', companionPath);
                    anyWindow.papi.native.spawn(companionPath);
                }
            } catch (e) {
                console.error('[MediaPlugin] Failed to spawn via papi', e);
            }
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout) return;
        this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
        }, 5000);
    }

    public subscribe(callback: (update: MediaUpdate) => void) {
        this.listeners.push(callback);
    }

    public sendCommand(command: string) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'command', command }));
        }
    }

    private notifyListeners(update: MediaUpdate) {
        this.listeners.forEach(cb => cb(update));
    }
}
