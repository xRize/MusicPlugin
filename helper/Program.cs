using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using System.Diagnostics;
using Windows.Media.Control;
using Windows.Storage.Streams;
using Fleck;
using Microsoft.Win32;

namespace MediaCompanion;

public class MediaUpdate
{
    public string Title { get; set; } = "";
    public string Artist { get; set; } = "";
    public string Album { get; set; } = "";
    public string Artwork { get; set; } = "";
    public bool IsPlaying { get; set; }
    public string Source { get; set; } = "";
    public double Position { get; set; }
    public double Duration { get; set; }
}

class Program
{
    private static Mutex? _mutex;
    private static GlobalSystemMediaTransportControlsSessionManager? _manager;
    private static readonly ConcurrentDictionary<Guid, IWebSocketConnection> _sockets = new();
    private static readonly ConcurrentDictionary<string, DateTime> _sessionUpdateTimes = new();
    private static MediaUpdate? _lastUpdate;
    private static string? _lastSessionId;
    private static bool _isClientActive = false;

    private static readonly List<string> PreferredApps = new() { "Spotify", "VLC", "vlc", "Chrome", "msedge", "Music" };
    private static readonly List<string> IgnoreApps = new() { "Idle" };

    static async Task Main(string[] args)
    {
        _mutex = new Mutex(true, "MusicPluginMediaCompanion", out bool createdNew);
        if (!createdNew) return;

        RegisterForStartup();

        var server = new WebSocketServer("ws://127.0.0.1:8181");
        server.Start(socket =>
        {
            socket.OnOpen = () =>
            {
                _sockets.TryAdd(socket.ConnectionInfo.Id, socket);
                if (_lastUpdate != null)
                {
                    SendUpdate(socket, _lastUpdate);
                }
            };
            socket.OnClose = () => _sockets.TryRemove(socket.ConnectionInfo.Id, out _);
            socket.OnMessage = message => {
                _ = Task.Run(async () => await HandleCommand(message));
            };
        });

        _manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        _manager.SessionsChanged += OnSessionsChanged;

        _ = Task.Run(WatchdogLoop);

        Console.WriteLine("WebSocket Server running on ws://127.0.0.1:8181");
        Console.WriteLine("Background watchdog active. Press Ctrl+C to exit (if running in console).");
        await Task.Delay(-1); // Keep alive
    }

    private static void RegisterForStartup()
    {
        try
        {
            string? path = Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(path)) return;

            // Register for Startup (Windows Run Key)
            using (var key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true))
            {
                if (key != null)
                {
                    key.SetValue("MusicPluginMediaCompanion", $"\"{path}\"");
                }
            }

            // Register Custom Protocol (media-companion://)
            // This allows triggering the app from JS if needed
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\media-companion"))
            {
                if (key != null)
                {
                    key.SetValue("", "URL:Media Companion Protocol");
                    key.SetValue("URL Protocol", "");
                    using (var shellKey = key.CreateSubKey(@"shell\open\command"))
                    {
                        if (shellKey != null)
                        {
                            shellKey.SetValue("", $"\"{path}\"");
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Could not register for startup/protocol: {ex.Message}");
        }
    }

    private static async Task HandleCommand(string json)
    {
        try
        {
            var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "command")
            {
                if (doc.RootElement.TryGetProperty("command", out var cmdProp))
                {
                    var command = cmdProp.GetString();
                    var sessions = _manager?.GetSessions();
                    if (sessions == null) return;

                    // Select the session we're currently showing, if possible
                    var session = sessions.FirstOrDefault(s => s.SourceAppUserModelId == _lastSessionId);
                    if (session == null) session = SelectBestSession(sessions);
                    if (session == null) return;

                    Console.WriteLine($"Command received: {command} (Target: {session.SourceAppUserModelId})");

                    switch (command)
                    {
                        case "play": await session.TryPlayAsync(); break;
                        case "pause": await session.TryPauseAsync(); break;
                        case "toggle":
                            var playback = session.GetPlaybackInfo();
                            if (playback?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                                await session.TryPauseAsync();
                            else
                                await session.TryPlayAsync();
                            break;
                        case "next": await session.TrySkipNextAsync(); break;
                        case "previous": await session.TrySkipPreviousAsync(); break;
                        case "request-update": UpdateActiveSession(); break;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error handling command: {ex.Message}");
        }
    }

    private static void OnSessionsChanged(GlobalSystemMediaTransportControlsSessionManager sender, SessionsChangedEventArgs args)
    {
        Console.WriteLine("Sessions list updated.");
        SyncSessions();
        UpdateActiveSession();
    }

    private static void SyncSessions()
    {
        if (_manager == null) return;
        var sessions = _manager.GetSessions();
        Console.WriteLine($"Found {sessions.Count} sessions:");
        foreach (var s in sessions)
        {
            Console.WriteLine($"- {s.SourceAppUserModelId}");
            s.PlaybackInfoChanged -= OnPlaybackInfoChanged;
            s.PlaybackInfoChanged += OnPlaybackInfoChanged;
            s.MediaPropertiesChanged -= OnMediaPropertiesChanged;
            s.MediaPropertiesChanged += OnMediaPropertiesChanged;
            // Timeline updates are no longer needed as the progress bar was removed
            // s.TimelinePropertiesChanged -= OnTimelinePropertiesChanged;
            // s.TimelinePropertiesChanged += OnTimelinePropertiesChanged;
        }
    }

    private static void OnPlaybackInfoChanged(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args)
    {
        _sessionUpdateTimes[sender.SourceAppUserModelId] = DateTime.Now;
        UpdateActiveSession();
    }

    private static void OnMediaPropertiesChanged(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args)
    {
        _sessionUpdateTimes[sender.SourceAppUserModelId] = DateTime.Now;
        UpdateActiveSession();
    }

    private static void OnTimelinePropertiesChanged(GlobalSystemMediaTransportControlsSession sender, TimelinePropertiesChangedEventArgs args)
    {
        // Don't call UpdateActiveSession directly as timeline changes are frequent
        // We can just call FetchAndBroadcast if it's the active session
        if (sender.SourceAppUserModelId == _lastSessionId)
        {
            _ = Task.Run(async () => await FetchAndBroadcast(sender));
        }
    }

    private static SemaphoreSlim _updateLock = new SemaphoreSlim(1, 1);
    private static string? _pendingSessionId;
    private static CancellationTokenSource? _switchCts;

    private static async void UpdateActiveSession()
    {
        if (_manager == null) return;
        await _updateLock.WaitAsync();
        try {
            var sessions = _manager.GetSessions();
            var session = SelectBestSession(sessions);

            if (session == null)
            {
                if (_lastSessionId != null)
                {
                    _lastSessionId = null;
                    _lastUpdate = null;
                    BroadcastUpdate(new MediaUpdate { IsPlaying = false });
                    Console.WriteLine("No active session.");
                }
                return;
            }

            var sessionId = session.SourceAppUserModelId;

            if (sessionId != _lastSessionId)
            {
                if (sessionId == _pendingSessionId) return;

                _pendingSessionId = sessionId;
                _switchCts?.Cancel();
                _switchCts = new CancellationTokenSource();
                var token = _switchCts.Token;

                _ = Task.Run(async () => {
                    try {
                        await Task.Delay(500, token); // 500ms debounce for switching
                        if (token.IsCancellationRequested) return;

                        await _updateLock.WaitAsync();
                        try {
                            _lastSessionId = sessionId;
                            _pendingSessionId = null;
                            Console.WriteLine($"Active Session switched to: {_lastSessionId}");
                            await FetchAndBroadcast(session);
                        } finally {
                            _updateLock.Release();
                        }
                    } catch (TaskCanceledException) {}
                });
                return;
            }

            await FetchAndBroadcast(session);
        } finally {
            _updateLock.Release();
        }
    }

    private static GlobalSystemMediaTransportControlsSession? SelectBestSession(IReadOnlyList<GlobalSystemMediaTransportControlsSession> sessions)
    {
        if (sessions.Count == 0) return null;

        var filtered = sessions.Where(s => !IgnoreApps.Any(ignore => s.SourceAppUserModelId.Contains(ignore, StringComparison.OrdinalIgnoreCase))).ToList();
        if (!filtered.Any()) return null;

        return filtered.OrderByDescending(s => s.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                      .ThenBy(s => {
                          var idx = PreferredApps.FindIndex(p => s.SourceAppUserModelId.Contains(p, StringComparison.OrdinalIgnoreCase));
                          return idx == -1 ? int.MaxValue : idx;
                      })
                      .ThenByDescending(s => _sessionUpdateTimes.TryGetValue(s.SourceAppUserModelId, out var time) ? time : DateTime.MinValue)
                      .FirstOrDefault();
    }

    private static DateTime _lastTimelineUpdate = DateTime.MinValue;

    private static async Task FetchAndBroadcast(GlobalSystemMediaTransportControlsSession session)
    {
        try
        {
            // Small delay to allow OS to update properties
            await Task.Delay(100);

            var props = await session.TryGetMediaPropertiesAsync();
            
            // Retry once if title is empty but we expect something
            if (string.IsNullOrEmpty(props?.Title) && session.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
            {
                await Task.Delay(400);
                props = await session.TryGetMediaPropertiesAsync();
            }

            var playback = session.GetPlaybackInfo();
            var timeline = session.GetTimelineProperties();

            var update = new MediaUpdate
            {
                Title = props?.Title ?? "",
                Artist = props?.Artist ?? "",
                Album = props?.AlbumTitle ?? "",
                IsPlaying = playback?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,
                Source = session.SourceAppUserModelId,
                Position = timeline?.Position.TotalMilliseconds ?? 0,
                Duration = timeline?.EndTime.TotalMilliseconds ?? 0,
            };

            if (props?.Thumbnail != null)
            {
                update.Artwork = await GetBase64Artwork(props.Thumbnail);
            }

            // Check if it's just a position update (to avoid heavy base64 broadcasting)
            bool isMetadataSame = _lastUpdate != null && 
                                 _lastUpdate.Title == update.Title && 
                                 _lastUpdate.Artist == update.Artist && 
                                 _lastUpdate.IsPlaying == update.IsPlaying &&
                                 _lastUpdate.Artwork == update.Artwork;

            if (isMetadataSame)
            {
                // If metadata is same, only broadcast if position/duration changed significantly or 1s passed
                if (Math.Abs(_lastUpdate!.Position - update.Position) < 500 && (DateTime.Now - _lastTimelineUpdate).TotalMilliseconds < 1000)
                {
                    return;
                }
            }
            else
            {
                 Console.WriteLine($"Update: {update.Title} - {update.Artist} (Playing: {update.IsPlaying})");
            }

            _lastUpdate = update;
            _lastTimelineUpdate = DateTime.Now;
            BroadcastUpdate(update);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching metadata: {ex.Message}");
        }
    }

    private static async Task<string> GetBase64Artwork(IRandomAccessStreamReference thumb)
    {
        try
        {
            using var stream = await thumb.OpenReadAsync();
            using var reader = new DataReader(stream.GetInputStreamAt(0));
            await reader.LoadAsync((uint)stream.Size);
            var buffer = new byte[stream.Size];
            reader.ReadBytes(buffer);
            return "data:image/png;base64," + Convert.ToBase64String(buffer);
        }
        catch
        {
            return "";
        }
    }

    private static readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static void BroadcastUpdate(MediaUpdate update)
    {
        var json = JsonSerializer.Serialize(new { type = "update", data = update }, _jsonOptions);
        foreach (var socket in _sockets.Values)
        {
            socket.Send(json);
        }
    }

    private static void SendUpdate(IWebSocketConnection socket, MediaUpdate update)
    {
        var json = JsonSerializer.Serialize(new { type = "update", data = update }, _jsonOptions);
        socket.Send(json);
    }

    private static async Task WatchdogLoop()
    {
        while (true)
        {
            var processes = Process.GetProcessesByName("LeagueClient");
            bool isLeagueRunning = processes.Length > 0;

            if (isLeagueRunning)
            {
                if (!_isClientActive)
                {
                    _isClientActive = true;
                    SyncSessions();
                    UpdateActiveSession();
                }
            }
            else
            {
                if (_isClientActive)
                {
                    _isClientActive = false;
                    _lastSessionId = null;
                    _lastUpdate = null;
                    BroadcastUpdate(new MediaUpdate { IsPlaying = false });
                }
            }

            await Task.Delay(5000);
        }
    }
}
