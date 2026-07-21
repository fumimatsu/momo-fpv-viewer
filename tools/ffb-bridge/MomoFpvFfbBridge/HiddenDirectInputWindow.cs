using System.Runtime.InteropServices;

namespace MomoFpvFfbBridge;

// DirectInputのSetCooperativeLevelにはWin32のウィンドウハンドル(HWND)が必要です。
// ブリッジ自体はコンソールアプリですが、FFB用に最小限の隠しウィンドウとmessage pumpを持たせます。
internal sealed class HiddenDirectInputWindow : IDisposable
{
    private const int CwUseDefault = unchecked((int)0x80000000);
    private const int WsOverlapped = 0x00000000;
    private const int SwShow = 5;
    private const uint WmClose = 0x0010;
    private const uint WmDestroy = 0x0002;
    private const uint WmQuit = 0x0012;

    private readonly string _className;
    private readonly string _title;
    private readonly int _width;
    private readonly int _height;
    private readonly bool _visible;
    private readonly WndProc _wndProc;
    private readonly ManualResetEventSlim _ready = new(false);
    private readonly Thread _thread;

    private Exception? _startupError;
    private ushort _classAtom;
    private uint _threadId;
    private bool _disposed;

    public IntPtr Handle { get; private set; }

    public HiddenDirectInputWindow(bool visible = false, string title = "Momo FPV FFB Bridge", int width = 1, int height = 1)
    {
        _visible = visible;
        _title = title;
        _width = Math.Max(1, width);
        _height = Math.Max(1, height);
        _className = "MomoFpvFfbBridgeDirectInputWindow_" + Guid.NewGuid().ToString("N");
        _wndProc = WindowProc;
        _thread = new Thread(WindowThreadMain)
        {
            IsBackground = true,
            Name = _className
        };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();

        if (!_ready.Wait(TimeSpan.FromSeconds(5)))
        {
            throw new InvalidOperationException("Timed out while creating the FFB bridge window.");
        }
        if (_startupError is not null)
        {
            throw new InvalidOperationException("Failed to create the FFB bridge window.", _startupError);
        }
    }

    public void Activate()
    {
        if (Handle == IntPtr.Zero) return;
        ShowWindow(Handle, SwShow);
        UpdateWindow(Handle);
        SetForegroundWindow(Handle);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        var handle = Handle;
        if (handle != IntPtr.Zero)
        {
            PostMessage(handle, WmClose, IntPtr.Zero, IntPtr.Zero);
        }

        if (!_thread.Join(TimeSpan.FromSeconds(2)) && _threadId != 0)
        {
            PostThreadMessage(_threadId, WmQuit, IntPtr.Zero, IntPtr.Zero);
            _thread.Join(TimeSpan.FromSeconds(1));
        }

        _ready.Dispose();
    }

    private void WindowThreadMain()
    {
        // STAスレッド上に小さなWin32ウィンドウを作り、DirectInputが参照できるHandleを用意します。
        _threadId = GetCurrentThreadId();
        try
        {
            var wc = new WndClass
            {
                lpfnWndProc = Marshal.GetFunctionPointerForDelegate(_wndProc),
                hInstance = GetModuleHandle(null),
                lpszClassName = _className
            };
            _classAtom = RegisterClass(ref wc);
            if (_classAtom == 0)
            {
                throw new InvalidOperationException($"RegisterClass failed: {Marshal.GetLastWin32Error()}");
            }

            Handle = CreateWindowEx(
                0,
                _className,
                _title,
                WsOverlapped,
                CwUseDefault,
                CwUseDefault,
                _width,
                _height,
                IntPtr.Zero,
                IntPtr.Zero,
                wc.hInstance,
                IntPtr.Zero);
            if (Handle == IntPtr.Zero)
            {
                throw new InvalidOperationException($"CreateWindowEx failed: {Marshal.GetLastWin32Error()}");
            }

            if (_visible) Activate();
            _ready.Set();

            while (GetMessage(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                // DirectInputやドライバ側がウィンドウメッセージを前提にすることがあるため、
                // 完全なhiddenアプリでもmessage pumpだけは回し続けます。
                TranslateMessage(ref message);
                DispatchMessage(ref message);
            }
        }
        catch (Exception ex)
        {
            _startupError = ex;
            _ready.Set();
        }
        finally
        {
            if (_classAtom != 0)
            {
                UnregisterClass(_className, GetModuleHandle(null));
                _classAtom = 0;
            }
        }
    }

    private IntPtr WindowProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WmClose)
        {
            DestroyWindow(hwnd);
            return IntPtr.Zero;
        }
        if (msg == WmDestroy)
        {
            if (hwnd == Handle) Handle = IntPtr.Zero;
            PostQuitMessage(0);
            return IntPtr.Zero;
        }
        return DefWindowProc(hwnd, msg, wParam, lParam);
    }

    private delegate IntPtr WndProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WndClass
    {
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string? lpszMenuName;
        public string lpszClassName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern ushort RegisterClass(ref WndClass lpWndClass);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool UnregisterClass(string lpClassName, IntPtr hInstance);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateWindowEx(
        int dwExStyle,
        string lpClassName,
        string lpWindowName,
        int dwStyle,
        int x,
        int y,
        int nWidth,
        int nHeight,
        IntPtr hWndParent,
        IntPtr hMenu,
        IntPtr hInstance,
        IntPtr lpParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool UpdateWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr DefWindowProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetMessage(out Msg lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref Msg lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref Msg lpMsg);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int nExitCode);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
