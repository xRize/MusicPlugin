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
    private isManuallyClosed = false;
    private startX = 0;
    private startY = 0;
    private startRight = 30;
    private startBottom = 30;

    private updateCallback = (update: MediaUpdate) => this.update(update);

    constructor() {
        // Prevent multiple instances across reloads or double calls
        const anyWin = window as any;
        if (anyWin.__MEDIA_WIDGET_INSTANCE__) {
            console.log('[MediaPlugin] Widget instance already exists, removing old one.');
            try {
                // If the old instance exists, we'll try to let it clean up
                const oldInstance = anyWin.__MEDIA_WIDGET_INSTANCE__;
                if (typeof oldInstance.destroy === 'function') {
                    oldInstance.destroy();
                } else if (oldInstance.container && oldInstance.container.parentElement) {
                    oldInstance.container.remove();
                }
                // Allow new instance to append
                anyWin.__MEDIA_WIDGET_APPENDED__ = false;
            } catch (e) {
                console.error('[MediaPlugin] Failed to cleanup old widget instance', e);
            }
        }
        anyWin.__MEDIA_WIDGET_INSTANCE__ = this;

        this.initUI();
        MediaService.getInstance().subscribe(this.updateCallback);
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
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.isManuallyClosed = true;
            if (this.container) {
                this.container.classList.add('hidden');
                // Use timeout to allow transition before display: none
                setTimeout(() => {
                    if (this.isManuallyClosed && this.container) {
                        this.container.style.display = 'none';
                    }
                }, 500);
            }
        };
        closeBtn.onmousedown = (e) => e.stopPropagation();

        this.container = document.createElement('div');
        this.container.id = 'pengu-media-widget';
        this.container.className = 'media-widget hidden';
        this.container.appendChild(closeBtn);

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
            if (this.container?.parentElement) return;

            // Global check for any instance already appended
            const anyWin = window as any;
            if (anyWin.__MEDIA_WIDGET_APPENDED__) {
                console.log('[MediaPlugin] A widget is already appended, skipping');
                return;
            }

            if (document.getElementById('pengu-media-widget')) {
                console.log('[MediaPlugin] Widget element already exists, skipping append');
                anyWin.__MEDIA_WIDGET_APPENDED__ = true;
                return;
            }

            let viewport = document.getElementById('rcp-fe-viewport-root');
            if (viewport) {
                viewport.appendChild(this.container!);
                anyWin.__MEDIA_WIDGET_APPENDED__ = true;
                console.log('[MediaPlugin] UI Appended to viewport-root');
                return;
            }

            if (!document.body) {
                window.addEventListener('DOMContentLoaded', () => {
                    appendWidget();
                }, { once: true });
                return;
            }

            const observer = new MutationObserver((_, obs) => {
                if (anyWin.__MEDIA_WIDGET_APPENDED__ || document.getElementById('pengu-media-widget')) {
                    console.log('[MediaPlugin] Widget already exists (observer), skipping append');
                    anyWin.__MEDIA_WIDGET_APPENDED__ = true;
                    obs.disconnect();
                    return;
                }

                viewport = document.getElementById('rcp-fe-viewport-root');
                if (viewport) {
                    viewport.appendChild(this.container!);
                    anyWin.__MEDIA_WIDGET_APPENDED__ = true;
                    console.log('[MediaPlugin] UI Appended to viewport-root');
                    obs.disconnect();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
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

            let nextRight = this.startRight + dx;
            let nextBottom = this.startBottom + dy;

            // Boundary checks
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const widgetWidth = this.container.offsetWidth || 320;
            const widgetHeight = this.container.offsetHeight || 54;
            const buttonOffset = 6;

            if (nextRight < buttonOffset) nextRight = buttonOffset;
            if (nextBottom < 0) nextBottom = 0;
            if (nextRight > viewportWidth - widgetWidth) nextRight = viewportWidth - widgetWidth;
            if (nextBottom > viewportHeight - widgetHeight - buttonOffset) nextBottom = viewportHeight - widgetHeight - buttonOffset;

            this.container.style.right = nextRight + 'px';
            this.container.style.bottom = nextBottom + 'px';
            
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

    public destroy() {
        if (this.container && this.container.parentElement) {
            this.container.remove();
        }
        MediaService.getInstance().unsubscribe(this.updateCallback);
        const anyWin = window as any;
        if (anyWin.__MEDIA_WIDGET_INSTANCE__ === this) {
            anyWin.__MEDIA_WIDGET_INSTANCE__ = null;
        }
    }

    private update(update: MediaUpdate) {
        if (this.lastData && 
            this.lastData.title === update.title && 
            this.lastData.isPlaying === update.isPlaying &&
            this.lastData.artwork === update.artwork) {
            return;
        }

        // Reset manual close when track changes (only if it's a valid new title)
        if (update.title && update.title.trim() !== "" && this.lastData?.title !== update.title) {
            this.isManuallyClosed = false;
        }

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

            if (!this.isManuallyClosed) {
                this.container.classList.remove('hidden');
                // Ensure display is restored in case it was set to none
                this.container.style.display = 'flex';
            } else {
                this.container.classList.add('hidden');
                // Hide from layout if manually closed
                this.container.style.display = 'none';
            }

            if (this.isPlaying) {
                this.container.classList.remove('paused');
            } else {
                this.container.classList.add('paused');
            }
        } else {
            // No title, hide it
            this.container.classList.add('hidden');
            // For "redundancy" and "cannot be closed" issues, 
            // set display none immediately when there's no track
            this.container.style.display = 'none';
        }

        this.lastData = update;
    }
}
