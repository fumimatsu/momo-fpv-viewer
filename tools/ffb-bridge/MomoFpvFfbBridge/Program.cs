using System.Windows.Forms;

namespace MomoFpvFfbBridge;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.ThreadException += (_, eventArgs) => BridgeLog.Error("Unhandled UI exception.", eventArgs.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
            BridgeLog.Error("Unhandled process exception.", eventArgs.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
        {
            BridgeLog.Error("Unobserved task exception.", eventArgs.Exception);
            eventArgs.SetObserved();
        };

        ApplicationConfiguration.Initialize();

        var config = BridgeConfig.FromArgs(args);
        BridgeLog.Info($"Starting bridge. backend={config.Backend}, endpoint=ws://{config.Host}:{config.Port}, log={BridgeLog.CurrentPath}");
        using var backend = CreateBackend(config);
        var server = new FfbBridgeServer(config, backend);
        using var form = new BridgeMainForm(config, backend, server);

        AppDomain.CurrentDomain.ProcessExit += (_, _) =>
        {
            BridgeLog.Info("Process exit.");
            backend.StopAll("process-exit");
        };
        Application.Run(form);
    }

    private static IFfbBackend CreateBackend(BridgeConfig config)
    {
        // auto は接続デバイスの互換プロファイルで選ぶ。明示指定は試験・切り分け用に残す。
        return new DirectInputFfbBackend(config.MaxOutput, config.Backend);
    }
}
