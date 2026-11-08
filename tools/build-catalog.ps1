# CryWall — builds the wallpaper catalog for the website (no server needed online).
# Runs every night on GitHub Actions (Linux, PowerShell 7) and also works on Windows PowerShell 5.1:
#   powershell -ExecutionPolicy Bypass -File tools\build-catalog.ps1
# Output: public/data/c/<category>.json, public/data/l/<live-category>.json, public/data/index.json
param([string]$Out = (Join-Path (Join-Path $PSScriptRoot '..') (Join-Path 'public' 'data')))

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 CryWallCatalog'
$Utf8 = New-Object Text.UTF8Encoding $false

function Get-Html([string]$url) {
    for ($try = 1; $try -le 3; $try++) {
        try { return (Invoke-WebRequest $url -Headers @{ 'User-Agent' = $UA } -UseBasicParsing -TimeoutSec 40).Content }
        catch { if ($try -eq 3) { throw }; Start-Sleep -Seconds (5 * $try) }
    }
}
. (Join-Path $PSScriptRoot 'sources.ps1')

function Save-Json([string]$path, $obj) {
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    $json = ConvertTo-Json -InputObject $obj -Compress -Depth 5
    if (-not $json) { $json = '[]' }
    [IO.File]::WriteAllText($path, $json, $Utf8)
}

# Same categories as public/app.js (Keşfet is mixed from these on the site).
# "+tag" = the wallpaper MUST carry that tag, so "Dağ" only shows mountains (plain words
# matched far too loosely).
$Cats = @(
    @{ key = 'doga'; q = '+nature'; c = '100' }, @{ key = 'manzara'; q = '+landscape'; c = '100' },
    @{ key = 'dag'; q = '+mountains'; c = '100' }, @{ key = 'deniz'; q = '+sea'; c = '100' }, @{ key = 'orman'; q = '+forest'; c = '100' },
    @{ key = 'anime'; q = '+landscape'; c = '010' }, @{ key = 'karakter'; q = $CharacterQuery; c = '010' },
    @{ key = 'savasci'; q = '+warrior'; c = '100' }, @{ key = 'sovalye'; q = '+knight'; c = '100' }, @{ key = 'samuray'; q = '+samurai'; c = '100' },
    @{ key = 'japonya'; q = '+Japan'; c = '100' }, @{ key = 'uzay'; q = '+space'; c = '100' }, @{ key = 'siberpunk'; q = '+cyberpunk'; c = '100' },
    @{ key = 'fantastik'; q = '+"fantasy art"'; c = '100' }, @{ key = 'dijital'; q = '+"digital art"'; c = '100' }, @{ key = 'araba'; q = '+cars'; c = '100' },
    @{ key = 'sehir'; q = '+city'; c = '100' }, @{ key = 'hayvan'; q = '+animals'; c = '100' }, @{ key = 'minimal'; q = '+minimalism'; c = '100' },
    @{ key = 'soyut'; q = '+abstract'; c = '100' }, @{ key = 'karanlik'; q = '+dark'; c = '100' },
    # games / films / series / cartoons / heroes / anime: every character (copyright filter is off)
    @{ key = 'oyun'; q = '+"video games"'; c = '110' }, @{ key = 'film'; q = '+movies'; c = '110' }, @{ key = 'dizi'; q = '+"TV series"'; c = '110' },
    @{ key = 'cizgi'; q = '+cartoon'; c = '110' }, @{ key = 'kahraman'; q = '+superheroes'; c = '110' }, @{ key = 'animedunya'; q = '+anime'; c = '010' },
    # villains: several searches merged (original art only, see $VillainBan)
    @{ key = 'kotu'; c = '110'; qs = @('+Joker', '+villains', '+"Grim Reaper"', '+demon +"fantasy art"', '+"dark fantasy" +creature', '+skull +"dark fantasy"',
        '+mask +"fantasy art"', '+jester +"digital art"', '+reaper') }
)
# Villain searches must never show franchise villains (Joker, League of Legends, horror films…)
$VillainBan = ' -Joker -"The Joker" -Batman -"Harley Quinn" -"DC Comics" -"League of Legends" -Shaco -Pennywise -"It (movie)" -"Stephen King"' +
    ' -Arkham -"Heath Ledger" -"Joaquin Phoenix" -"Jared Leto" -Terrifier -"Art the Clown" -"The Amazing Digital Circus" -"Glitch Productions"' +
    ' -"In Flames" -Dodge -"Dodge Challenger" -cars -clownfish -fish -"Dark Souls" -"Elden Ring" -Diablo -"Doom (game)" -"Devil May Cry" -"Demon Slayer"' +
    ' -"Kimetsu no Yaiba" -"Jujutsu Kaisen" -"Chainsaw Man" -Bleach -"Death Note" -"Ghost of Tsushima" -"Sekiro" -"Hollow Knight" -Overwatch -Warhammer'
if (-not $CopyrightFilter) { $VillainBan = ' -clownfish -fish -Dodge -cars' }   # filter off: Joker & co. welcome, only keep the wrong-meaning hits out
$AnimeExtra = ' -"Makoto Shinkai" -"Studio Ghibli" -"Kimi no Na Wa" -"Genshin Impact" -"Honkai: Star Rail" -"Hatsune Miku"'

function Get-Wallhaven($cat, [string]$ratios, [int]$page, [string]$range, [string]$atleast = '1920x1080') {
    $q = ($cat.q + (Get-WhFilter $cat.q) + $(if ($cat.c -eq '010') { $AnimeExtra } else { '' })).Trim()
    # 'all' = best of all time. Wallhaven has no topRange=all (it silently falls back to 1 month),
    # so sort by favourites instead.
    $sort = if ($range -eq 'all') { 'sorting=favorites' } else { "sorting=toplist&topRange=$range" }
    $url = "https://wallhaven.cc/api/v1/search?purity=100&$sort&atleast=$atleast" +
        "&categories=$($cat.c)&ratios=$ratios&page=$page&q=" + [uri]::EscapeDataString($q)
    for ($try = 1; $try -le 4; $try++) {
        try {
            Start-Sleep -Milliseconds 1500          # Wallhaven allows 45 requests / minute
            return (Invoke-RestMethod $url -Headers @{ 'User-Agent' = $UA } -TimeoutSec 40)
        } catch { Write-Host "  retry $try ($($_.Exception.Message))"; Start-Sleep -Seconds (20 * $try) }
    }
    return $null
}

# Phone thumbnails: Wallhaven's own previews are small landscape crops, which look pixelated
# in tall phone boxes. For tall (phone) wallpapers we make our own 1080px-wide preview with
# ffmpeg -> public/t/<id>.jpg. Already-made ones are kept (GitHub Actions cache), so each
# night only new wallpapers are downloaded. Skipped quietly when ffmpeg isn't installed.
$ThumbDir = Join-Path (Split-Path $Out) 't'
$Ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$MaxNewThumbs = 1600
$newThumbs = 0
$keepThumbs = @{}
New-Item -ItemType Directory -Force $ThumbDir | Out-Null
function New-PhoneThumb([string]$id, [string]$url) { return (New-Thumb $id $url '' 'scale=1080:-2' 5) }
# Desktop: 1920px version for the home slideshow and the wallpaper window. Originals can be
# 6000px+ and 5-10 MB: slow, and browsers sometimes give up decoding them (stays blurry).
function New-DesktopThumb([string]$id, [string]$url) { return (New-Thumb $id $url '-d' "scale='min(1920,iw)':-2" 6) }
function New-Thumb([string]$id, [string]$url, [string]$suffix, [string]$vf, [int]$q) {
    $name = "$id$suffix.jpg"
    $file = Join-Path $ThumbDir $name
    if (Test-Path $file) { $keepThumbs[$name] = 1; return $true }
    if (-not $Ffmpeg -or $script:newThumbs -ge $MaxNewThumbs) { return $false }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("cw_" + $id + [IO.Path]::GetExtension($url))
    try {
        Invoke-WebRequest $url -Headers @{ 'User-Agent' = $UA } -UseBasicParsing -TimeoutSec 60 -OutFile $tmp
        & $Ffmpeg.Source -loglevel error -y -i $tmp -vf $vf -q:v $q $file 2>$null
        if (Test-Path $file) { $script:newThumbs++; $keepThumbs[$name] = 1; return $true }
    } catch { Write-Host "  thumb $name failed: $($_.Exception.Message)" }
    finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    return $false
}

$total = 0
foreach ($cat in $Cats) {
    $items = New-Object System.Collections.ArrayList
    $seen = @{}
    # desktop (landscape) pages, then phone (portrait) pages — enough for ~250 per category
    $plan = @(@('landscape', 1, '1y'), @('landscape', 2, '1y'), @('landscape', 3, '1y'), @('landscape', 1, 'all'), @('landscape', 2, 'all'),
        @('landscape', 3, 'all'), @('landscape', 4, 'all'), @('portrait', 1, '1y'), @('portrait', 1, 'all'), @('portrait', 2, 'all'))
    $jobs = @()
    if ($cat.qs) {
        # merged category: a few pages of each search
        foreach ($sq in $cat.qs) { foreach ($p in @(@('landscape', 1, 'all'), @('landscape', 2, 'all'), @('landscape', 1, '1y'), @('portrait', 1, 'all'))) {
            $jobs += , @(@{ key = $cat.key; q = $sq + $VillainBan; c = $cat.c }, $p) } }
    } else { foreach ($p in $plan) { $jobs += , @($cat, $p) } }
    foreach ($j in $jobs) {
        $p = $j[1]
        $r = Get-Wallhaven $j[0] $p[0] $p[1] $p[2]
        if ($r -and $r.meta -and $r.meta.last_page -lt $p[1]) { continue }   # past the last page
        if (-not $r) { continue }
        foreach ($w in @($r.data)) {
            if (-not $w -or $seen[$w.id]) { continue }; $seen[$w.id] = 1
            $item = [ordered]@{
                id = $w.id; t = $w.thumbs.large; o = $w.thumbs.original; f = $w.path; w = [int]$w.dimension_x; h = [int]$w.dimension_y
                r = [double]$w.ratio; s = [int]$w.file_size; v = [int]$w.views; fv = [int]$w.favorites
                c = @($w.colors); d = ([string]$w.created_at).Substring(0, [Math]::Min(10, ([string]$w.created_at).Length)); u = $w.url
            }
            if ([double]$w.ratio -lt 1 -and (New-PhoneThumb $w.id $w.path)) { $item.p = "t/$($w.id).jpg" }
            if ([double]$w.ratio -ge 1.2 -and (New-DesktopThumb $w.id $w.path)) { $item.dp = "t/$($w.id)-d.jpg" }
            [void]$items.Add($item)
        }
    }
    Save-Json (Join-Path $Out (Join-Path 'c' "$($cat.key).json")) @($items)
    Write-Host ("{0,-10} {1} wallpapers" -f $cat.key, $items.Count)
    $total += $items.Count
}
# Profile pictures (Discord / Instagram / Steam): square-ish images, centre-cropped to a 1024px
# square preview t/<id>-a.jpg on our own site, so the browser can crop/download them freely.
$Pfp = @(
    @{ key = 'minimal'; q = '+minimalism'; c = '100' }, @{ key = 'doga'; q = '+nature'; c = '100' },
    @{ key = 'uzay'; q = '+space'; c = '100' }, @{ key = 'karanlik'; q = '+dark'; c = '100' },
    @{ key = 'hayvan'; q = '+animals'; c = '100' }, @{ key = 'kedi'; q = '+cats'; c = '100' },
    @{ key = 'anime'; q = $CharacterQuery; c = '010' }, @{ key = 'neon'; q = '+neon'; c = '100' },
    @{ key = 'piksel'; q = '+"pixel art"'; c = '100' }
)
$MaxNewThumbs += 900       # own budget for the square previews
$pfpTotal = 0
foreach ($cat in $Pfp) {
    $items = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($p in @(@(1, 'all'), @(2, 'all'), @(1, '1y'))) {
        $r = Get-Wallhaven $cat '1x1,5x4,4x3,4x5,3x4' $p[0] $p[1] '1000x1000'
        if (-not $r) { continue }
        foreach ($w in @($r.data)) {
            if (-not $w -or $seen[$w.id]) { continue }; $seen[$w.id] = 1
            if (-not (New-Thumb $w.id $w.path '-a' "crop='min(iw,ih)':'min(iw,ih)',scale=1024:1024" 4)) { continue }
            [void]$items.Add([ordered]@{
                id = $w.id; t = $w.thumbs.large; f = $w.path; w = [int]$w.dimension_x; h = [int]$w.dimension_y
                fv = [int]$w.favorites; c = @($w.colors); u = $w.url; a = "t/$($w.id)-a.jpg"
            })
        }
    }
    Save-Json (Join-Path $Out (Join-Path 'a' "$($cat.key).json")) @($items)
    Write-Host ("pfp {0,-10} {1}" -f $cat.key, $items.Count)
    $pfpTotal += $items.Count
}

# drop phone thumbnails of wallpapers that left the catalog (keeps the site small)
Get-ChildItem $ThumbDir -Filter *.jpg -ErrorAction SilentlyContinue | Where-Object { -not $keepThumbs[$_.Name] } | Remove-Item -ErrorAction SilentlyContinue
Write-Host "phone thumbnails: $($keepThumbs.Count) ($newThumbs new)$(if (-not $Ffmpeg) { ' — ffmpeg not found, skipped' })"

# Live wallpapers (same list as LIVE_CATS in public/app.js)
$Live = @('mb:valorant', 'mb:minecraft', 'mb:fortnite', 'mb:elden-ring', 'mb:cyberpunk-2077', 'mb:gta', 'mb:call-of-duty', 'mb:god-of-war', 'mb:overwatch', 'mb:apex-legends', 'mb:hollow-knight', 'mb:honkai-star-rail', 'mb:zelda', 'mb:pokemon', 'mb:sekiro', 'mb:assassins-creed', 'mb:doom', 'mb:resident-evil', 'mb:final-fantasy', 'mb:one-piece', 'mb:demon-slayer', 'mb:jujutsu-kaisen', 'mb:attack-on-titan', 'mb:dragon-ball', 'mb:chainsaw-man', 'mb:bleach', 'mb:solo-leveling', 'mb:star-wars', 'mb:batman', 'mb:dc-comics', 'mb:rick-and-morty', 'mb:spongebob', 'mb:arcane', 'mb:cute', 'mb:games', 'mb:anime', 'mb:league-of-legends', 'mb:joker', 'mb:superhero', 'mb:marvel', 'mb:genshin-impact', 'mb:cartoon', 'mb:anime-nature', 'mb:japan', 'mb:samurai', 'mb:fantasy', 'mb:knight', 'mb:cyberpunk', 'mb:dark',
    'mb:space', 'mb:rain', 'mb:night', 'mb:sunset', 'mb:forest', 'mb:winter', 'mb:mountain', 'mb:autumn-leaves', 'mb:water',
    'mb:car', 'mb:sports-cars', 'mb:animal', 'mb:cat', 'mx:nature', 'mx:galaxy', 'mx:sea', 'mx:forest', 'mx:city', 'mx:neon', 'mx:fire')
$liveTotal = 0
foreach ($lc in $Live) {
    $items = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($page in 1..6) {      # up to ~200 videos per live category
        try { $r = Get-LiveList $lc $page } catch { Write-Host "  $lc p$page failed: $($_.Exception.Message)"; break }
        foreach ($it in @($r.data)) { if ($it -and -not $seen[$it.id]) { $seen[$it.id] = 1; [void]$items.Add($it) } }
        if (-not $r.more) { break }
        Start-Sleep -Milliseconds 800
    }
    Save-Json (Join-Path $Out (Join-Path 'l' (($lc -replace ':', '-') + '.json'))) @($items)
    Write-Host ("{0,-18} {1} videos" -f $lc, $items.Count)
    $liveTotal += $items.Count
}

Save-Json (Join-Path $Out 'index.json') ([ordered]@{ updated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); wallpapers = $total; videos = $liveTotal; pfp = $pfpTotal })
Write-Host "Done: $total wallpapers, $liveTotal live videos -> $Out"
