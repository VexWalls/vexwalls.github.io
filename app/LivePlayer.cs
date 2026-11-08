// VexWalls live wallpaper player (VexWallsLive.exe).
//
// Windows 11 24H2+ only composites *GDI-drawn* layered child windows placed in Progman under the icon
// layer: anything drawn with the GPU (WPF MediaElement, Media Player, D3D) stays invisible there, and
// putting a window inside the icon layer lifts every colour (+20) and hides it when icons are shown.
// So this player decodes the video with Media Foundation into plain RGB frames and paints them with
// GDI (StretchDIBits) into a layered child of Progman, directly under SHELLDLL_DefView and above the
// system WorkerW. Colours stay exact and it works with desktop icons on or off. Older Windows: the
// classic top-level WorkerW parent is used.
//
// usage: VexWallsLive.exe <video file> [--monitor all|N] [--speed 1.0] [--parent PID]
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("VexWalls Live")]
[assembly: System.Reflection.AssemblyProduct("VexWalls")]
[assembly: System.Reflection.AssemblyVersion("1.2.0.0")]

static class LivePlayer
{
    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length < 1) return 1;
        string file = args[0], monitor = "all"; double speed = 1; int parent = 0;
        for (int i = 1; i + 1 < args.Length; i++)
        {
            if (args[i] == "--monitor") monitor = args[++i];
            else if (args[i] == "--speed") double.TryParse(args[++i], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out speed);
            else if (args[i] == "--parent") int.TryParse(args[++i], out parent);
        }
        if (speed < 0.1 || speed > 4) speed = 1;
        Native.SetProcessDPIAware();

        var screens = new List<Screen>(Screen.AllScreens);
        screens.Sort((a, b) => a.Bounds.X != b.Bounds.X ? a.Bounds.X.CompareTo(b.Bounds.X) : a.Bounds.Y.CompareTo(b.Bounds.Y));
        if (monitor != "all") { int n; if (!int.TryParse(monitor, out n) || n >= screens.Count) return 3; screens = new List<Screen> { screens[n] }; }
        Rectangle virt = SystemInformation.VirtualScreen;

        var forms = new List<WallForm>();
        foreach (Screen s in screens) forms.Add(new WallForm(new Rectangle(s.Bounds.X - virt.X, s.Bounds.Y - virt.Y, s.Bounds.Width, s.Bounds.Height)));
        bool hideWall = monitor == "all" || screens.Count == Screen.AllScreens.Length;

        var decoder = new Decoder(file, speed, forms);
        // attach once each window is really on screen (attaching earlier is not composited by DWM)
        foreach (WallForm f in forms) { WallForm w = f; w.Shown += (s, e) => Desktop.Attach(w.Handle, w.Area, true); }

        // keep our place: Explorer may rebuild its layers (theme change, wallpaper change, restart)
        var keep = new System.Windows.Forms.Timer { Interval = 4000 };
        keep.Tick += (s, e) =>
        {
            if (parent != 0) { try { Process.GetProcessById(parent); } catch { Application.Exit(); return; } }
        };
        keep.Start();
        decoder.Start();
        for (int i = 1; i < forms.Count; i++) forms[i].Show();
        Application.Run(forms[0]);
        decoder.Stop();
        return 0;
    }
}

// one window per monitor, built exactly like the setup verified on 24H2 (a plain form with a child
// panel); the video is painted on the panel in its normal paint cycle
class WallForm : Form
{
    public readonly Rectangle Area;
    readonly VideoPanel panel = new VideoPanel();
    public WallForm(Rectangle area)
    {
        Area = area;
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; BackColor = Color.Black;
        panel.Dock = DockStyle.Fill; panel.BackColor = Color.Black;
        Controls.Add(panel);
    }
    public void SetFrame(byte[] f, int w, int h, double s) { panel.SetFrame(f, w, h, s); }
}

// Paints the video. Frames live in two GDI DIB sections (previous + current). When the video is
// slowed down, the panel repaints ~60 times a second and cross-fades from the previous frame to
// the current one, so slow motion stays smooth instead of stepping (frame blending).
class VideoPanel : Panel
{
    IntPtr dcPrev, dcCur, bmpPrev, bmpCur, bitsPrev, bitsCur;
    int vw, vh; bool has; double t0, interval = 1 / 30.0; bool blend;
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly object gate = new object();
    readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer { Interval = 15 };
    public VideoPanel() { tick.Tick += (s, e) => Invalidate(); }

    void Alloc(int w, int h)
    {
        vw = w; vh = h;
        var bi = new Native.BITMAPINFOHEADER { biSize = 40, biWidth = w, biHeight = -h, biPlanes = 1, biBitCount = 32 };
        dcPrev = Native.CreateCompatibleDC(IntPtr.Zero); bmpPrev = Native.CreateDIBSection(dcPrev, ref bi, 0, out bitsPrev, IntPtr.Zero, 0); Native.SelectObject(dcPrev, bmpPrev);
        dcCur = Native.CreateCompatibleDC(IntPtr.Zero); bmpCur = Native.CreateDIBSection(dcCur, ref bi, 0, out bitsCur, IntPtr.Zero, 0); Native.SelectObject(dcCur, bmpCur);
    }
    // called by the decoder thread when a frame is due; frameSeconds = how long it stays on screen
    public void SetFrame(byte[] f, int w, int h, double frameSeconds)
    {
        lock (gate)
        {
            if (dcCur == IntPtr.Zero) Alloc(w, h);
            // the current frame becomes the previous one, the new frame is written into the other buffer
            IntPtr d = dcPrev; dcPrev = dcCur; dcCur = d; IntPtr b = bitsPrev; bitsPrev = bitsCur; bitsCur = b;
            Marshal.Copy(f, 0, bitsCur, Math.Min(f.Length, w * h * 4));
            interval = Math.Max(0.005, frameSeconds); t0 = clock.Elapsed.TotalSeconds;
            blend = has && frameSeconds > 1 / 40.0;     // slower than ~40 fps on screen: smooth it
            has = true;
        }
        try { BeginInvoke((MethodInvoker)(() => { tick.Enabled = blend; Invalidate(); })); } catch { }
    }
    protected override void OnPaintBackground(PaintEventArgs e) { if (!has) base.OnPaintBackground(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        lock (gate)
        {
            if (!has) return;
            int W = ClientSize.Width, H = ClientSize.Height;
            double k = Math.Max((double)W / vw, (double)H / vh);     // "cover": fill, crop the overflow
            int sw = (int)Math.Round(W / k), sh = (int)Math.Round(H / k), sx = (vw - sw) / 2, sy = (vh - sh) / 2;
            IntPtr dc = e.Graphics.GetHdc();
            Native.SetStretchBltMode(dc, k > 1.01 || k < 0.99 ? 4 : 3);
            Native.SetBrushOrgEx(dc, 0, 0, IntPtr.Zero);
            double a = blend ? Math.Min(1, (clock.Elapsed.TotalSeconds - t0) / interval) : 1;
            if (a >= 0.999) Native.StretchBlt(dc, 0, 0, W, H, dcCur, sx, sy, sw, sh, 0x00CC0020);
            else
            {
                Native.StretchBlt(dc, 0, 0, W, H, dcPrev, sx, sy, sw, sh, 0x00CC0020);
                Native.AlphaBlend(dc, 0, 0, W, H, dcCur, sx, sy, sw, sh, new Native.BLENDFUNCTION { SourceConstantAlpha = (byte)(a * 255) });
            }
            e.Graphics.ReleaseHdc(dc);
        }
    }
}

static class Desktop
{
    public static void Attach(IntPtr hwnd, Rectangle r, bool first = false)
    {
        IntPtr progman = Native.FindWindow("Progman", null), res;
        IntPtr childWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (first || childWorker == IntPtr.Zero)
        {
            Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), 0, 1000, out res);   // ask Explorer for its layers
            childWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        }
        IntPtr defView = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        bool moved = Native.GetParent(hwnd) != progman && Native.GetParent(hwnd) != IntPtr.Zero;
        if (first || moved)
        {
            // styles only ONCE: setting them again later makes DWM stop drawing the window
            int st = Native.GetWindowLong(hwnd, -16);
            Native.SetWindowLong(hwnd, -16, (st | 0x40000000) & ~unchecked((int)0x80000000));   // WS_CHILD, not WS_POPUP
            Native.SetWindowLong(hwnd, -20, Native.GetWindowLong(hwnd, -20) | 0x00080000);   // then layered…
            Native.SetLayeredWindowAttributes(hwnd, 0, 255, 2);       // …and fully opaque (required to be composited there)
        }
        if (defView != IntPtr.Zero && childWorker != IntPtr.Zero)
        {
            // Windows 11 24H2+: [icons] [our video] [Explorer's picture layer], all children of Progman
            if (Native.GetParent(hwnd) != progman) Native.SetParent(hwnd, progman);
            // later checks only repair the order when Explorer changed it
            if (first || Native.GetWindow(hwnd, 3) != defView) Native.SetWindowPos(hwnd, defView, r.X, r.Y, r.Width, r.Height, 0x0010 | 0x0040);
            if (first || Native.GetWindow(hwnd, 2) != childWorker) Native.SetWindowPos(childWorker, hwnd, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            return;
        }
        // older Windows: the WorkerW after the top-level window holding the icons
        IntPtr worker = IntPtr.Zero;
        Native.EnumWindows((top, l) =>
        {
            if (Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) worker = Native.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
            return true;
        }, IntPtr.Zero);
        if (worker == IntPtr.Zero) worker = progman;
        if (Native.GetParent(hwnd) != worker) Native.SetParent(hwnd, worker);
        Native.SetWindowPos(hwnd, IntPtr.Zero, r.X, r.Y, r.Width, r.Height, 0x0004 | 0x0010 | 0x0040);
    }
}

// Media Foundation source reader → RGB32 frames → GDI, paced by the video's own timestamps
class Decoder
{
    readonly string file; readonly double speed; readonly List<WallForm> forms;
    Thread thread; volatile bool stop;
    public Decoder(string file, double speed, List<WallForm> forms) { this.file = file; this.speed = speed; this.forms = forms; }
    public void Start() { thread = new Thread(Run) { IsBackground = true, Priority = ThreadPriority.BelowNormal }; thread.Start(); }
    public void Stop() { stop = true; }

    void Run()
    {
        MF.MFStartup(0x00020070, 0);
        IMFAttributes attr; MF.MFCreateAttributes(out attr, 2);
        attr.SetUINT32(MF.MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, 1);          // let MF convert to RGB32
        attr.SetUINT32(MF.MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1);           // hardware decoding when available
        IMFSourceReader reader;
        MF.MFCreateSourceReaderFromURL(file, attr, out reader);
        reader.SetStreamSelection(0xFFFFFFFE, false);
        reader.SetStreamSelection(0xFFFFFFFC, true);
        IMFMediaType want; MF.MFCreateMediaType(out want);
        want.SetGUID(MF.MF_MT_MAJOR_TYPE, MF.MFMediaType_Video);
        want.SetGUID(MF.MF_MT_SUBTYPE, MF.MFVideoFormat_RGB32);
        reader.SetCurrentMediaType(0xFFFFFFFC, IntPtr.Zero, want);
        IMFMediaType cur; reader.GetCurrentMediaType(0xFFFFFFFC, out cur);
        ulong fs; cur.GetUINT64(MF.MF_MT_FRAME_SIZE, out fs);
        int vw = (int)(fs >> 32), vh = (int)(fs & 0xFFFFFFFF);

        byte[][] bufs = { new byte[vw * vh * 4], new byte[vw * vh * 4] }; int bi = 0;
        var clock = Stopwatch.StartNew();
        long loopStart = 0, lastTs = 0, prevTs = 0;     // video time (100 ns) where the current loop began

        while (!stop)
        {
            uint idx, flags; long ts; IMFSample sample;
            reader.ReadSample(0xFFFFFFFC, 0, out idx, out flags, out ts, out sample);
            if ((flags & 2) != 0)    // end of stream: back to the start, seamlessly
            {
                if (sample != null) Marshal.ReleaseComObject(sample);
                var pv = new MF.PROPVARIANT { vt = 20, hVal = 0 };
                reader.SetCurrentPosition(Guid.Empty, ref pv);
                loopStart += lastTs + 333333;   // continue the clock after the last frame
                prevTs = 0;
                continue;
            }
            if (sample == null) continue;
            lastTs = ts;
            IMFMediaBuffer buf; sample.ConvertToContiguousBuffer(out buf);
            IntPtr p; int max, len; buf.Lock(out p, out max, out len);
            byte[] frame = bufs[bi]; bi ^= 1;          // two buffers: one shown, one being filled
            Marshal.Copy(p, frame, 0, Math.Min(len, frame.Length));
            buf.Unlock();
            Marshal.ReleaseComObject(buf); Marshal.ReleaseComObject(sample);

            // wait until this frame is due (at the chosen speed)
            double due = (loopStart + ts) / 1e7 / speed;
            double wait = due - clock.Elapsed.TotalSeconds;
            if (wait > 0.002) Thread.Sleep((int)(wait * 1000));
            else if (wait < -0.5) { clock = Stopwatch.StartNew(); loopStart = -ts; }   // fell far behind (sleep/resume): resync

            double show = prevTs > 0 && ts > prevTs ? (ts - prevTs) / 1e7 / speed : 1 / 30.0 / speed;   // how long this frame stays
            prevTs = ts;
            foreach (WallForm f in forms) f.SetFrame(frame, vw, vh, show);
        }
        MF.MFShutdown();
    }

}

static class Native
{
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr after, string c, string n);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr r);
    [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);   // 2 = next (below), 3 = previous (above)
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] public static extern int SetStretchBltMode(IntPtr dc, int mode);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool StretchBlt(IntPtr dc, int xd, int yd, int wd, int hd, IntPtr src, int xs, int ys, int ws, int hs, uint rop);
    [DllImport("msimg32.dll")] public static extern bool AlphaBlend(IntPtr dc, int xd, int yd, int wd, int hd, IntPtr src, int xs, int ys, int ws, int hs, BLENDFUNCTION f);
    [StructLayout(LayoutKind.Sequential)] public struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [DllImport("gdi32.dll")] public static extern bool SetBrushOrgEx(IntPtr dc, int x, int y, IntPtr old);
    [DllImport("gdi32.dll")] public static extern int StretchDIBits(IntPtr dc, int xd, int yd, int wd, int hd, int xs, int ys, int ws, int hs, byte[] bits, ref BITMAPINFOHEADER bmi, uint usage, uint rop);
    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }
}

// ---------- Media Foundation (only what we use; unused vtable slots are placeholders) ----------
static class MF
{
    [DllImport("mfplat.dll")] public static extern int MFStartup(int version, int flags);
    [DllImport("mfplat.dll")] public static extern int MFShutdown();
    [DllImport("mfplat.dll")] public static extern int MFCreateAttributes(out IMFAttributes a, int size);
    [DllImport("mfplat.dll")] public static extern int MFCreateMediaType(out IMFMediaType t);
    [DllImport("mfreadwrite.dll", CharSet = CharSet.Unicode)] public static extern int MFCreateSourceReaderFromURL(string url, IMFAttributes a, out IMFSourceReader r);
    public static readonly Guid MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING = new Guid("fb394f3d-ccf1-42ee-bbb3-f9b845d5681d");
    public static readonly Guid MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS = new Guid("a634a91c-822b-41b9-a494-4de4643612b0");
    public static readonly Guid MF_MT_MAJOR_TYPE = new Guid("48eba18e-f8c9-4687-bf11-0a74c9f96a8f");
    public static readonly Guid MF_MT_SUBTYPE = new Guid("f7e34c9a-42e8-4714-b74b-cb29d72c35e5");
    public static readonly Guid MF_MT_FRAME_SIZE = new Guid("1652c33d-d6b2-4012-b834-72030849a37d");
    public static readonly Guid MFMediaType_Video = new Guid("73646976-0000-0010-8000-00AA00389B71");
    public static readonly Guid MFVideoFormat_RGB32 = new Guid("00000016-0000-0010-8000-00AA00389B71");
    [StructLayout(LayoutKind.Explicit)] public struct PROPVARIANT { [FieldOffset(0)] public short vt; [FieldOffset(8)] public long hVal; }
}

[ComImport, Guid("2cd2d921-c447-44a7-a13c-4adabfc247e3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFAttributes
{
    void _GetItem(); void _GetItemType(); void _CompareItem(); void _Compare(); void _GetUINT32();
    [PreserveSig] int GetUINT64([In, MarshalAs(UnmanagedType.LPStruct)] Guid key, out ulong v);
    void _GetDouble(); void _GetGUID(); void _GetStringLength(); void _GetString(); void _GetAllocatedString(); void _GetBlobSize(); void _GetBlob(); void _GetAllocatedBlob(); void _GetUnknown();
    void _SetItem(); void _DeleteItem(); void _DeleteAllItems();
    [PreserveSig] int SetUINT32([In, MarshalAs(UnmanagedType.LPStruct)] Guid key, int v);
    void _SetUINT64(); void _SetDouble();
    [PreserveSig] int SetGUID([In, MarshalAs(UnmanagedType.LPStruct)] Guid key, [In, MarshalAs(UnmanagedType.LPStruct)] Guid v);
    void _SetString(); void _SetBlob(); void _SetUnknown(); void _LockStore(); void _UnlockStore(); void _GetCount(); void _GetItemByIndex(); void _CopyAllItems();
}

[ComImport, Guid("44ae0fa8-ea31-4109-8d2e-4cae4997c555"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFMediaType
{
    void _GetItem(); void _GetItemType(); void _CompareItem(); void _Compare(); void _GetUINT32();
    [PreserveSig] int GetUINT64([In, MarshalAs(UnmanagedType.LPStruct)] Guid key, out ulong v);
    void _GetDouble(); void _GetGUID(); void _GetStringLength(); void _GetString(); void _GetAllocatedString(); void _GetBlobSize(); void _GetBlob(); void _GetAllocatedBlob(); void _GetUnknown();
    void _SetItem(); void _DeleteItem(); void _DeleteAllItems();
    [PreserveSig] int SetUINT32([In, MarshalAs(UnmanagedType.LPStruct)] Guid key, int v);
    void _SetUINT64(); void _SetDouble();
    [PreserveSig] int SetGUID([In, MarshalAs(UnmanagedType.LPStruct)] Guid key, [In, MarshalAs(UnmanagedType.LPStruct)] Guid v);
    void _SetString(); void _SetBlob(); void _SetUnknown(); void _LockStore(); void _UnlockStore(); void _GetCount(); void _GetItemByIndex(); void _CopyAllItems();
    void _GetMajorType(); void _IsCompressedFormat(); void _IsEqual(); void _GetRepresentation(); void _FreeRepresentation();
}

[ComImport, Guid("c40a00f2-b93a-4d80-ae8c-5a1c634f58e4"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSample
{
    void _GetItem(); void _GetItemType(); void _CompareItem(); void _Compare(); void _GetUINT32(); void _GetUINT64(); void _GetDouble(); void _GetGUID();
    void _GetStringLength(); void _GetString(); void _GetAllocatedString(); void _GetBlobSize(); void _GetBlob(); void _GetAllocatedBlob(); void _GetUnknown();
    void _SetItem(); void _DeleteItem(); void _DeleteAllItems(); void _SetUINT32(); void _SetUINT64(); void _SetDouble(); void _SetGUID(); void _SetString(); void _SetBlob(); void _SetUnknown();
    void _LockStore(); void _UnlockStore(); void _GetCount(); void _GetItemByIndex(); void _CopyAllItems();
    void _GetSampleFlags(); void _SetSampleFlags(); void _GetSampleTime(); void _SetSampleTime(); void _GetSampleDuration(); void _SetSampleDuration(); void _GetBufferCount(); void _GetBufferByIndex();
    [PreserveSig] int ConvertToContiguousBuffer(out IMFMediaBuffer b);
}

[ComImport, Guid("045FA593-8799-42b8-BC8D-8968C6453507"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFMediaBuffer
{
    [PreserveSig] int Lock(out IntPtr p, out int max, out int cur);
    [PreserveSig] int Unlock();
}

[ComImport, Guid("70ae66f2-c809-4e4f-8915-bdcb406b7993"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSourceReader
{
    void _GetStreamSelection();
    [PreserveSig] int SetStreamSelection(uint stream, [MarshalAs(UnmanagedType.Bool)] bool selected);
    void _GetNativeMediaType();
    [PreserveSig] int GetCurrentMediaType(uint stream, out IMFMediaType t);
    [PreserveSig] int SetCurrentMediaType(uint stream, IntPtr reserved, IMFMediaType t);
    [PreserveSig] int SetCurrentPosition([In, MarshalAs(UnmanagedType.LPStruct)] Guid format, ref MF.PROPVARIANT pos);
    [PreserveSig] int ReadSample(uint stream, uint control, out uint actual, out uint flags, out long ts, out IMFSample s);
}

