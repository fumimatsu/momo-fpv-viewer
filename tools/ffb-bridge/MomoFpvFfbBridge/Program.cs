using MomoFpvFfbBridge;

var config = BridgeConfig.FromArgs(args);
using var backend = CreateBackend(config);
await using var server = new FfbBridgeServer(config, backend);

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
    backend.StopAll("ctrl-c");
};

AppDomain.CurrentDomain.ProcessExit += (_, _) => backend.StopAll("process-exit");

try
{
    await server.RunAsync(cts.Token);
}
finally
{
    backend.StopAll("shutdown");
}

static IFfbBackend CreateBackend(BridgeConfig config)
{
    // auto は接続デバイスの互換プロファイルで選ぶ。明示指定は試験・切り分け用に残す。
    return new DirectInputFfbBackend(config.MaxOutput, config.Backend);
}
