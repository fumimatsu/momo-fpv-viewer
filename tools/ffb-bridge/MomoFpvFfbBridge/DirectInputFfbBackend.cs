using SharpGen.Runtime;
using Vortice.DirectInput;

namespace MomoFpvFfbBridge;

internal sealed record BridgeDevice(
    string Id,
    string Name,
    string VendorId,
    string ProductId,
    bool IsFfbCapable,
    bool IsLikelyWheel,
    int AxisCount,
    int ButtonCount);

internal sealed record BackendStatus(
    bool Ok,
    bool Clipped,
    double LastTorque,
    double LastDamper,
    double LastFriction,
    bool DeviceLost,
    string Message,
    int AxisOffset,
    string AxisName,
    string EffectMode);

internal sealed record AcquireResult(
    bool Ok,
    string DeviceId,
    bool Exclusive,
    string Message);

internal enum DirectInputForceSignMode
{
    // 一般的なDirectInput: 力の向きをdirection vectorで表し、magnitudeは正値にします。
    DirectionVector,

    // MOZA R3で安定した方式: directionは固定し、ConstantForce.Magnitude側に符号を持たせます。
    // MOZA SDKではなく、あくまでDirectInputの投げ方の違いです。
    SignedConstantMagnitude
}

internal sealed class DirectInputFfbBackend : IFfbBackend
{
    private const int AxisOffsetX = 0;
    // DirectInput FFBの強さはおおむね -10000..+10000 の整数値に変換して送ります。
    // ブラウザ側から来る torque は -1..+1 なので、ここでスケールを合わせます。
    private const int DirectInputMaxMagnitude = 10000;

    private readonly object _gate = new();
    private readonly IDirectInput8 _directInput;
    private readonly HiddenDirectInputWindow _window;
    private readonly double _maxOutput;
    private readonly DirectInputForceSignMode _signMode;

    private IDirectInputDevice8? _device;
    private IDirectInputEffect? _constantForce;
    private IDirectInputEffect? _damperEffect;
    private IDirectInputEffect? _frictionEffect;
    private string _deviceId = "";
    private bool _exclusive;
    private bool _clipped;
    private bool _deviceLost;
    private bool _damperUnavailable;
    private bool _frictionUnavailable;
    private double _lastTorque;
    private double _lastDamper;
    private double _lastFriction;
    private int _ffbAxisOffset = AxisOffsetX;
    private string _ffbAxisName = "X Axis";
    private string _effectMode = "constant";
    private DateTimeOffset _lastFfbAt = DateTimeOffset.MinValue;

    public DirectInputFfbBackend(double maxOutput, DirectInputForceSignMode signMode = DirectInputForceSignMode.DirectionVector)
    {
        _maxOutput = Math.Clamp(maxOutput, 0.02, 1.0);
        _signMode = signMode;
        _directInput = DInput.DirectInput8Create();
        _window = new HiddenDirectInputWindow();
    }

    public string BackendName => _signMode == DirectInputForceSignMode.SignedConstantMagnitude
        ? "directinput-moza-signed"
        : "directinput";

    public IReadOnlyList<BridgeDevice> ListDevices()
    {
        lock (_gate)
        {
            // Windowsに接続されているゲームコントローラをDirectInput経由で列挙します。
            // FFB対応かどうかと、名前からホイールらしさを見て、HUDのLIST結果に返します。
            return _directInput
                .GetDevices(DeviceClass.GameControl, DeviceEnumerationFlags.AttachedOnly)
                .Select(CreateBridgeDevice)
                .OrderByDescending(d => d.IsLikelyWheel)
                .ThenByDescending(d => d.IsFfbCapable)
                .ThenBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
    }

    public AcquireResult Acquire(string? requestedDeviceId, bool preferExclusive)
    {
        lock (_gate)
        {
            ReleaseLocked(stopAll: true);

            var devices = _directInput.GetDevices(DeviceClass.GameControl, DeviceEnumerationFlags.AttachedOnly);
            var selected = SelectDevice(devices, requestedDeviceId);
            if (selected is null)
            {
                return new AcquireResult(false, requestedDeviceId ?? "", false, "DirectInput FFB device not found.");
            }

            try
            {
                // 選択されたDirectInputデバイスを開き、FFBを送れる状態にします。
                // Exclusiveで取れない場合はNonExclusiveに落として、他アプリとの衝突を避けます。
                var device = _directInput.CreateDevice(selected.InstanceGuid);
                device.SetDataFormat<RawJoystickState>().CheckError();

                var level = CooperativeLevel.Background | (preferExclusive ? CooperativeLevel.Exclusive : CooperativeLevel.NonExclusive);
                var result = device.SetCooperativeLevel(_window.Handle, level);
                if (result.Failure && preferExclusive)
                {
                    level = CooperativeLevel.Background | CooperativeLevel.NonExclusive;
                    result = device.SetCooperativeLevel(_window.Handle, level);
                }
                result.CheckError();

                Try(() => device.Properties.AutoCenter = false);
                Try(() => device.Properties.ForceFeedbackGain = DirectInputMaxMagnitude);
                device.Acquire().CheckError();
                Try(() => device.SendForceFeedbackCommand(ForceFeedbackCommand.Reset));
                Try(() => device.SendForceFeedbackCommand(ForceFeedbackCommand.SetActuatorsOn));

                _device = device;
                _deviceId = selected.InstanceGuid.ToString("D");
                _exclusive = (level & CooperativeLevel.Exclusive) != 0;
                // どの軸にFFBを出すかを決めます。基本はステアリングのX軸です。
                SelectForceFeedbackAxisLocked(device);
                _effectMode = "constant";
                // 常時更新できるよう、長時間のconstant force effectを開始しておきます。
                _constantForce = CreateForceEffect(_effectMode, 0);
                _constantForce.Start(-1);
                _damperUnavailable = false;
                _frictionUnavailable = false;
                _lastTorque = 0;
                _lastDamper = 0;
                _lastFriction = 0;
                _clipped = false;
                _deviceLost = false;
                _lastFfbAt = DateTimeOffset.UtcNow;

                return new AcquireResult(true, _deviceId, _exclusive, "acquired");
            }
            catch (Exception ex)
            {
                ReleaseLocked(stopAll: true);
                return new AcquireResult(false, selected.InstanceGuid.ToString("D"), false, ex.Message);
            }
        }
    }

    public BackendStatus Release()
    {
        lock (_gate)
        {
            ReleaseLocked(stopAll: true);
            return SnapshotLocked("released");
        }
    }

    public BackendStatus StopAll(string message = "stopAll")
    {
        lock (_gate)
        {
            StopAllLocked();
            return SnapshotLocked(message);
        }
    }

    public BackendStatus SetFfb(double torque, double gain, bool enabled, string? effectMode, double damper, double friction, double inertia)
    {
        lock (_gate)
        {
            if (_device is null || _constantForce is null || !enabled)
            {
                // 未acquireや無効化時は、残留トルク事故を避けるため必ずゼロへ戻します。
                StopAllLocked();
                return SnapshotLocked("not acquired or disabled");
            }

            // torqueとgainを掛けた後、ブリッジ側の安全上限でもう一段クランプします。
            var requested = ClampFinite(torque * gain, -1.0, 1.0);
            var clamped = ClampFinite(requested, -_maxOutput, _maxOutput);
            _clipped = Math.Abs(requested - clamped) > 0.0001;

            try
            {
                SetForceLocked(clamped, effectMode);
                SetConditionEffectsLocked(damper, friction, inertia);
                _lastTorque = clamped;
                _lastFfbAt = DateTimeOffset.UtcNow;
                _deviceLost = false;
                return SnapshotLocked("");
            }
            catch (Exception ex)
            {
                _deviceLost = true;
                StopAllLocked();
                return SnapshotLocked(ex.Message);
            }
        }
    }

    public void TickSafetyTimeout(TimeSpan timeout)
    {
        lock (_gate)
        {
            if (_device is null || _constantForce is null) return;
            if (_lastFfbAt == DateTimeOffset.MinValue) return;
            if (Math.Abs(_lastTorque) < 0.0001) return;
            if (DateTimeOffset.UtcNow - _lastFfbAt <= timeout) return;

            try
            {
                // ブラウザから一定時間 `setFfb` が来なければ、通信切れとみなして力を抜きます。
                SetForceLocked(0, _effectMode);
                _lastTorque = 0;
                _clipped = false;
            }
            catch
            {
                _deviceLost = true;
                StopAllLocked();
            }
        }
    }

    public BackendStatus Snapshot(string message = "")
    {
        lock (_gate)
        {
            return SnapshotLocked(message);
        }
    }

    private BridgeDevice CreateBridgeDevice(DeviceInstance instance)
    {
        var name = string.IsNullOrWhiteSpace(instance.ProductName) ? instance.InstanceName : instance.ProductName;
        var axisCount = 0;
        var buttonCount = 0;
        var vendorId = "";
        var productId = "";
        var isFfb = instance.ForceFeedbackDriverGuid != Guid.Empty;

        try
        {
            using var device = _directInput.CreateDevice(instance.InstanceGuid);
            var caps = device.Capabilities;
            axisCount = caps.AxeCount;
            buttonCount = caps.ButtonCount;
            isFfb = isFfb || (caps.Flags & DeviceFlags.ForceFeedback) != 0;
            vendorId = ToHex4(device.Properties.VendorId);
            productId = ToHex4(device.Properties.ProductId);
        }
        catch
        {
            // Some drivers expose devices that cannot be opened until acquired.
        }

        var likelyWheel = LooksLikeWheel(name, instance.Type);
        return new BridgeDevice(
            instance.InstanceGuid.ToString("D"),
            name,
            vendorId,
            productId,
            isFfb,
            likelyWheel,
            axisCount,
            buttonCount);
    }

    private DeviceInstance? SelectDevice(IEnumerable<DeviceInstance> devices, string? requestedDeviceId)
    {
        var all = devices.ToArray();
        if (!string.IsNullOrWhiteSpace(requestedDeviceId))
        {
            var requested = all.FirstOrDefault(d => d.InstanceGuid.ToString("D").Equals(requestedDeviceId, StringComparison.OrdinalIgnoreCase));
            if (requested is not null) return requested;
        }

        return all
            .OrderByDescending(d => LooksLikeWheel(string.IsNullOrWhiteSpace(d.ProductName) ? d.InstanceName : d.ProductName, d.Type))
            .ThenByDescending(d => d.ForceFeedbackDriverGuid != Guid.Empty)
            .FirstOrDefault();
    }

    private IDirectInputEffect CreateForceEffect(string mode, int magnitude)
    {
        if (_device is null) throw new InvalidOperationException("Device is not acquired.");
        var effectGuid = NormalizeEffectMode(mode) switch
        {
            "ramp" => EffectGuid.RampForce,
            "periodicOffset" => EffectGuid.Sine,
            "sine" => EffectGuid.Sine,
            _ => EffectGuid.ConstantForce
        };
        return _device.CreateEffect(effectGuid, BuildForceParameters(magnitude, mode));
    }

    private void SetForceLocked(double torque, string? requestedMode)
    {
        if (_device is null) return;
        var mode = NormalizeEffectMode(requestedMode);
        var magnitude = (int)Math.Round(Math.Clamp(torque, -1.0, 1.0) * DirectInputMaxMagnitude);
        if (_constantForce is null || !string.Equals(_effectMode, mode, StringComparison.Ordinal))
        {
            // effect種別を切り替える時は作り直します。通常走行ではほぼconstantのままです。
            Try(() => _constantForce?.Stop());
            Try(() => _constantForce?.Dispose());
            _effectMode = mode;
            _constantForce = CreateForceEffect(_effectMode, magnitude);
            _constantForce.Start(-1);
        }
        var parameters = BuildForceParameters(magnitude, _effectMode);
        _constantForce.SetParameters(
            parameters,
            EffectParameterFlags.TypeSpecificParameters | EffectParameterFlags.Direction | EffectParameterFlags.Start);
    }

    private EffectParameters BuildForceParameters(int signedMagnitude, string? requestedMode)
    {
        var mode = NormalizeEffectMode(requestedMode);
        var direction = signedMagnitude < 0 ? -DirectInputMaxMagnitude : DirectInputMaxMagnitude;
        var magnitude = Math.Abs(Math.Clamp(signedMagnitude, -DirectInputMaxMagnitude, DirectInputMaxMagnitude));
        var signed = Math.Clamp(signedMagnitude, -DirectInputMaxMagnitude, DirectInputMaxMagnitude);
        var constantMagnitude = _signMode == DirectInputForceSignMode.SignedConstantMagnitude ? signed : magnitude;
        var constantDirection = _signMode == DirectInputForceSignMode.SignedConstantMagnitude ? DirectInputMaxMagnitude : direction;
        // 通常DirectInputはdirectionで左右を表す一方、MOZA R3向けモードではmagnitudeに符号を入れます。
        var parameters = new EffectParameters
        {
            Flags = EffectFlags.ObjectOffsets | EffectFlags.Cartesian,
            Duration = -1,
            SamplePeriod = 0,
            Gain = DirectInputMaxMagnitude,
            TriggerButton = -1,
            TriggerRepeatInterval = 0,
            StartDelay = 0,
            Parameters = mode switch
            {
                "ramp" => new RampForce { Start = signed, End = signed },
                "periodicOffset" => new PeriodicForce { Magnitude = 0, Offset = signed, Phase = 0, Period = 200000 },
                "sine" => new PeriodicForce { Magnitude = magnitude, Offset = 0, Phase = 0, Period = 200000 },
                _ => new ConstantForce { Magnitude = constantMagnitude }
            }
        };
        parameters.SetAxes(new[] { _ffbAxisOffset }, new[] { mode == "constant" ? constantDirection : direction });
        return parameters;
    }

    private void SetConditionEffectsLocked(double damper, double friction, double inertia)
    {
        // Damper/Frictionは、ゲーム側のSATとは別にホイール側の粘りや摩擦感を足す補助effectです。
        // 非対応デバイスもあるため、失敗した場合は以後そのeffectを無効扱いにします。
        var damperAmount = ClampFinite(damper + inertia * 0.35, 0, 1);
        var frictionAmount = ClampFinite(friction, 0, 1);
        SetConditionEffectLocked(
            ref _damperEffect,
            EffectGuid.Damper,
            damperAmount,
            ref _damperUnavailable,
            value => _lastDamper = value);
        SetConditionEffectLocked(
            ref _frictionEffect,
            EffectGuid.Friction,
            frictionAmount,
            ref _frictionUnavailable,
            value => _lastFriction = value);
    }

    private void SetConditionEffectLocked(
        ref IDirectInputEffect? effect,
        Guid effectGuid,
        double amount,
        ref bool unavailable,
        Action<double> setLastValue)
    {
        if (_device is null || unavailable)
        {
            setLastValue(0);
            return;
        }

        var level = ClampFinite(amount, 0, 1);
        if (level <= 0.0005)
        {
            try { effect?.Stop(); } catch { }
            setLastValue(0);
            return;
        }

        var parameters = BuildConditionParameters(level);
        try
        {
            if (effect is null)
            {
                effect = _device.CreateEffect(effectGuid, parameters);
                effect.Start(-1);
            }
            else
            {
                effect.SetParameters(
                    parameters,
                    EffectParameterFlags.TypeSpecificParameters | EffectParameterFlags.Direction | EffectParameterFlags.Start);
            }
            setLastValue(level);
        }
        catch
        {
            unavailable = true;
            try { effect?.Stop(); } catch { }
            try { effect?.Dispose(); } catch { }
            effect = null;
            setLastValue(0);
        }
    }

    private EffectParameters BuildConditionParameters(double amount)
    {
        var coefficient = (int)Math.Round(ClampFinite(amount, 0, 1) * DirectInputMaxMagnitude);
        var parameters = new EffectParameters
        {
            Flags = EffectFlags.ObjectOffsets | EffectFlags.Cartesian,
            Duration = -1,
            SamplePeriod = 0,
            Gain = DirectInputMaxMagnitude,
            TriggerButton = -1,
            TriggerRepeatInterval = 0,
            StartDelay = 0,
            Parameters = new ConditionSet
            {
                Conditions = new[]
                {
                    new Condition
                    {
                        Offset = 0,
                        PositiveCoefficient = coefficient,
                        NegativeCoefficient = coefficient,
                        PositiveSaturation = DirectInputMaxMagnitude,
                        NegativeSaturation = DirectInputMaxMagnitude,
                        DeadBand = 0
                    }
                }
            }
        };
        parameters.SetAxes(new[] { _ffbAxisOffset }, new[] { 1 });
        return parameters;
    }

    private static string NormalizeEffectMode(string? mode)
    {
        return (mode ?? "").Trim() switch
        {
            "ramp" => "ramp",
            "periodicOffset" => "periodicOffset",
            "sine" => "sine",
            _ => "constant"
        };
    }

    private void SelectForceFeedbackAxisLocked(IDirectInputDevice8 device)
    {
        _ffbAxisOffset = AxisOffsetX;
        _ffbAxisName = "X Axis";

        var axes = SafeGetObjects(device, DeviceObjectTypeFlags.Axis);
        var selected =
            FirstAxis(axes, IsLikelySteeringFfbAxis)
            ?? FirstAxis(axes, IsForceFeedbackAxis)
            ?? FirstAxis(axes, IsLikelySteeringAxis)
            ?? FirstAxis(axes, _ => true);
        if (selected is null) return;

        _ffbAxisOffset = selected.Offset;
        _ffbAxisName = AxisDisplayName(selected);
    }

    private static DeviceObjectInstance? FirstAxis(IEnumerable<DeviceObjectInstance> axes, Func<DeviceObjectInstance, bool> predicate)
    {
        foreach (var axis in axes)
        {
            if (predicate(axis)) return axis;
        }
        return null;
    }

    private static DeviceObjectInstance[] SafeGetObjects(IDirectInputDevice8 device, DeviceObjectTypeFlags flags)
    {
        try
        {
            return device.GetObjects(flags).ToArray();
        }
        catch
        {
            return Array.Empty<DeviceObjectInstance>();
        }
    }

    private static bool IsForceFeedbackAxis(DeviceObjectInstance obj)
    {
        return HasObjectType(obj, DeviceObjectTypeFlags.ForceFeedbackActuator)
            || obj.MaximumForceFeedback > 0
            || obj.ForceFeedbackResolution > 0
            || obj.Aspect == ObjectAspect.ForceFeedbackActuator;
    }

    private static bool IsLikelySteeringFfbAxis(DeviceObjectInstance obj)
    {
        return IsForceFeedbackAxis(obj) && IsLikelySteeringAxis(obj);
    }

    private static bool IsLikelySteeringAxis(DeviceObjectInstance obj)
    {
        var name = (obj.Name ?? "").ToLowerInvariant();
        return obj.Offset == AxisOffsetX
            || name.Contains("steer")
            || name.Contains("wheel")
            || name.Contains("x axis")
            || name == "x";
    }

    private static bool HasObjectType(DeviceObjectInstance obj, DeviceObjectTypeFlags flag)
    {
        return (((int)obj.ObjectId) & (int)flag) != 0;
    }

    private static string AxisDisplayName(DeviceObjectInstance obj)
    {
        var name = string.IsNullOrWhiteSpace(obj.Name) ? "Axis" : obj.Name.Trim();
        var ffb = IsForceFeedbackAxis(obj) ? " FFB" : "";
        return $"{name}{ffb} offset {obj.Offset}";
    }

    private void StopAllLocked()
    {
        // FFBでは安全停止が最重要です。値をゼロにし、effect自体にもStopAllを投げます。
        _lastTorque = 0;
        _lastDamper = 0;
        _lastFriction = 0;
        _clipped = false;
        Try(() => SetForceLocked(0, _effectMode));
        Try(() => SetConditionEffectsLocked(0, 0, 0));
        Try(() => _constantForce?.Stop());
        Try(() => _damperEffect?.Stop());
        Try(() => _frictionEffect?.Stop());
        Try(() => _device?.SendForceFeedbackCommand(ForceFeedbackCommand.StopAll));
    }

    private void ReleaseLocked(bool stopAll)
    {
        if (stopAll) StopAllLocked();
        Try(() => _constantForce?.Dispose());
        Try(() => _damperEffect?.Dispose());
        Try(() => _frictionEffect?.Dispose());
        _constantForce = null;
        _damperEffect = null;
        _frictionEffect = null;
        Try(() => _device?.Unacquire());
        Try(() => _device?.Dispose());
        _device = null;
        _deviceId = "";
        _exclusive = false;
        _lastTorque = 0;
        _lastDamper = 0;
        _lastFriction = 0;
    }

    private BackendStatus SnapshotLocked(string message)
    {
        return new BackendStatus(
            Ok: !_deviceLost,
            Clipped: _clipped,
            LastTorque: _lastTorque,
            LastDamper: _lastDamper,
            LastFriction: _lastFriction,
            DeviceLost: _deviceLost,
            Message: message,
            AxisOffset: _ffbAxisOffset,
            AxisName: _ffbAxisName,
            EffectMode: _effectMode);
    }

    private static bool LooksLikeWheel(string? name, DeviceType type)
    {
        var text = (name ?? "").ToLowerInvariant();
        return type == DeviceType.Driving
            || text.Contains("g25")
            || text.Contains("g27")
            || text.Contains("g29")
            || text.Contains("g920")
            || text.Contains("racing")
            || text.Contains("wheel");
    }

    private static string ToHex4(int value)
    {
        return value <= 0 ? "" : (value & 0xffff).ToString("x4");
    }

    private static double ClampFinite(double value, double min, double max)
    {
        if (!double.IsFinite(value)) return 0;
        return Math.Clamp(value, min, max);
    }

    private static void Try(Action action)
    {
        try { action(); } catch { }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            ReleaseLocked(stopAll: true);
            _directInput.Dispose();
            _window.Dispose();
        }
    }
}
