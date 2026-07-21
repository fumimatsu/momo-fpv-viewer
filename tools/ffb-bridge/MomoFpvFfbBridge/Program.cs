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
    // MOZA R3では通常のDirectInput方向指定ではなく、符号付きmagnitudeで出した方が
    // 左右の極性が安定したため、専用モードとして分けています。SDKは使っていません。
    return config.Backend switch
    {
        "moza-directinput" => new DirectInputFfbBackend(config.MaxOutput, DirectInputForceSignMode.SignedConstantMagnitude),
        _ => new DirectInputFfbBackend(config.MaxOutput)
    };
}
