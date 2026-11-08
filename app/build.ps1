# Builds app\dist\VexWalls.exe (and the live wallpaper player VexWallsLive.exe it carries) with the
# C# compiler that ships with Windows (.NET Framework 4).
#   powershell -ExecutionPolicy Bypass -File app\build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null

# 1) live wallpaper player (Media Foundation + GDI; the manifest declares Windows 10/11, which
#    layered child windows need)
& $csc /nologo /codepage:65001 /target:winexe /optimize+ /nowarn:1690 "/out:$dist\VexWallsLive.exe" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll "$PSScriptRoot\LivePlayer.cs"
if ($LASTEXITCODE -ne 0) { throw "player build failed" }

# 2) the app; helper scripts + player are embedded and unpacked on install
$res = @(
    "/resource:$root\server.ps1,server.ps1",
    "/resource:$root\live.ps1,live.ps1",
    "/resource:$root\rotate.ps1,rotate.ps1",
    "/resource:$root\tools\sources.ps1,tools.sources.ps1",
    "/resource:$dist\VexWallsLive.exe,VexWallsLive.exe",
    "/resource:$PSScriptRoot\vexwalls.ico,vexwalls.ico"
)
& $csc /nologo /codepage:65001 /target:winexe /optimize+ /platform:anycpu "/out:$dist\VexWalls.exe" "/win32icon:$PSScriptRoot\vexwalls.ico" `
    /r:System.Windows.Forms.dll /r:System.Management.dll /r:Microsoft.CSharp.dll /r:System.Core.dll @res "$PSScriptRoot\VexWalls.cs"
if ($LASTEXITCODE -ne 0) { throw "build failed" }
Get-Item "$dist\VexWallsLive.exe", "$dist\VexWalls.exe" | Select-Object Name, Length

