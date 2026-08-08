using System.Runtime.InteropServices;
using System.Text.Json;

namespace MomoFpvFfbBridge;

internal static class FfbCompatibilityDiagnostics
{
    private static readonly JsonSerializerOptions CompactJson = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions ReportJson = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    public static void LogDeviceScan(IReadOnlyList<BridgeDevice> devices, string source)
    {
        BridgeLog.Info($"DirectInput device scan. source={source}, count={devices.Count}");
        foreach (var device in devices)
        {
            BridgeLog.Info($"DirectInput device: {JsonSerializer.Serialize(DevicePayload(device), CompactJson)}");
        }
    }

    public static void LogAcquire(AcquireResult result, BackendStatus status, string source)
    {
        var payload = new
        {
            source,
            result.Ok,
            result.DeviceId,
            result.Exclusive,
            result.Message,
            profile = result.Profile,
            capabilities = result.Capabilities,
            status.DeviceName,
            status.AxisOffset,
            status.AxisName,
            status.EffectMode,
        };
        BridgeLog.Info($"DirectInput acquire: {JsonSerializer.Serialize(payload, CompactJson)}");
    }

    public static string CreateReport(BridgeConfig config, IFfbBackend backend, FfbBridgeServer server)
    {
        var devices = backend.ListDevices();
        var status = backend.Snapshot("compatibility report");
        var payload = new
        {
            schemaVersion = 1,
            createdAt = DateTimeOffset.UtcNow,
            bridge = new
            {
                name = "Momo FPV FFB Bridge",
                version = FfbBridgeServer.BridgeVersion,
                requestedBackend = config.Backend,
                effectiveBackend = backend.BackendName,
                config.MaxOutput,
            },
            environment = new
            {
                os = RuntimeInformation.OSDescription,
                framework = RuntimeInformation.FrameworkDescription,
                processArchitecture = RuntimeInformation.ProcessArchitecture.ToString(),
                osArchitecture = RuntimeInformation.OSArchitecture.ToString(),
            },
            compatibility = server.GetCompatibilityGateStatus(),
            browserInput = server.GetLastBrowserCompatibilityInfo(),
            currentDevice = new
            {
                status.DeviceId,
                status.DeviceName,
                status.Acquired,
                status.Exclusive,
                status.DeviceLost,
                status.AxisOffset,
                status.AxisName,
                status.EffectMode,
                profile = status.Profile,
                capabilities = status.Capabilities,
                status.Message,
            },
            devices = devices.Select(DevicePayload).ToArray(),
            privacy = "No Relay token, race data, URL query, user name, or operation history is included.",
        };
        return JsonSerializer.Serialize(payload, ReportJson);
    }

    public static string SaveReport(BridgeConfig config, IFfbBackend backend, FfbBridgeServer server, out string json)
    {
        json = CreateReport(config, backend, server);
        var fileName = $"ffb-compatibility-{DateTime.Now:yyyyMMdd-HHmmss}.json";
        return BridgeLog.WriteArtifact(fileName, json);
    }

    private static object DevicePayload(BridgeDevice device)
    {
        return new
        {
            device.Id,
            device.Name,
            device.VendorId,
            device.ProductId,
            device.IsFfbCapable,
            device.IsLikelyWheel,
            device.AxisCount,
            device.ButtonCount,
            capabilities = device.Capabilities,
            profile = device.Profile,
        };
    }
}
