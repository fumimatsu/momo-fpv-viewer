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
    private const string BridgeVersion = "0.2.0-baseline";
    private const double CenteringStartSpeed = 0.08;
    private const double CenteringFullSpeed = 0.65;
    private static readonly TimeSpan FfbTimeout = TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan StatusMinInterval = TimeSpan.FromMilliseconds(90);

    private readonly BridgeConfig _config;
    private readonly IFfbBackend _backend;
    private readonly TcpListener _listener;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public FfbBridgeServer(BridgeConfig config, IFfbBackend backend)
    {
        _config = config;
        _backend = backend;
        _listener = new TcpListener(IPAddress.Parse(config.Host), config.Port);
    }

    public async Task RunAsync(CancellationToken token)
    {
        _listener.Start();
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
                await Task.Delay(25, token);
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

        // FFBを外部サイトから勝手に操作されないよう、localhostからの接続だけ許可します。
        if (!IsLocalEndpoint(client.Client.RemoteEndPoint) || !_config.IsAllowedOrigin(handshake.Origin))
        {
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
        await ReceiveLoopAsync(webSocket, state, token);
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
                        inputStreaming = ReadBool(root, "inputStreaming", false)
                    }, token);
                    if (!result.Ok)
                    {
                        await SendAsync(webSocket, new { type = "error", code = "ACQUIRE_FAILED", message = result.Message }, token);
                    }
                    break;
                }

                case "releaseDevice":
                    _backend.Release();
                    await SendStatusAsync(webSocket, state, "released", force: true, token);
                    break;

                case "setFfb":
                {
                    if (ReadBool(root, "emergencyStop", false))
                    {
                        // 非常停止は通常のstatus間引きを無視して、即座にゼロトルクへ落とします。
                        _backend.StopAll("emergencyStop");
                        await SendStatusAsync(webSocket, state, "emergencyStop", force: true, token);
                        break;
                    }

                    // baseline は throttle 由来の speedProxy と仮想前輪角を受け、effect 合成は Bridge 側で行う。
                    // telemetry の rack / road / impact effect は次段階で同じ入力点に追加する。
                    var effectMode = ReadString(root, "effectMode", "constant");
                    var torque = ReadDouble(root, "torque", 0);
                    var damper = ReadDouble(root, "damper", 0);
                    var friction = ReadDouble(root, "friction", 0);
                    var inertia = ReadDouble(root, "inertia", 0);
                    if (string.Equals(effectMode, "baseline", StringComparison.OrdinalIgnoreCase))
                    {
                        var speed = ClampUnit(ReadDouble(root, "speedProxy", 0));
                        var baseFriction = ClampUnit(ReadDouble(root, "baseFriction", 0.05));
                        var parkingFriction = ClampUnit(ReadDouble(root, "parkingFriction", 0.10));
                        var baseDamper = ClampUnit(ReadDouble(root, "baseDamper", 0.05));
                        var speedDamper = ClampUnit(ReadDouble(root, "speedDamper", 0.15));
                        var lowSpeed = 1.0 - speed;

                        var virtualSteering = ClampSignedUnit(ReadDouble(root, "virtualSteering", 0));
                        var runningCentering = ClampUnit(ReadDouble(root, "runningCentering", 0.20));
                        var centeringDirection = ReadBool(root, "centeringReverse", true) ? -1.0 : 1.0;
                        var centeringWeight = SmoothStep(speed, CenteringStartSpeed, CenteringFullSpeed);

                        // 停車時の重さは friction、走行中の粘りは damper で作る。
                        // 復帰力は走行開始後だけ立ち上げ、後に車両テレメトリ由来のラック荷重へ置き換える。
                        torque = ClampSignedUnit(virtualSteering * runningCentering * centeringWeight * centeringDirection);
                        friction = ClampUnit(baseFriction + parkingFriction * lowSpeed * lowSpeed);
                        damper = ClampUnit(baseDamper + speedDamper * speed * speed);
                        inertia = 0;
                        effectMode = "constant";
                    }

                    _backend.SetFfb(
                        torque,
                        ReadDouble(root, "gain", 1),
                        ReadBool(root, "enabled", false),
                        effectMode,
                        damper,
                        friction,
                        inertia);
                    await SendStatusAsync(webSocket, state, "", force: false, token);
                    break;
                }

                case "stopAll":
                    // ゲーム終了、接続解除、テスト停止などで呼ぶ安全停止命令です。
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

    private static double SmoothStep(double value, double start, double end)
    {
        var normalized = ClampUnit((value - start) / Math.Max(0.0001, end - start));
        return normalized * normalized * (3 - 2 * normalized);
    }

    public ValueTask DisposeAsync()
    {
        _listener.Stop();
        return ValueTask.CompletedTask;
    }

    private sealed record Handshake(string WebSocketKey, string Origin);

    private sealed class ClientState
    {
        public DateTimeOffset LastStatusAt { get; set; } = DateTimeOffset.MinValue;
    }
}
