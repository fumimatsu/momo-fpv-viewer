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
    int ButtonCount,
    FfbEffectCapabilities Capabilities,
    DeviceCompatibilityProfile Profile);

internal sealed record FfbEffectCapabilities(
    bool ConstantForce,
    bool Friction,
    bool Damper,
    bool EffectsEnumerated)
{
    public static readonly FfbEffectCapabilities None = new(false, false, false, false);
}

internal sealed record DeviceCompatibilityProfile(
    string Id,
    string Label,
    DirectInputForceSignMode SignMode,
    int TorquePolarity,
    bool IsKnown);

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
    string EffectMode,
    DeviceCompatibilityProfile Profile,
    FfbEffectCapabilities Capabilities,
    string DeviceId,
    string DeviceName,
    bool Acquired,
    bool Exclusive);

internal sealed record AcquireResult(
    bool Ok,
    string DeviceId,
    bool Exclusive,
    string Message,
    DeviceCompatibilityProfile Profile,
    FfbEffectCapabilities Capabilities);

internal enum DirectInputForceSignMode
{
    // 一般的なDirectInput: 力の向きをdirection vectorで表し、magnitudeは正値にします。
    DirectionVector,

    // MOZA R3で安定した方式: directionは固定し、ConstantForce.Magnitude側に符号を持たせます。
    // MOZA SDKではなく、あくまでDirectInputの投げ方の違いです。
    SignedConstantMagnitude,

    // T300は単軸のCartesian directionを0にし、ConstantForce.Magnitude側の符号で左右を表します。
    SignedSingleAxisMagnitude
}

internal static class FfbDeviceCompatibility
{
    public static readonly DeviceCompatibilityProfile Generic = new(
        "generic-directinput",
        "Generic DirectInput",
        DirectInputForceSignMode.DirectionVector,
        1,
        false);

    private static readonly (string Id, string Label, string VendorId, string[] NameTokens, DirectInputForceSignMode SignMode, int TorquePolarity)[] KnownProfiles =
    {
        // MOZA Pit House reports the R3 as "R3 Racing Wheel and Pedals" on this PC.
        // Keep the VID guard so other MOZA products are not given the R3 force-sign profile.
        // The R3's observed DirectInput torque direction is opposite to the Viewer convention.
        ("moza-r3", "MOZA R3", "346E", new[] { "moza r3", "r3 racing wheel and pedals" }, DirectInputForceSignMode.SignedConstantMagnitude, -1),
        // T300の実機確認では、DirectInputの正負がViewerの操舵方向と逆だったため、ここでだけ反転する。
        ("thrustmaster-t300", "Thrustmaster T300", "044F", new[] { "t300", "t-300" }, DirectInputForceSignMode.SignedSingleAxisMagnitude, -1),
        ("logitech-g29", "Logitech G29", "046D", new[] { "g29" }, DirectInputForceSignMode.DirectionVector, 1),
        ("logitech-g923", "Logitech G923", "046D", new[] { "g923" }, DirectInputForceSignMode.DirectionVector, 1),
    };

    public static DeviceCompatibilityProfile Resolve(string? name, string? vendorId, string? productId)
    {
        var normalizedName = (name ?? "").Trim().ToLowerInvariant();
        var normalizedVendorId = (vendorId ?? "").Trim().ToUpperInvariant();

        // PIDは診断結果として収集する。実機で確認できるまでは、同一メーカーの別製品を
        // 誤って固定プロファイルへ分類しないよう、VIDと製品名の組み合わせを使う。

        foreach (var candidate in KnownProfiles)
        {
            var vendorMatches = candidate.VendorId.Equals(normalizedVendorId, StringComparison.OrdinalIgnoreCase);
            var nameMatches = candidate.NameTokens.Any(token => normalizedName.Contains(token, StringComparison.Ordinal));
            if (!vendorMatches || !nameMatches) continue;

            return new DeviceCompatibilityProfile(candidate.Id, candidate.Label, candidate.SignMode, candidate.TorquePolarity, true);
        }

        return Generic;
    }
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
    private readonly string _backendMode;
    private DirectInputForceSignMode _signMode;

    private IDirectInputDevice8? _device;
    private IDirectInputEffect? _constantForce;
    private IDirectInputEffect? _damperEffect;
    private IDirectInputEffect? _frictionEffect;
    private string _deviceId = "";
    private string _deviceName = "";
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
    private DeviceCompatibilityProfile _profile = FfbDeviceCompatibility.Generic;
    private FfbEffectCapabilities _capabilities = FfbEffectCapabilities.None;
    private DateTimeOffset _lastFfbAt = DateTimeOffset.MinValue;

    public DirectInputFfbBackend(double maxOutput, string backendMode = "auto")
    {
        _maxOutput = Math.Clamp(maxOutput, 0.02, 1.0);
        _backendMode = NormalizeBackendMode(backendMode);
        _signMode = _backendMode == "moza-directinput"
            ? DirectInputForceSignMode.SignedConstantMagnitude
            : DirectInputForceSignMode.DirectionVector;
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
                return new AcquireResult(false, requestedDeviceId ?? "", false, "DirectInput FFB device not found.", _profile, _capabilities);
            }

            var stage = "create device";
            try
            {
                // 選択されたDirectInputデバイスを開き、FFBを送れる状態にします。
                // Exclusiveで取れない場合はNonExclusiveに落として、他アプリとの衝突を避けます。
                var device = _directInput.CreateDevice(selected.InstanceGuid);
                stage = "set data format";
                device.SetDataFormat<RawJoystickState>().CheckError();

                stage = "set cooperative level";
                var level = CooperativeLevel.Background | (preferExclusive ? CooperativeLevel.Exclusive : CooperativeLevel.NonExclusive);
                var result = device.SetCooperativeLevel(_window.Handle, level);
                if (result.Failure && preferExclusive)
                {
                    level = CooperativeLevel.Background | CooperativeLevel.NonExclusive;
                    result = device.SetCooperativeLevel(_window.Handle, level);
                }
                result.CheckError();

                stage = "acquire device";
                Try(() => device.Properties.AutoCenter = false);
                Try(() => device.Properties.ForceFeedbackGain = DirectInputMaxMagnitude);
                device.Acquire().CheckError();
                Try(() => device.SendForceFeedbackCommand(ForceFeedbackCommand.Reset));
                Try(() => device.SendForceFeedbackCommand(ForceFeedbackCommand.SetActuatorsOn));

                _device = device;
                _deviceId = selected.InstanceGuid.ToString("D");
                _exclusive = (level & CooperativeLevel.Exclusive) != 0;
                var name = string.IsNullOrWhiteSpace(selected.ProductName) ? selected.InstanceName : selected.ProductName;
                _deviceName = name;
                var vendorId = ToHex4(device.Properties.VendorId);
                var productId = ToHex4(device.Properties.ProductId);
                _profile = FfbDeviceCompatibility.Resolve(name, vendorId, productId);
                _signMode = ResolveSignMode(_profile);
                stage = "enumerate effects";
                _capabilities = ReadEffectCapabilities(device);
                // どの軸にFFBを出すかを決めます。基本はステアリングのX軸です。
                stage = "select FFB axis";
                SelectForceFeedbackAxisLocked(device);
                _effectMode = "constant";
                // 常時更新できるよう、長時間のconstant force effectを開始しておきます。
                stage = "create constant force effect";
                _constantForce = CreateForceEffect(_effectMode, 0);
                stage = "start constant force effect";
                _constantForce.Start(-1);
                stage = "zero constant force effect";
                SetForceLocked(0, _effectMode);
                _capabilities = _capabilities with { ConstantForce = true };
                _damperUnavailable = false;
                _frictionUnavailable = false;
                _lastTorque = 0;
                _lastDamper = 0;
                _lastFriction = 0;
                _clipped = false;
                _deviceLost = false;
                _lastFfbAt = DateTimeOffset.UtcNow;

                return new AcquireResult(true, _deviceId, _exclusive, "acquired", _profile, _capabilities);
            }
            catch (Exception ex)
            {
                var profile = _profile;
                var capabilities = _capabilities;
                ReleaseLocked(stopAll: true);
                return new AcquireResult(false, selected.InstanceGuid.ToString("D"), false, $"{stage}: {ex.Message}", profile, capabilities);
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
            if (Math.Abs(_lastTorque) < 0.0001 && _lastDamper <= 0.0001 && _lastFriction <= 0.0001) return;
            if (DateTimeOffset.UtcNow - _lastFfbAt <= timeout) return;

            try
            {
                // torque だけでなく condition effect も残さず停止する。
                StopAllLocked();
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
        var capabilities = FfbEffectCapabilities.None;

        try
        {
            using var device = _directInput.CreateDevice(instance.InstanceGuid);
            var caps = device.Capabilities;
            axisCount = caps.AxeCount;
            buttonCount = caps.ButtonCount;
            isFfb = isFfb || (caps.Flags & DeviceFlags.ForceFeedback) != 0;
            vendorId = ToHex4(device.Properties.VendorId);
            productId = ToHex4(device.Properties.ProductId);
            capabilities = ReadEffectCapabilities(device);
            isFfb = isFfb || capabilities.ConstantForce || capabilities.Friction || capabilities.Damper;
        }
        catch
        {
            // Some drivers expose devices that cannot be opened until acquired.
        }

        var likelyWheel = LooksLikeWheel(name, instance.Type);
        var profile = FfbDeviceCompatibility.Resolve(name, vendorId, productId);
        return new BridgeDevice(
            instance.InstanceGuid.ToString("D"),
            name,
            vendorId,
            productId,
            isFfb,
            likelyWheel,
            axisCount,
            buttonCount,
            capabilities,
            profile);
    }

    private static FfbEffectCapabilities ReadEffectCapabilities(IDirectInputDevice8 device)
    {
        try
        {
            var effectGuids = device.GetEffects().Select(effect => effect.Guid).ToHashSet();
            return new FfbEffectCapabilities(
                effectGuids.Contains(EffectGuid.ConstantForce),
                effectGuids.Contains(EffectGuid.Friction),
                effectGuids.Contains(EffectGuid.Damper),
                true);
        }
        catch
        {
            // 一部のドライバはAcquire前のeffect列挙を拒否する。Acquire時のCreateEffectで最終判定する。
            return FfbEffectCapabilities.None;
        }
    }

    private DirectInputForceSignMode ResolveSignMode(DeviceCompatibilityProfile profile)
    {
        return _backendMode switch
        {
            "moza-directinput" => DirectInputForceSignMode.SignedConstantMagnitude,
            // directinput は汎用方式を指すが、既知の実機プロファイルまで上書きしない。
            // これによりT300は単軸のsigned magnitude、R3はMOZA用の符号方式を選べる。
            "directinput" when profile.IsKnown => profile.SignMode,
            "directinput" => DirectInputForceSignMode.DirectionVector,
            _ => profile.SignMode,
        };
    }

    private static string NormalizeBackendMode(string? backendMode)
    {
        return (backendMode ?? "").Trim().ToLowerInvariant() switch
        {
            "directinput" => "directinput",
            "moza-directinput" => "moza-directinput",
            _ => "auto",
        };
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
        // 対応プロファイルで実機の正負が逆の場合だけ、Viewerから受けたトルクをここで反転する。
        var profileTorque = torque * _profile.TorquePolarity;
        var magnitude = (int)Math.Round(Math.Clamp(profileTorque, -1.0, 1.0) * DirectInputMaxMagnitude);
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
        var usesSignedMagnitude = _signMode is DirectInputForceSignMode.SignedConstantMagnitude or DirectInputForceSignMode.SignedSingleAxisMagnitude;
        var singleAxisDirection = _signMode == DirectInputForceSignMode.SignedSingleAxisMagnitude;
        var constantMagnitude = usesSignedMagnitude ? signed : magnitude;
        var constantDirection = singleAxisDirection
            ? 0
            : _signMode == DirectInputForceSignMode.SignedConstantMagnitude ? DirectInputMaxMagnitude : direction;
        var effectDirection = singleAxisDirection ? 0 : direction;
        // R3は固定directionと符号付きmagnitude、T300は単軸direction=0と符号付きmagnitudeを使います。
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
        parameters.SetAxes(new[] { _ffbAxisOffset }, new[] { mode == "constant" ? constantDirection : effectDirection });
        return parameters;
    }

    private void SetConditionEffectsLocked(double damper, double friction, double inertia)
    {
        // Damper/Frictionは、ゲーム側のSATとは別にホイール側の粘りや摩擦感を足す補助effectです。
        // 非対応デバイスもあるため、失敗した場合は以後そのeffectを無効扱いにします。
        var damperAmount = ClampFinite(damper + inertia * 0.35, 0, 1);
        var frictionAmount = ClampFinite(friction, 0, 1);
        if (_capabilities.EffectsEnumerated && !_capabilities.Damper)
        {
            _damperUnavailable = true;
            _lastDamper = 0;
        }
        if (_capabilities.EffectsEnumerated && !_capabilities.Friction)
        {
            _frictionUnavailable = true;
            _lastFriction = 0;
        }
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
            BridgeLog.Warn($"DirectInput condition effect is unavailable. effect={effectGuid}, profile={_profile.Id}");
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
        // T300の単軸Condition effectはCartesian direction=0が必要です。
        parameters.SetAxes(new[] { _ffbAxisOffset }, new[] { _signMode == DirectInputForceSignMode.SignedSingleAxisMagnitude ? 0 : 1 });
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
        _deviceName = "";
        _exclusive = false;
        _profile = FfbDeviceCompatibility.Generic;
        _capabilities = FfbEffectCapabilities.None;
        _signMode = ResolveSignMode(_profile);
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
            EffectMode: _effectMode,
            Profile: _profile,
            Capabilities: _capabilities,
            DeviceId: _deviceId,
            DeviceName: _deviceName,
            Acquired: _device is not null,
            Exclusive: _exclusive);
    }

    private static bool LooksLikeWheel(string? name, DeviceType type)
    {
        var text = (name ?? "").ToLowerInvariant();
        return type == DeviceType.Driving
            || text.Contains("g25")
            || text.Contains("g27")
            || text.Contains("g29")
            || text.Contains("g923")
            || text.Contains("g920")
            || text.Contains("t300")
            || text.Contains("t-300")
            || text.Contains("thrustmaster")
            || text.Contains("moza")
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
