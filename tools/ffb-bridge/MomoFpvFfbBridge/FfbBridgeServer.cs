using System.Buffers;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MomoFpvFfbBridge;

internal sealed class FfbBridgeServer : IAsyncDisposable
{
    private const int Protocol = 1;
    private const string BridgeName = "Momo FPV FFB Bridge";
    private const string BridgeVersion = "0.3.2-t300-telemetry-pulse";
    private static readonly TimeSpan FfbTimeout = TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan StatusMinInterval = TimeSpan.FromMilliseconds(90);
    private static readonly TimeSpan BaselineApplyInterval = TimeSpan.FromMilliseconds(20);

    private readonly BridgeConfig _config;
    private readonly IFfbBackend _backend;
    private readonly TcpListener _listener;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    private readonly object _ffbGate = new();
    private readonly ImpactPulseMixer _impactPulse = new();
    private BaselineFfbCommand? _baselineFfb;
    private bool _baselineDirty;
    private DateTimeOffset _lastFfbApplyAt = DateTimeOffset.MinValue;
    private int _lastImpactPulseSegment = -1;
    private int _activeClientCount;

    public bool IsListening { get; private set; }
    public int ActiveClientCount => Volatile.Read(ref _activeClientCount);

    public FfbBridgeServer(BridgeConfig config, IFfbBackend backend)
    {
        _config = config;
        _backend = backend;
        _listener = new TcpListener(IPAddress.Parse(config.Host), config.Port);
    }

    public async Task RunAsync(CancellationToken token)
    {
        try
        {
            _listener.Start();
        }
        catch (Exception ex)
        {
            BridgeLog.Error($"Listener start failed for ws://{_config.Host}:{_config.Port}.", ex);
            throw;
        }
        IsListening = true;
        BridgeLog.Info($"Listening on ws://{_config.Host}:{_config.Port}.");
        Console.WriteLine($"{BridgeName} {BridgeVersion}");
        Console.WriteLine($"Listening on ws://{_config.Host}:{_config.Port}");
        Console.WriteLine($"Backend: {_backend.BackendName}; max output clamp {_config.MaxOutput:0.00}");

        _ = Task.Run(() => SafetyLoopAsync(token), token);

        while (!token.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync(token);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            _ = Task.Run(() => HandleClientAsync(client, token), token);
        }
    }

    private async Task SafetyLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            _backend.TickSafetyTimeout(FfbTimeout);
            try
            {
                TickFfbOutput();
                await Task.Delay(10, token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken token)
    {
        using var _ = client;
        client.NoDelay = true;

        var stream = client.GetStream();
        var handshake = await ReadHandshakeAsync(stream, token);
        if (handshake is null) return;

        // Bridge はViewer PCのloopbackからだけ受け、Viewer originはlocalhostまたは明示許可分に限定する。
        if (!IsLocalEndpoint(client.Client.RemoteEndPoint) || !_config.IsAllowedOrigin(handshake.Origin))
        {
            BridgeLog.Warn($"Rejected client. remote={client.Client.RemoteEndPoint}, origin={handshake.Origin}");
            await WriteHttpResponseAsync(stream, "403 Forbidden", "Forbidden\n", token);
            return;
        }

        if (string.IsNullOrWhiteSpace(handshake.WebSocketKey))
        {
            await WriteHttpResponseAsync(
                stream,
                "200 OK",
                $"{BridgeName} {BridgeVersion}\nWebSocket: ws://{_config.Host}:{_config.Port}\n",
                token);
            return;
        }

        await WriteWebSocketUpgradeAsync(stream, handshake.WebSocketKey, token);
        using var webSocket = WebSocket.CreateFromStream(stream, true, null, TimeSpan.FromSeconds(20));
        var state = new ClientState();
        Interlocked.Increment(ref _activeClientCount);
        BridgeLog.Info($"Viewer connected. origin={handshake.Origin}, clients={ActiveClientCount}");
        try
        {
            await ReceiveLoopAsync(webSocket, state, token);
        }
        finally
        {
            Interlocked.Decrement(ref _activeClientCount);
            BridgeLog.Info($"Viewer disconnected. clients={ActiveClientCount}");
        }
    }

    private async Task ReceiveLoopAsync(WebSocket webSocket, ClientState state, CancellationToken token)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(65536);
        try
        {
            while (webSocket.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await webSocket.ReceiveAsync(buffer, token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "closing", token);
                        return;
                    }
                    message.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                if (result.MessageType != WebSocketMessageType.Text) continue;
                var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                await HandleMessageAsync(webSocket, state, text, token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            Console.WriteLine($"client error: {ex.Message}");
            BridgeLog.Error("Viewer WebSocket error.", ex);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private async Task HandleMessageAsync(WebSocket webSocket, ClientState state, string text, CancellationToken token)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(text);
        }
        catch
        {
            await SendAsync(webSocket, new { type = "error", code = "BAD_JSON", message = "Invalid JSON." }, token);
            return;
        }

        using (document)
        {
            var root = document.RootElement;
            var type = ReadString(root, "type");
            switch (type)
            {
                case "hello":
                    await SendAsync(webSocket, new
                    {
                        type = "helloAck",
                        protocol = Protocol,
                        bridgeName = BridgeName,
                        bridgeVersion = BridgeVersion,
                        platform = "win32",
                        backend = _backend.BackendName
                    }, token);
                    break;

                case "listDevices":
                    await SendAsync(webSocket, new { type = "deviceList", devices = _backend.ListDevices() }, token);
                    break;

                case "acquireDevice":
                {
                    // ブラウザ側で選んだDirectInputデバイスをacquireします。
                    // preferExclusive=trueでも失敗した場合はbackend側でNonExclusiveへ落とします。
                    var result = _backend.Acquire(ReadString(root, "deviceId"), ReadBool(root, "preferExclusive", true));
                    await SendAsync(webSocket, new
                    {
                        type = "acquired",
                        deviceId = result.DeviceId,
                        ok = result.Ok,
                        exclusive = result.Exclusive,
                        profile = result.Profile,
                        capabilities = result.Capabilities,
                        inputStreaming = ReadBool(root, "inputStreaming", false)
                    }, token);
                    if (!result.Ok)
                    {
                        BridgeLog.Warn($"DirectInput acquire failed. deviceId={ReadString(root, "deviceId")}, message={result.Message}");
                        await SendAsync(webSocket, new { type = "error", code = "ACQUIRE_FAILED", message = result.Message }, token);
                    }
                    break;
                }

                case "releaseDevice":
                    ClearFfbState();
                    _backend.Release();
                    await SendStatusAsync(webSocket, state, "released", force: true, token);
                    break;

                case "setFfb":
                {
                    if (ReadBool(root, "emergencyStop", false))
                    {
                        // 非常停止は通常のstatus間引きを無視して、即座にゼロトルクへ落とします。
                        ClearFfbState();
                        _backend.StopAll("emergencyStop");
                        await SendStatusAsync(webSocket, state, "emergencyStop", force: true, token);
                        break;
                    }

                    // baseline は throttle 由来の speedProxy で抵抗を合成する。
                    // telemetryTorque は Viewer が鮮度・上限を確認済みの局所トルクであり、
                    // 衝突・旋回の体感用としてこの境界でのみ追加する。
                    var effectMode = ReadString(root, "effectMode", "constant");
                    var torque = ReadDouble(root, "torque", 0);
                    var damper = ReadDouble(root, "damper", 0);
                    var friction = ReadDouble(root, "friction", 0);
                    var inertia = ReadDouble(root, "inertia", 0);
                    if (string.Equals(effectMode, "baseline", StringComparison.OrdinalIgnoreCase))
                    {
                        var speed = ClampUnit(ReadDouble(root, "speedProxy", 0));
                        var baseFriction = ClampUnit(ReadDouble(root, "baseFriction", 0.28));
                        var parkingFriction = ClampUnit(ReadDouble(root, "parkingFriction", 0.08));
                        var baseDamper = ClampUnit(ReadDouble(root, "baseDamper", 0.05));
                        var speedDamper = ClampUnit(ReadDouble(root, "speedDamper", 0.15));
                        var lowSpeed = 1.0 - speed;

                        // 停車時の重さは friction、走行中の粘りは damper で作る。
                        // 新しい Viewer は telemetryTorque を送る。最終 torque があれば
                        // HP 由来の振動も含むためそちらを優先し、旧 Viewer は fallback で受ける。
                        var telemetryTorque = ClampSignedUnit(ReadDouble(root, "telemetryTorque", torque));
                        torque = ClampSignedUnit(ReadDouble(root, "torque", telemetryTorque));
                        // 通常はゼロ。Viewer が衝突または旋回を検出した瞬間だけ局所トルクを渡す。
                        friction = ClampUnit(baseFriction + parkingFriction * lowSpeed * lowSpeed);
                        damper = ClampUnit(baseDamper + speedDamper * speed * speed);
                        inertia = 0;
                        effectMode = "constant";
                    }

                    SetBaselineFfb(new BaselineFfbCommand(
                        torque,
                        ReadDouble(root, "gain", 1),
                        ReadBool(root, "enabled", false),
                        effectMode,
                        damper,
                        friction,
                        inertia));
                    await SendStatusAsync(webSocket, state, "", force: false, token);
                    break;
                }

                case "impactPulse":
                {
                    var kind = ReadString(root, "kind", "sideImpact");
                    var strength = ClampUnit(ReadDouble(root, "strength", 0));
                    var direction = Math.Sign(ReadDouble(root, "direction", 0));
                    TriggerImpactPulse(kind, strength, direction);
                    await SendStatusAsync(webSocket, state, "impactPulse", force: true, token);
                    break;
                }

                case "stopAll":
                    // ゲーム終了、接続解除、テスト停止などで呼ぶ安全停止命令です。
                    ClearFfbState();
                    _backend.StopAll("stopAll");
                    await SendStatusAsync(webSocket, state, "stopAll", force: true, token);
                    break;

                case "ping":
                    await SendAsync(webSocket, new { type = "pong", timeMs = ReadDouble(root, "timeMs", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) }, token);
                    break;

                default:
                    await SendAsync(webSocket, new { type = "error", code = "UNKNOWN_MESSAGE", message = $"Unsupported message type: {type}" }, token);
                    break;
            }
        }
    }

    private void SetBaselineFfb(BaselineFfbCommand command)
    {
        lock (_ffbGate)
        {
            _baselineFfb = command;
            _baselineDirty = true;
            if (!command.Enabled)
            {
                _impactPulse.Clear();
                _lastImpactPulseSegment = -1;
                _baselineDirty = false;
                // Drive Off は 20 ms の出力周期を待たず、直ちに出力を止める。
                _backend.StopAll("ffb disabled");
            }
        }
    }

    private void TriggerImpactPulse(string kind, double strength, int direction)
    {
        if (strength <= 0) return;
        lock (_ffbGate)
        {
            if (_baselineFfb is not { Enabled: true }) return;
            _impactPulse.Trigger(kind, strength, direction, DateTimeOffset.UtcNow);
            var sample = _impactPulse.Sample(DateTimeOffset.UtcNow);
            // 通常 setFfb の到着待ちをせず、イベント受信時点の基準出力へ即時に加算する。
            ApplyCompositeFfbLocked(sample.Torque);
            _lastImpactPulseSegment = sample.Index;
            _lastFfbApplyAt = DateTimeOffset.UtcNow;
            _baselineDirty = false;
        }
    }

    private void TickFfbOutput()
    {
        lock (_ffbGate)
        {
            if (_baselineFfb is not { Enabled: true }) return;
            var now = DateTimeOffset.UtcNow;
            var sample = _impactPulse.Sample(now);
            var pulseChanged = sample.Index != _lastImpactPulseSegment;
            var baselineDue = _baselineDirty && now - _lastFfbApplyAt >= BaselineApplyInterval;
            if (!pulseChanged && !baselineDue) return;

            ApplyCompositeFfbLocked(sample.Torque);
            _lastImpactPulseSegment = sample.Index;
            _lastFfbApplyAt = now;
            _baselineDirty = false;
        }
    }

    private void ClearFfbState()
    {
        lock (_ffbGate)
        {
            _baselineFfb = null;
            _impactPulse.Clear();
            _baselineDirty = false;
            _lastImpactPulseSegment = -1;
            _lastFfbApplyAt = DateTimeOffset.MinValue;
        }
    }

    private void ApplyCompositeFfbLocked(double pulseTorque)
    {
        if (_baselineFfb is not { } baseline) return;
        // impactPulse は通常の旋回トルクを置換せず加算する。最終クランプは backend 側でも行う。
        _backend.SetFfb(
            ClampSignedUnit((baseline.Torque * baseline.Gain) + pulseTorque),
            1,
            baseline.Enabled,
            baseline.EffectMode,
            baseline.Damper,
            baseline.Friction,
            baseline.Inertia);
    }

    private async Task SendStatusAsync(WebSocket webSocket, ClientState state, string message, bool force, CancellationToken token)
    {
        var now = DateTimeOffset.UtcNow;
        if (!force && now - state.LastStatusAt < StatusMinInterval) return;
        state.LastStatusAt = now;
        var status = _backend.Snapshot(message);
        await SendAsync(webSocket, new
        {
            type = "ffbStatus",
            ok = status.Ok,
            clipped = status.Clipped,
            lastTorque = status.LastTorque,
            lastDamper = status.LastDamper,
            lastFriction = status.LastFriction,
            axisOffset = status.AxisOffset,
            axisName = status.AxisName,
            effectMode = status.EffectMode,
            profile = status.Profile,
            capabilities = status.Capabilities,
            deviceId = status.DeviceId,
            deviceName = status.DeviceName,
            acquired = status.Acquired,
            exclusive = status.Exclusive,
            backend = _backend.BackendName,
            maxOutput = _config.MaxOutput,
            deviceLost = status.DeviceLost,
            message = status.Message
        }, token);
    }

    private async Task SendAsync(WebSocket webSocket, object message, CancellationToken token)
    {
        if (webSocket.State != WebSocketState.Open) return;
        var json = JsonSerializer.Serialize(message, _json);
        var bytes = Encoding.UTF8.GetBytes(json);
        await webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, token);
    }

    private static async Task<Handshake?> ReadHandshakeAsync(NetworkStream stream, CancellationToken token)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(8192);
        try
        {
            var length = 0;
            while (length < buffer.Length)
            {
                var count = await stream.ReadAsync(buffer.AsMemory(length, buffer.Length - length), token);
                if (count <= 0) return null;
                length += count;
                if (IndexOfHeaderEnd(buffer, length) >= 0) break;
            }

            var request = Encoding.ASCII.GetString(buffer, 0, length);
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in request.Split("\r\n").Skip(1))
            {
                var split = line.IndexOf(':');
                if (split <= 0) continue;
                headers[line[..split].Trim()] = line[(split + 1)..].Trim();
            }

            headers.TryGetValue("Sec-WebSocket-Key", out var key);
            headers.TryGetValue("Origin", out var origin);
            return new Handshake(key ?? "", origin ?? "");
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private static int IndexOfHeaderEnd(byte[] buffer, int length)
    {
        for (var i = 3; i < length; i++)
        {
            if (buffer[i - 3] == '\r' && buffer[i - 2] == '\n' && buffer[i - 1] == '\r' && buffer[i] == '\n') return i - 3;
        }
        return -1;
    }

    private static async Task WriteWebSocketUpgradeAsync(NetworkStream stream, string key, CancellationToken token)
    {
        var acceptBytes = SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"));
        var accept = Convert.ToBase64String(acceptBytes);
        var response =
            "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            $"Sec-WebSocket-Accept: {accept}\r\n" +
            "\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(response), token);
    }

    private static async Task WriteHttpResponseAsync(NetworkStream stream, string status, string body, CancellationToken token)
    {
        var bodyBytes = Encoding.UTF8.GetBytes(body);
        var response =
            $"HTTP/1.1 {status}\r\n" +
            "Content-Type: text/plain; charset=utf-8\r\n" +
            $"Content-Length: {bodyBytes.Length}\r\n" +
            "\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(response), token);
        await stream.WriteAsync(bodyBytes, token);
    }

    private static bool IsLocalEndpoint(EndPoint? endPoint)
    {
        if (endPoint is not IPEndPoint ipEndPoint) return false;
        return IPAddress.IsLoopback(ipEndPoint.Address);
    }

    private static string ReadString(JsonElement root, string name, string fallback = "")
    {
        return root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? fallback
            : fallback;
    }

    private static bool ReadBool(JsonElement root, string name, bool fallback)
    {
        if (!root.TryGetProperty(name, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => fallback
        };
    }

    private static double ReadDouble(JsonElement root, string name, double fallback)
    {
        if (!root.TryGetProperty(name, out var value)) return fallback;
        return value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number)
            ? number
            : fallback;
    }

    private static double ClampUnit(double value)
    {
        return Math.Clamp(double.IsFinite(value) ? value : 0, 0, 1);
    }

    private static double ClampSignedUnit(double value)
    {
        return Math.Clamp(double.IsFinite(value) ? value : 0, -1, 1);
    }

    public ValueTask DisposeAsync()
    {
        IsListening = false;
        _listener.Stop();
        return ValueTask.CompletedTask;
    }

    private sealed record Handshake(string WebSocketKey, string Origin);

    private sealed record BaselineFfbCommand(
        double Torque,
        double Gain,
        bool Enabled,
        string EffectMode,
        double Damper,
        double Friction,
        double Inertia);

    private sealed class ImpactPulseMixer
    {
        private PulseSegment[] _segments = [];
        private DateTimeOffset _startedAt = DateTimeOffset.MinValue;

        public void Trigger(string kind, double strength, int direction, DateTimeOffset now)
        {
            var sign = direction == 0 ? 1 : Math.Sign(direction);
            var amplitude = ClampUnit(strength);
            _segments = kind.ToLowerInvariant() switch
            {
                // グラベルと旧Viewerの縁石は、ベース抵抗に埋もれない長さの細かな左右振動にする。
                "curb" or "gravel" => Build(sign, amplitude,
                    (1.00, 30), (-0.86, 30), (0.74, 30), (-0.62, 30), (0.50, 30), (-0.38, 30)),
                // HIT は片側へ押すだけで終わらせず、接触を分かる短い往復として再生する。
                "hit" => Build(sign, amplitude, (1.00, 60), (-0.82, 68), (0.57, 60), (-0.35, 45)),
                // 側面衝突は衝突方向へ強く振り、すぐ逆側へ少し弱く返す。
                "sideimpact" => Build(sign, amplitude, (1.00, 72), (-0.72, 96)),
                // 正面衝突は左右へ大きく振り、最後に小さく戻す。
                "frontalimpact" => Build(1, amplitude, (1.00, 52), (-1.00, 62), (0.58, 58)),
                _ => Build(sign, amplitude, (1.00, 72), (-0.72, 96)),
            };
            _startedAt = now;
        }

        public void Clear()
        {
            _segments = [];
            _startedAt = DateTimeOffset.MinValue;
        }

        public PulseSample Sample(DateTimeOffset now)
        {
            if (_segments.Length == 0 || _startedAt == DateTimeOffset.MinValue) return PulseSample.Inactive;
            var elapsedMs = (now - _startedAt).TotalMilliseconds;
            if (elapsedMs < 0) return new PulseSample(0, _segments[0].Torque);
            var cursor = 0.0;
            for (var index = 0; index < _segments.Length; index++)
            {
                var segment = _segments[index];
                cursor += segment.DurationMs;
                if (elapsedMs < cursor) return new PulseSample(index, segment.Torque);
            }
            return PulseSample.Inactive;
        }

        private static PulseSegment[] Build(int sign, double amplitude, params (double Scale, int DurationMs)[] definition) =>
            definition.Select(item => new PulseSegment(sign * amplitude * item.Scale, item.DurationMs)).ToArray();

        public sealed record PulseSample(int Index, double Torque)
        {
            public static readonly PulseSample Inactive = new(-1, 0);
        }

        private sealed record PulseSegment(double Torque, int DurationMs);
    }

    private sealed class ClientState
    {
        public DateTimeOffset LastStatusAt { get; set; } = DateTimeOffset.MinValue;
    }
}
