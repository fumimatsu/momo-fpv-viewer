using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace MomoFpvFfbBridge;

internal sealed class BridgeMainForm : Form
{
    private readonly BridgeConfig _config;
    private readonly IFfbBackend _backend;
    private readonly FfbBridgeServer _bridgeServer;
    private readonly CancellationTokenSource _bridgeCts = new();
    private readonly System.Windows.Forms.Timer _statusTimer = new() { Interval = 750 };
    private readonly Label _bridgeStatus = CreateStatusLabel();
    private readonly Label _viewerStatus = CreateStatusLabel();
    private readonly Label _deviceStatus = CreateStatusLabel();
    private readonly Label _effectStatus = CreateStatusLabel();
    private readonly ListBox _devices = new() { Dock = DockStyle.Fill, IntegralHeight = false };
    private readonly TextBox _relayEndpoint = new() { Dock = DockStyle.Fill };
    private readonly TextBox _relayDevice = new() { Dock = DockStyle.Fill };
    private readonly Label _viewerUrl = new() { AutoSize = true, ForeColor = Color.FromArgb(90, 110, 125) };
    private readonly NumericUpDown _testStrength = new()
    {
        Minimum = 0.05M,
        Maximum = 1.00M,
        DecimalPlaces = 2,
        Increment = 0.05M,
        Value = 0.15M,
        Width = 80,
    };
    private readonly Label _testStatus = new() { AutoSize = true, ForeColor = Color.FromArgb(90, 110, 125), Text = "Viewer 未接続時だけ手動テストできます。" };
    private CancellationTokenSource? _testCts;
    private Task? _bridgeTask;
    private string? _bridgeStartupError;
    private string _directionTestDeviceId = "";
    private bool _leftDirectionTestCompleted;
    private bool _rightDirectionTestCompleted;

    public BridgeMainForm(BridgeConfig config, IFfbBackend backend, FfbBridgeServer bridgeServer)
    {
        _config = config;
        _backend = backend;
        _bridgeServer = bridgeServer;

        Text = "Momo FPV FFB Bridge";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(710, 690);
        Size = new Size(760, 750);
        Font = new Font("Segoe UI", 9F);
        BackColor = Color.FromArgb(245, 248, 250);

        var settings = BridgeAppSettings.Load();
        _relayEndpoint.Text = settings.RelayEndpoint;
        _relayDevice.Text = settings.RelayDevice;

        Controls.Add(BuildLayout());
        _relayEndpoint.TextChanged += (_, _) => UpdateRelayUrlPreview();
        _statusTimer.Tick += (_, _) => UpdateStatus();
        FormClosing += OnFormClosing;
        Shown += OnShown;
    }

    private Control BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(22),
            ColumnCount = 1,
            RowCount = 5,
            BackColor = BackColor,
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var title = new Label
        {
            Text = "Momo FPV  |  Force Feedback Bridge",
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 16F),
            ForeColor = Color.FromArgb(20, 39, 54),
            Margin = new Padding(0, 0, 0, 14),
        };
        root.Controls.Add(title, 0, 0);
        root.Controls.Add(BuildConnectionPanel(), 0, 1);
        root.Controls.Add(BuildDevicePanel(), 0, 2);
        root.Controls.Add(BuildTesterPanel(), 0, 3);
        root.Controls.Add(BuildViewerPanel(), 0, 4);
        return root;
    }

    private Control BuildConnectionPanel()
    {
        var group = CreateGroup("Bridge status");
        var table = CreateTwoColumnTable(4);
        AddStatusRow(table, 0, "FFB Bridge", _bridgeStatus);
        AddStatusRow(table, 1, "Viewer connection", _viewerStatus);
        AddStatusRow(table, 2, "Wheel / DirectInput", _deviceStatus);
        AddStatusRow(table, 3, "Current effect", _effectStatus);
        group.Controls.Add(table);
        return group;
    }

    private Control BuildDevicePanel()
    {
        var group = CreateGroup("Detected DirectInput devices");
        group.Margin = new Padding(0, 14, 0, 14);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Padding = new Padding(12) };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.Controls.Add(_devices, 0, 0);
        var scan = new Button { Text = "Scan devices", AutoSize = true, Margin = new Padding(0, 10, 8, 0) };
        scan.Click += (_, _) => RefreshDevices();
        var report = new Button { Text = "Save / Copy compatibility report", AutoSize = true, Margin = new Padding(0, 10, 8, 0) };
        report.Click += (_, _) => SaveCompatibilityReport();
        var stop = new Button { Text = "Stop FFB", AutoSize = true, Margin = new Padding(0, 10, 0, 0) };
        stop.Click += (_, _) =>
        {
            _backend.StopAll("desktop-ui stop");
            UpdateStatus();
        };
        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        controls.Controls.Add(scan);
        controls.Controls.Add(report);
        controls.Controls.Add(stop);
        table.Controls.Add(controls, 0, 1);
        group.Controls.Add(table);
        return group;
    }

    private Control BuildViewerPanel()
    {
        var group = CreateGroup("Viewer launch");
        group.AutoSize = false;
        group.Height = 195;
        group.MinimumSize = new Size(0, 195);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 5, Padding = new Padding(12) };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        table.Controls.Add(new Label { Text = "Relay endpoint", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        table.Controls.Add(_relayEndpoint, 1, 0);
        table.Controls.Add(new Label { Text = "Relay device", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 1);
        table.Controls.Add(_relayDevice, 1, 1);
        table.Controls.Add(_viewerUrl, 1, 2);
        var setup = new Button { Text = "Input / FFB setup", AutoSize = true, Margin = new Padding(0, 10, 8, 0) };
        setup.Click += (_, _) => OpenViewerPage("gamepad.html");
        var viewer = new Button { Text = "Open Viewer", AutoSize = true, Margin = new Padding(0, 10, 0, 0) };
        viewer.Click += (_, _) => OpenViewerPage("viewer.html");
        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        controls.Controls.Add(setup);
        controls.Controls.Add(viewer);
        table.Controls.Add(controls, 1, 3);
        table.SetColumnSpan(controls, 2);
        var help = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(650, 0),
            ForeColor = Color.FromArgb(90, 110, 125),
            Text = "Both buttons open pages served by the Relay. Set up Input / FFB once, then Open Viewer uses the saved profile for this Relay device.",
            Margin = new Padding(0, 8, 0, 0),
        };
        table.Controls.Add(help, 1, 4);
        table.SetColumnSpan(help, 2);
        group.Controls.Add(table);
        return group;
    }

    private Control BuildTesterPanel()
    {
        var group = CreateGroup("DirectInput manual tester");
        group.Margin = new Padding(0, 0, 0, 14);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 4, Padding = new Padding(12), AutoSize = true };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.Controls.Add(new Label { Text = "Strength", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        table.Controls.Add(_testStrength, 1, 0);

        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        var left = new Button { Text = "Hold left 0.5 s", AutoSize = true };
        left.Click += async (_, _) => await RunDirectionTestAsync(-1);
        var right = new Button { Text = "Hold right 0.5 s", AutoSize = true };
        right.Click += async (_, _) => await RunDirectionTestAsync(1);
        var resistance = new Button { Text = "Resistance 3 s", AutoSize = true };
        resistance.Click += async (_, _) => await StartManualTestAsync(token => RunOutputAsync(0, TestStrength(), TestStrength(), TimeSpan.FromSeconds(3), token));
        var impact = new Button { Text = "Impact burst", AutoSize = true };
        impact.Click += async (_, _) => await StartManualTestAsync(RunImpactBurstAsync);
        var stop = new Button { Text = "Stop FFB", AutoSize = true };
        stop.Click += (_, _) => StopManualTest("desktop-ui manual stop");
        var correct = new Button { Text = "Directions correct", AutoSize = true };
        correct.Click += (_, _) => ConfirmUnknownDirection(1);
        var reversed = new Button { Text = "Directions reversed", AutoSize = true };
        reversed.Click += (_, _) => ConfirmUnknownDirection(-1);
        controls.Controls.Add(left);
        controls.Controls.Add(right);
        controls.Controls.Add(resistance);
        controls.Controls.Add(impact);
        controls.Controls.Add(stop);
        table.Controls.Add(controls, 0, 1);
        table.SetColumnSpan(controls, 2);
        table.Controls.Add(_testStatus, 0, 2);
        table.SetColumnSpan(_testStatus, 2);
        var confirmation = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        confirmation.Controls.Add(correct);
        confirmation.Controls.Add(reversed);
        table.Controls.Add(confirmation, 0, 3);
        table.SetColumnSpan(confirmation, 2);
        group.Controls.Add(table);
        return group;
    }

    private double TestStrength() => (double)_testStrength.Value;

    private async Task<bool> StartManualTestAsync(Func<CancellationToken, Task> test, bool allowUnconfirmedUnknown = false)
    {
        if (_bridgeServer.ActiveClientCount > 0)
        {
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = "Viewer 接続中は手動テストできません。Drive Off と Viewer 切断後に実行してください。";
            return false;
        }

        if (!EnsureManualTestDevice()) return false;
        var compatibility = _bridgeServer.GetCompatibilityGateStatus();
        if (compatibility.Required && !compatibility.Approved && !allowUnconfirmedUnknown)
        {
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = "Unknown wheel: run both low-output direction tests and confirm direction first.";
            return false;
        }
        StopManualTest("replace manual test");
        var testCts = new CancellationTokenSource();
        _testCts = testCts;
        var token = testCts.Token;
        _testStatus.ForeColor = Color.FromArgb(0, 110, 86);
        _testStatus.Text = "Manual test running. Stop FFB または 250 ms 無更新で出力を停止します。";
        var completed = false;
        try
        {
            await test(token);
            completed = !token.IsCancellationRequested;
            if (completed) _testStatus.Text = "Manual test finished. Output stopped.";
        }
        catch (OperationCanceledException)
        {
            _testStatus.Text = "Manual test stopped.";
        }
        catch (Exception ex)
        {
            BridgeLog.Error("Manual DirectInput test failed.", ex);
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = $"Manual test failed: {ex.Message}";
        }
        finally
        {
            _backend.StopAll("manual test completed");
            if (ReferenceEquals(_testCts, testCts))
            {
                _testCts = null;
            }
            testCts.Dispose();
            UpdateStatus();
        }
        return completed;
    }

    private async Task RunDirectionTestAsync(int direction)
    {
        var appliedStrength = 0.0;
        var completed = await StartManualTestAsync(token =>
        {
            appliedStrength = DirectionTestStrength();
            return RunOutputAsync(
                direction < 0 ? -appliedStrength : appliedStrength,
                0,
                0,
                TimeSpan.FromMilliseconds(500),
                token);
        },
            allowUnconfirmedUnknown: true);
        if (!completed) return;
        var status = _backend.Snapshot();
        TrackDirectionTestDevice(status.DeviceId);
        if (direction < 0) _leftDirectionTestCompleted = true;
        else _rightDirectionTestCompleted = true;
        _testStatus.Text = $"Direction test recorded: {(direction < 0 ? "left" : "right")}. Run both directions before confirmation.";
        BridgeLog.Info($"Manual direction test completed. deviceId={status.DeviceId}, requestedDirection={(direction < 0 ? "left" : "right")}, strength={appliedStrength:0.00}");
    }

    private double DirectionTestStrength()
    {
        var status = _backend.Snapshot();
        return status.Profile.IsKnown ? TestStrength() : Math.Min(TestStrength(), 0.20);
    }

    private void ConfirmUnknownDirection(int polarity)
    {
        var status = _backend.Snapshot();
        if (!status.Acquired || string.IsNullOrWhiteSpace(status.DeviceId))
        {
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = "Acquire a DirectInput wheel and run both direction tests first.";
            return;
        }
        if (status.Profile.IsKnown)
        {
            _testStatus.ForeColor = Color.FromArgb(0, 110, 86);
            _testStatus.Text = $"{status.Profile.Label} uses a validated built-in direction profile.";
            return;
        }
        if (!string.Equals(_directionTestDeviceId, status.DeviceId, StringComparison.OrdinalIgnoreCase)
            || !_leftDirectionTestCompleted
            || !_rightDirectionTestCompleted)
        {
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = "Run both Hold left and Hold right on this device before confirming direction.";
            return;
        }
        var result = _bridgeServer.ConfirmUnknownDevicePolarity(polarity);
        _testStatus.ForeColor = Color.FromArgb(0, 110, 86);
        _testStatus.Text = polarity < 0
            ? "Unknown wheel approved with reversed torque polarity for this Bridge process."
            : "Unknown wheel approved with normal torque polarity for this Bridge process.";
        BridgeLog.Info($"Manual compatibility confirmation accepted. deviceId={result.DeviceId}, torquePolarity={result.EffectiveTorquePolarity}");
        UpdateStatus();
    }

    private void TrackDirectionTestDevice(string deviceId)
    {
        if (string.Equals(_directionTestDeviceId, deviceId, StringComparison.OrdinalIgnoreCase)) return;
        _directionTestDeviceId = deviceId;
        _leftDirectionTestCompleted = false;
        _rightDirectionTestCompleted = false;
    }

    private bool EnsureManualTestDevice()
    {
        var current = _backend.Snapshot();
        if (current.Acquired && !current.DeviceLost)
        {
            TrackDirectionTestDevice(current.DeviceId);
            return true;
        }
        var device = _backend.ListDevices().FirstOrDefault(candidate => candidate.IsFfbCapable && candidate.Capabilities.ConstantForce);
        if (device is null)
        {
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = "Constant Force 対応の DirectInput デバイスが見つかりません。";
            return false;
        }
        var result = _backend.Acquire(device.Id, preferExclusive: true);
        var status = _backend.Snapshot(result.Message);
        FfbCompatibilityDiagnostics.LogAcquire(result, status, "manual-test");
        if (result.Ok)
        {
            TrackDirectionTestDevice(result.DeviceId);
            return true;
        }
        _testStatus.ForeColor = Color.Firebrick;
        _testStatus.Text = $"Device acquire failed: {result.Message}";
        BridgeLog.Warn($"Manual DirectInput acquire failed. deviceId={device.Id}, message={result.Message}");
        return false;
    }

    private async Task RunImpactBurstAsync(CancellationToken token)
    {
        var strength = TestStrength();
        await RunOutputAsync(-strength, 0, 0, TimeSpan.FromMilliseconds(80), token);
        await RunOutputAsync(strength * 0.70, 0, 0, TimeSpan.FromMilliseconds(110), token);
        await RunOutputAsync(-strength * 0.40, 0, 0, TimeSpan.FromMilliseconds(90), token);
    }

    private async Task RunOutputAsync(double torque, double damper, double friction, TimeSpan duration, CancellationToken token)
    {
        var stopAt = DateTimeOffset.UtcNow + duration;
        while (DateTimeOffset.UtcNow < stopAt)
        {
            token.ThrowIfCancellationRequested();
            var status = _backend.SetFfb(torque, 1, true, "constant", damper, friction, 0);
            if (status.DeviceLost) throw new InvalidOperationException(status.Message);
            await Task.Delay(40, token);
        }
    }

    private void StopManualTest(string message)
    {
        _testCts?.Cancel();
        _backend.StopAll(message);
        UpdateStatus();
    }

    private void OnShown(object? sender, EventArgs e)
    {
        UpdateRelayUrlPreview();

        _bridgeTask = _bridgeServer.RunAsync(_bridgeCts.Token);
        _ = _bridgeTask.ContinueWith(task =>
        {
            if (!task.IsFaulted || IsDisposed) return;
            var error = task.Exception?.GetBaseException().Message ?? "Unknown startup failure.";
            BeginInvoke(() =>
            {
                _bridgeStartupError = error;
                BridgeLog.Error("Bridge startup failed.", task.Exception?.GetBaseException());
                UpdateStatus();
            });
        }, TaskScheduler.Default);
        RefreshDevices();
        _statusTimer.Start();
        UpdateStatus();
    }

    private void RefreshDevices()
    {
        try
        {
            _devices.BeginUpdate();
            _devices.Items.Clear();
            var devices = _backend.ListDevices();
            FfbCompatibilityDiagnostics.LogDeviceScan(devices, "desktop-ui");
            foreach (var device in devices)
            {
                var capability = device.IsFfbCapable ? "FFB" : "input only";
                var wheel = device.IsLikelyWheel ? "wheel" : "controller";
                _devices.Items.Add($"{device.Name}  |  {capability}, {wheel}, VID:{device.VendorId} PID:{device.ProductId}, profile:{device.Profile.Id}");
            }
            if (_devices.Items.Count == 0) _devices.Items.Add("No DirectInput game controllers detected.");
        }
        catch (Exception ex)
        {
            BridgeLog.Error("DirectInput device scan failed.", ex);
            _devices.Items.Clear();
            _devices.Items.Add($"Device scan failed: {ex.Message}");
        }
        finally
        {
            _devices.EndUpdate();
        }
    }

    private void SaveCompatibilityReport()
    {
        try
        {
            var path = FfbCompatibilityDiagnostics.SaveReport(_config, _backend, _bridgeServer, out var json);
            var copied = false;
            try
            {
                Clipboard.SetText(json);
                copied = true;
            }
            catch (Exception ex)
            {
                BridgeLog.Warn($"Compatibility report clipboard copy failed. message={ex.Message}");
            }
            _testStatus.ForeColor = Color.FromArgb(0, 110, 86);
            _testStatus.Text = copied
                ? $"Compatibility report saved and copied: {Path.GetFileName(path)}"
                : $"Compatibility report saved: {Path.GetFileName(path)}";
            BridgeLog.Info($"Compatibility report generated. file={Path.GetFileName(path)}, copied={copied}");
        }
        catch (Exception ex)
        {
            BridgeLog.Error("Compatibility report generation failed.", ex);
            _testStatus.ForeColor = Color.Firebrick;
            _testStatus.Text = $"Compatibility report failed: {ex.Message}";
        }
    }

    private void UpdateStatus()
    {
        var bridgeReady = _bridgeServer.IsListening;
        var startupError = _bridgeStartupError;
        SetStatus(
            _bridgeStatus,
            bridgeReady,
            bridgeReady
                ? $"Ready  ws://127.0.0.1:{_config.Port}"
                : string.IsNullOrWhiteSpace(startupError)
                    ? "Starting..."
                    : $"Failed: {startupError}");
        SetStatus(_viewerStatus, _bridgeServer.ActiveClientCount > 0,
            _bridgeServer.ActiveClientCount > 0 ? $"Connected ({_bridgeServer.ActiveClientCount})" : "Waiting for Viewer");

        var status = _backend.Snapshot();
        var compatibility = _bridgeServer.GetCompatibilityGateStatus();
        var deviceText = status.Acquired
            ? $"Acquired: {status.DeviceName} ({(status.Exclusive ? "exclusive" : "shared")})"
              + (compatibility.Required && !compatibility.Approved ? " - direction confirmation required" : "")
            : "Detected devices are waiting for Viewer acquire";
        SetStatus(
            _deviceStatus,
            status.Acquired && !status.DeviceLost && (!compatibility.Required || compatibility.Approved),
            deviceText);

        var active = status.LastFriction > 0.001 || status.LastDamper > 0.001 || Math.Abs(status.LastTorque) > 0.001;
        var effectText = active
            ? $"Active  torque {status.LastTorque:+0.00;-0.00;0.00}, friction {status.LastFriction:0.00}, damper {status.LastDamper:0.00}"
            : "No FFB output";
        SetStatus(_effectStatus, active && !status.DeviceLost, effectText);
    }

    private void OpenViewerPage(string page)
    {
        var device = _relayDevice.Text.Trim();
        if (!TryGetRelayUri(out var relayUri) || string.IsNullOrWhiteSpace(device))
        {
            MessageBox.Show(this, "Enter the Relay endpoint and device, for example 127.0.0.1:8090 and 11.3.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var origin = relayUri.GetLeftPart(UriPartial.Authority);
        _config.AllowOrigin(origin);
        new BridgeAppSettings(_relayEndpoint.Text.Trim(), device).Save();

        var builder = new UriBuilder(relayUri) { Path = page };
        var query = page == "gamepad.html"
            ? $"viewer=relay-pilot&relayPilotPath=flat&device={Uri.EscapeDataString(device)}"
            : $"device={Uri.EscapeDataString(device)}";
        builder.Query = query;
        Process.Start(new ProcessStartInfo(builder.Uri.AbsoluteUri) { UseShellExecute = true });
    }

    private bool TryGetRelayUri(out Uri relayUri)
    {
        var endpoint = _relayEndpoint.Text.Trim().TrimEnd('/');
        if (!endpoint.Contains("://", StringComparison.Ordinal)) endpoint = $"http://{endpoint}";
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var parsed) ||
            parsed.Scheme != Uri.UriSchemeHttp ||
            string.IsNullOrWhiteSpace(parsed.Host) ||
            parsed.Port < 1 ||
            !string.IsNullOrEmpty(parsed.UserInfo) ||
            parsed.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(parsed.Query) ||
            !string.IsNullOrEmpty(parsed.Fragment))
        {
            relayUri = null!;
            return false;
        }

        relayUri = parsed;
        return true;
    }

    private void UpdateRelayUrlPreview()
    {
        if (TryGetRelayUri(out var relayUri))
        {
            // 手動で Pilot URL を開く運用でも、画面に指定した Relay Origin は
            // Bridge 起動中に許可済みにする。Open Viewer ボタンへの依存をなくす。
            _config.AllowOrigin(relayUri.GetLeftPart(UriPartial.Authority));
            _viewerUrl.Text = $"Relay Pilot: {relayUri.GetLeftPart(UriPartial.Authority)}/pilot.html";
            _viewerUrl.ForeColor = Color.FromArgb(90, 110, 125);
            return;
        }

        _viewerUrl.Text = "Enter Relay host:port (for example 127.0.0.1:8090).";
        _viewerUrl.ForeColor = Color.Firebrick;
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        _statusTimer.Stop();
        StopManualTest("desktop-ui exit");
        _backend.StopAll("desktop-ui exit");
        _bridgeCts.Cancel();
        _bridgeServer.DisposeAsync().AsTask().GetAwaiter().GetResult();
        _bridgeCts.Dispose();
    }

    private static GroupBox CreateGroup(string text)
    {
        return new GroupBox
        {
            Text = text,
            Dock = DockStyle.Fill,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(12),
        };
    }

    private static TableLayoutPanel CreateTwoColumnTable(int rows)
    {
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = rows, Padding = new Padding(12), AutoSize = true };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        return table;
    }

    private static void AddStatusRow(TableLayoutPanel table, int row, string name, Label value)
    {
        table.Controls.Add(new Label { Text = name, AutoSize = true, Anchor = AnchorStyles.Left }, 0, row);
        table.Controls.Add(value, 1, row);
    }

    private static Label CreateStatusLabel()
    {
        return new Label { AutoSize = true, Anchor = AnchorStyles.Left, ForeColor = Color.FromArgb(140, 83, 0), Text = "Starting..." };
    }

    private static void SetStatus(Label label, bool ok, string text)
    {
        label.Text = $"{(ok ? "●" : "●")}  {text}";
        label.ForeColor = ok ? Color.FromArgb(0, 110, 86) : Color.FromArgb(150, 91, 0);
    }
}
