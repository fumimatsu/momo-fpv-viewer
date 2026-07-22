using System.Text.Json;

namespace MomoFpvFfbBridge;

internal sealed record BridgeAppSettings(string RelayEndpoint, string RelayDevice)
{
    public const string DefaultRelayEndpoint = "127.0.0.1:8090";
    public const string DefaultRelayDevice = "11.3";

    public static BridgeAppSettings Load()
    {
        try
        {
            var path = GetPath();
            if (!File.Exists(path)) return new BridgeAppSettings(DefaultRelayEndpoint, DefaultRelayDevice);
            var loaded = JsonSerializer.Deserialize<BridgeAppSettings>(File.ReadAllText(path));
            var endpoint = string.IsNullOrWhiteSpace(loaded?.RelayEndpoint) ? DefaultRelayEndpoint : loaded.RelayEndpoint;
            // GUI初版はPi直結向けの既定値を誤って保存していた。Relay GUIではlocalhostのRelayを既定にする。
            if (string.Equals(endpoint, "192.168.11.3:8080", StringComparison.OrdinalIgnoreCase)) endpoint = DefaultRelayEndpoint;
            return new BridgeAppSettings(
                endpoint,
                string.IsNullOrWhiteSpace(loaded?.RelayDevice) ? DefaultRelayDevice : loaded.RelayDevice);
        }
        catch
        {
            return new BridgeAppSettings(DefaultRelayEndpoint, DefaultRelayDevice);
        }
    }

    public void Save()
    {
        var path = GetPath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static string GetPath()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MomoFpvFfbBridge",
            "settings.json");
    }
}
