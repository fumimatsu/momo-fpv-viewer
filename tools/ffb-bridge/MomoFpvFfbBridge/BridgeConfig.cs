namespace MomoFpvFfbBridge;

internal sealed record BridgeConfig(
    string Host,
    int Port,
    double MaxOutput,
    string Backend,
    IReadOnlySet<string> AllowedOrigins)
{
    public static BridgeConfig FromArgs(string[] args)
    {
        var host = "127.0.0.1";
        var port = 24725;
        // 初回実機試験は必ず低出力から始める。Viewer 側の値だけに依存しない。
        var maxOutput = 0.40;
        var backend = "directinput";
        var allowedOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            string? Next() => i + 1 < args.Length ? args[++i] : null;

            if (arg is "--host" or "-h")
            {
                host = Next() ?? host;
            }
            else if (arg is "--port" or "-p")
            {
                if (int.TryParse(Next(), out var parsed)) port = parsed;
            }
            else if (arg is "--max-output")
            {
                if (double.TryParse(Next(), out var parsed)) maxOutput = parsed;
            }
            else if (arg is "--backend")
            {
                backend = NormalizeBackend(Next());
            }
            else if (arg is "--allow-origin")
            {
                var origin = Next()?.Trim().TrimEnd('/');
                if (!string.IsNullOrWhiteSpace(origin)) allowedOrigins.Add(origin);
            }
        }

        LoadAllowedOriginsFromFile(allowedOrigins);

        maxOutput = Math.Clamp(maxOutput, 0.02, 1.0);
        return new BridgeConfig(host, port, maxOutput, backend, allowedOrigins);
    }

    public bool IsAllowedOrigin(string? origin)
    {
        // file:// 起動時は Origin が null になる。Bridge 自体は loopback bind なので許可する。
        if (string.IsNullOrWhiteSpace(origin) || origin == "null") return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        if (uri.Host is "127.0.0.1" or "localhost" or "::1") return true;
        return AllowedOrigins.Contains(origin.TrimEnd('/'));
    }

    private static string NormalizeBackend(string? value)
    {
        // この参考版ではMOZA SDK backendを意図的に除外しています。
        // R3で使う場合もDirectInput経由なので `moza-directinput` だけを残します。
        return (value ?? "").Trim().ToLowerInvariant() switch
        {
            "di" => "directinput",
            "directinput" => "directinput",
            "moza-di" => "moza-directinput",
            "moza-directinput" => "moza-directinput",
            _ => "directinput"
        };
    }

    private static void LoadAllowedOriginsFromFile(HashSet<string> allowedOrigins)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "allowed-origins.txt");
        if (!File.Exists(path)) return;

        foreach (var line in File.ReadLines(path))
        {
            var origin = line.Trim();
            if (origin.Length == 0 || origin.StartsWith('#')) continue;
            allowedOrigins.Add(origin.TrimEnd('/'));
        }
    }
}
