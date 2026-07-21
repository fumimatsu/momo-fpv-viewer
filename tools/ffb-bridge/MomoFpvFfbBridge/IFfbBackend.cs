namespace MomoFpvFfbBridge;

internal interface IFfbBackend : IDisposable
{
    string BackendName { get; }

    IReadOnlyList<BridgeDevice> ListDevices();
    AcquireResult Acquire(string? requestedDeviceId, bool preferExclusive);
    BackendStatus Release();
    BackendStatus StopAll(string message = "stopAll");
    BackendStatus SetFfb(double torque, double gain, bool enabled, string? effectMode, double damper, double friction, double inertia);
    void TickSafetyTimeout(TimeSpan timeout);
    BackendStatus Snapshot(string message = "");
}
