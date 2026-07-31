using System.Text;

namespace MomoFpvFfbBridge;

internal static class BridgeLog
{
    private static readonly object Gate = new();
    private static readonly string DirectoryPath = ResolveDirectoryPath();

    public static string CurrentPath => Path.Combine(DirectoryPath, $"ffb-bridge-{DateTime.Now:yyyyMMdd}.log");

    public static void Info(string message) => Write("INFO", message);

    public static void Warn(string message) => Write("WARN", message);

    public static void Error(string message, Exception? exception = null)
    {
        var detail = exception is null ? message : $"{message}{Environment.NewLine}{exception}";
        Write("ERROR", detail);
    }

    private static void Write(string level, string message)
    {
        try
        {
            var entry = $"{DateTimeOffset.Now:O} [{level}] {message}{Environment.NewLine}";
            lock (Gate)
            {
                Directory.CreateDirectory(DirectoryPath);
                File.AppendAllText(CurrentPath, entry, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            }
        }
        catch
        {
            // ログ出力失敗で FFB の安全停止や GUI 起動を妨げない。
        }
    }

    private static string ResolveDirectoryPath()
    {
        var portable = Path.Combine(AppContext.BaseDirectory, "logs");
        try
        {
            Directory.CreateDirectory(portable);
            return portable;
        }
        catch
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MomoFpvFfbBridge",
                "logs");
        }
    }
}
