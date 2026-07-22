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
    private Task? _bridgeTask;

    public BridgeMainForm(BridgeConfig config, IFfbBackend backend, FfbBridgeServer bridgeServer)
    {
        _config = config;
        _backend = backend;
        _bridgeServer = bridgeServer;

        Text = "Momo FPV FFB Bridge";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(710, 560);
        Size = new Size(760, 630);
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
            RowCount = 4,
            BackColor = BackColor,
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
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
        root.Controls.Add(BuildViewerPanel(), 0, 3);
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
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2, Padding = new Padding(12) };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.Controls.Add(_devices, 0, 0);
        table.SetColumnSpan(_devices, 2);
        var scan = new Button { Text = "Scan devices", AutoSize = true, Margin = new Padding(0, 10, 8, 0) };
        scan.Click += (_, _) => RefreshDevices();
        var stop = new Button { Text = "Stop FFB", AutoSize = true, Margin = new Padding(0, 10, 0, 0) };
        stop.Click += (_, _) =>
        {
            _backend.StopAll("desktop-ui stop");
            UpdateStatus();
        };
        table.Controls.Add(scan, 0, 1);
        table.Controls.Add(stop, 1, 1);
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

    private void OnShown(object? sender, EventArgs e)
    {
        UpdateRelayUrlPreview();

        _bridgeTask = _bridgeServer.RunAsync(_bridgeCts.Token);
        _ = _bridgeTask.ContinueWith(task =>
        {
            if (!task.IsFaulted || IsDisposed) return;
            BeginInvoke(() => _bridgeStatus.Text = $"Failed: {task.Exception?.GetBaseException().Message}");
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
            foreach (var device in _backend.ListDevices())
            {
                var capability = device.IsFfbCapable ? "FFB" : "input only";
                var wheel = device.IsLikelyWheel ? "wheel" : "controller";
                _devices.Items.Add($"{device.Name}  |  {capability}, {wheel}, VID:{device.VendorId} PID:{device.ProductId}");
            }
            if (_devices.Items.Count == 0) _devices.Items.Add("No DirectInput game controllers detected.");
        }
        catch (Exception ex)
        {
            _devices.Items.Clear();
            _devices.Items.Add($"Device scan failed: {ex.Message}");
        }
        finally
        {
            _devices.EndUpdate();
        }
    }

    private void UpdateStatus()
    {
        var bridgeReady = _bridgeServer.IsListening;
        SetStatus(_bridgeStatus, bridgeReady, bridgeReady ? $"Ready  ws://127.0.0.1:{_config.Port}" : "Starting...");
        SetStatus(_viewerStatus, _bridgeServer.ActiveClientCount > 0,
            _bridgeServer.ActiveClientCount > 0 ? $"Connected ({_bridgeServer.ActiveClientCount})" : "Waiting for Viewer");

        var status = _backend.Snapshot();
        var deviceText = status.Acquired
            ? $"Acquired: {status.DeviceName} ({(status.Exclusive ? "exclusive" : "shared")})"
            : "Detected devices are waiting for Viewer acquire";
        SetStatus(_deviceStatus, status.Acquired && !status.DeviceLost, deviceText);

        var active = status.LastFriction > 0.001 || status.LastDamper > 0.001 || Math.Abs(status.LastTorque) > 0.001;
        var effectText = active
            ? $"Active  friction {status.LastFriction:0.00}, damper {status.LastDamper:0.00}"
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
