import { MediaService, MediaUpdate } from '../services/MediaService';

export class MediaWidget {
    private container: HTMLDivElement | null = null;
    private art: HTMLImageElement | null = null;
    private title: HTMLSpanElement | null = null;
    private artist: HTMLSpanElement | null = null;
    private playBtn: HTMLButtonElement | null = null;
    private nextBtn: HTMLButtonElement | null = null;
    private lastData: MediaUpdate | null = null;

    private isPlaying = false;
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private startRight = 30;
    private startBottom = 30;

    constructor() {
        this.initUI();
        MediaService.getInstance().subscribe((update) => this.update(update));
    }

    private initUI() {
        // Remove existing widget if any (e.g. from hot reload or multiple calls)
        const removeExisting = () => {
            const existing = document.getElementById('pengu-media-widget');
            if (existing) {
                console.log('[MediaPlugin] Removing residual widget');
                existing.remove();
                return true;
            }
            return false;
        };

        // Try to remove it multiple times in case it's being added asynchronously
        removeExisting();
        
        this.container = document.createElement('div');
        this.container.id = 'pengu-media-widget';
        this.container.className = 'media-widget hidden';

        const artContainer = document.createElement('div');
        artContainer.className = 'media-art-container';
        this.art = document.createElement('img');
        this.art.className = 'media-art';
        artContainer.appendChild(this.art);

        const info = document.createElement('div');
        info.className = 'media-info';
        this.title = document.createElement('span');
        this.title.className = 'media-title';
        this.artist = document.createElement('span');
        this.artist.className = 'media-artist';
        info.appendChild(this.title);
        info.appendChild(this.artist);

        const controls = document.createElement('div');
        controls.className = 'media-controls';

        this.playBtn = document.createElement('button');
        this.playBtn.className = 'play-pause-btn';
        this.updatePlayPauseIcon(false);
        this.playBtn.onclick = (e) => {
            e.stopPropagation();
            MediaService.getInstance().sendCommand('toggle');
        };
        // Prevent drag when clicking controls
        this.playBtn.onmousedown = (e) => e.stopPropagation();
        this.playBtn.onmouseup = (e) => e.stopPropagation();

        this.nextBtn = document.createElement('button');
        this.nextBtn.className = 'next-btn';
        this.nextBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
        this.nextBtn.onclick = (e) => {
            e.stopPropagation();
            MediaService.getInstance().sendCommand('next');
        };
        this.nextBtn.onmousedown = (e) => e.stopPropagation();
        this.nextBtn.onmouseup = (e) => e.stopPropagation();

        controls.appendChild(this.playBtn);
        controls.appendChild(this.nextBtn);

        this.container.appendChild(artContainer);
        this.container.appendChild(info);
        this.container.appendChild(controls);

        this.initDragAndDrop();

        const appendWidget = () => {
            // Re-check for existing to avoid race conditions during late appends
            const allWidgets = document.querySelectorAll('#pengu-media-widget');
            if (allWidgets.length > 1) {
                allWidgets.forEach((w, i) => {
                    if (w !== this.container) {
                        console.log('[MediaPlugin] Cleaning up extra widget instance');
                        w.remove();
                    }
                });
            }

            const viewport = document.getElementById('rcp-fe-viewport-root');
            if (viewport) {
                if (this.container!.parentElement !== viewport) {
                    viewport.appendChild(this.container!);
                    console.log('[MediaPlugin] UI Appended to viewport-root');
                }
            } else if (document.body) {
                if (this.container!.parentElement !== document.body) {
                    document.body.appendChild(this.container!);
                    console.log('[MediaPlugin] UI Appended to body');
                }
            }
            
            // Keep checking for viewport-root even if appended to body,
            // as viewport-root is the better place for it in League client.
            if (!viewport || this.container!.parentElement !== viewport) {
                setTimeout(appendWidget, 500);
            }
        };

        appendWidget();
    }

    private initDragAndDrop() {
        if (!this.container) return;

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isDragging || !this.container) return;
            
            // Re-calculate delta from current mouse pos
            const dx = this.startX - e.clientX;
            const dy = this.startY - e.clientY;

            this.container.style.right = (this.startRight + dx) + 'px';
            this.container.style.bottom = (this.startBottom + dy) + 'px';
            
            // Avoid transition while dragging for smoothness
            this.container.style.transition = 'none';
        };

        const onMouseUp = () => {
            if (!this.isDragging || !this.container) return;
            this.isDragging = false;
            this.container.style.transition = ''; // Restore transitions
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        this.container.addEventListener('mousedown', (e) => {
            // Only start drag if it's the container or info, not buttons (stopped by propagation)
            this.isDragging = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            
            const style = window.getComputedStyle(this.container!);
            this.startRight = parseInt(style.right) || 30;
            this.startBottom = parseInt(style.bottom) || 30;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    private updatePlayPauseIcon(playing: boolean) {
        if (!this.playBtn) return;
        
        // Simple SVG instead of emoji
        const playIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
        const pauseIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        
        this.playBtn.innerHTML = playing ? pauseIcon : playIcon;
    }

    private update(update: MediaUpdate) {
        console.log('[MediaPlugin] Update received:', update.title, update.isPlaying);
        if (!this.container || !this.art || !this.title || !this.artist || !this.playBtn) return;

        this.isPlaying = update.isPlaying;
        this.updatePlayPauseIcon(update.isPlaying);

        if (this.nextBtn) {
            // Some apps might not support skip next, but typically most do
            this.nextBtn.style.display = 'flex';
        }

        if (update.title && update.title.trim() !== "") {
            this.title.textContent = update.title;
            this.artist.textContent = update.artist || 'Unknown Artist';
            
            if (update.artwork) {
                this.art.src = update.artwork;
                this.art.style.display = 'block';
            } else {
                this.art.src = '';
                this.art.style.display = 'none';
            }

            this.container.classList.remove('hidden');
            if (this.isPlaying) {
                this.container.classList.remove('paused');
            } else {
                this.container.classList.add('paused');
            }
        } else {
            // No title, hide it
            this.container.classList.add('hidden');
        }

        this.lastData = update;
    }
}
