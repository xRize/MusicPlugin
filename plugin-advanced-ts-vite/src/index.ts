import { MediaWidget } from './components/MediaWidget'
import './index.css'

let loaded = false;

export function init(context: any) {
    console.log('[MediaPlugin] Initializing...')
}

export function load() {
    if (loaded) return;
    loaded = true;
    console.log('[MediaPlugin] load() called')
    new MediaWidget();
    console.log('[MediaPlugin] MediaWidget created')
}

// Call load immediately if we're not using the plugin loader's lifecycle
// or as a fallback. Many Pengu templates actually just export these,
// but let's be safe.
try {
    load();
} catch (e) {
    console.error('[MediaPlugin] Auto-load failed', e);
}
