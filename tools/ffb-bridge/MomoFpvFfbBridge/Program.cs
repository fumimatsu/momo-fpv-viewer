using System.Windows.Forms;

namespace MomoFpvFfbBridge;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var config = BridgeConfig.FromArgs(args);
        using var backend = CreateBackend(config);
        var server = new FfbBridgeServer(config, backend);
        using var form = new BridgeMainForm(config, backend, server);

        AppDomain.CurrentDomain.ProcessExit += (_, _) => backend.StopAll("process-exit");
        Application.Run(form);
    }

    private static IFfbBackend CreateBackend(BridgeConfig config)
    {
        // auto は接続デバイスの互換プロファイルで選ぶ。明示指定は試験・切り分け用に残す。
        return new DirectInputFfbBackend(config.MaxOutput, config.Backend);
    }
}
