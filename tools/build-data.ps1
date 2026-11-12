<#
  build-data.ps1 — сборка портала из собранных фрагментов
  Читает data\parts\*.json (реестр примэрий, найденные сайты, ленты, справочники,
  карту источников) и пишет четыре файла: data\primarii.js, data\feeds.js,
  data\reference.js, data\sources.js — их открывает index.html без сервера.
  Запуск:  powershell -ExecutionPolicy Bypass -File tools\build-data.ps1
#>
[CmdletBinding()]
param([string]$Root = '')
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($PSScriptRoot) { $Root = Split-Path -Parent $PSScriptRoot } else { $Root = (Get-Location).Path }
}
$Root = (Resolve-Path $Root).Path
$parts = Join-Path $Root 'data\parts'
$out   = Join-Path $Root 'data'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function Norm([string]$s){
  if ($null -eq $s) { return '' }
  $s = $s.ToLower()
  $s = $s -replace '[ăâ]', 'a'
  $s = $s -replace 'î', 'i'
  $s = $s -replace '[șş]', 's'
  $s = $s -replace '[țţ]', 't'
  $s = $s -replace 'ё', 'е'
  $s = $s -replace '[^\p{L}\p{N}]+', ' '
  return $s.Trim()
}
function UnitKey([string]$s){
  $k = Norm $s
  $k = $k -replace '^(raionul|municipiul|raion|mun|utagagauzia|uga gaugauzia)\s+',''
  return $k.Trim()
}
function PrimKey([string]$unit,[string]$name){
  $n = Norm $name
  $n = $n -replace '^(primaria|primăria)\s+',''
  $n = $n -replace '^(comuna|orasul|satul|municipiul|sectorul|mun)\s+',''
  return (UnitKey $unit) + '|' + $n
}
function ReadJson([string]$path){
  if (-not (Test-Path $path)) { return $null }
  $txt = Get-Content -Raw -Encoding UTF8 $path
  try { return ($txt | ConvertFrom-Json) } catch { Write-Warning "плохой JSON: $path"; return $null }
}
function WriteJs([string]$path,[string]$globalVar,$obj){
  $json = ConvertTo-Json -InputObject $obj -Depth 30 -Compress
  $body = "/* сгенерировано $(Get-Date -Format 'yyyy-MM-dd HH:mm') из data\parts — не редактируй вручную */`nwindow.$globalVar = $json;`n"
  Set-Content -Path $path -Value $body -Encoding UTF8
  return (Get-Item $path).Length
}
function AsArray($o){
  if ($null -eq $o) { return @() }
  if ($o -is [System.Collections.IEnumerable] -and $o -isnot [string]) { return @($o) }
  return @($o)
}

Write-Host "LITTLE HUNTER portal :: сборка данных" -ForegroundColor Cyan
Write-Host "корень: $Root"

# ---------------------------------------------------------------- реестр примэрий
$items  = New-Object System.Collections.Generic.List[object]
$units  = @{}
foreach ($f in (Get-ChildItem -Path $parts -Filter 'primarii_*.json' -ErrorAction SilentlyContinue)){
  $arr = AsArray (ReadJson $f.FullName)
  foreach ($p in $arr){
    if (-not $p) { continue }
    $units[$p.unit] = $p.unit_id
    $items.Add([pscustomobject]@{
      unit = [string]$p.unit; unit_id = $p.unit_id; name = [string]$p.name
      level = [string]$p.level; uat_id = $p.uat_id; villages = $p.villages
      site = $null; email = $null; phone = $null; verified = $false; found_in = $null
    })
  }
}
Write-Host ("реестр: {0} примэрий, {1} админ-единиц" -f $items.Count, $units.Count) -ForegroundColor DarkGray

# --------------------------------------------- подтягиваем официальные сайты примэрий
$byKey = @{}
foreach ($it in $items){ $k = PrimKey $it.unit $it.name; if (-not $byKey.ContainsKey($k)) { $byKey[$k] = $it } }
$sitesAdded = 0; $sitesMatched = 0
# файлы сайтов: ручные подтверждения идут ПЕРВЫМИ (они проверены человеком),
# дальше — автоматический обход в алфавитном порядке. sites_unmatched.json не читаем.
$siteFiles = @(Get-ChildItem -Path $parts -Filter 'sites_*.json' -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -ne 'sites_unmatched.json' })
$siteFiles = @($siteFiles | Where-Object { $_.Name -eq 'sites_manual.json' }) +
             @($siteFiles | Where-Object { $_.Name -ne 'sites_manual.json' } | Sort-Object Name)
foreach ($f in $siteFiles){
  $arr = AsArray (ReadJson $f.FullName)
  foreach ($s in $arr){
    if (-not $s -or -not $s.site) { continue }
    $site = ([string]$s.site).Trim()
    if ($site -notmatch '^https?://') { $site = 'http://' + $site }
    $k = PrimKey ([string]$s.unit) ([string]$s.name)
    if ($byKey.ContainsKey($k)){
      $it = $byKey[$k]
      if (-not $it.site){
        $it.site = $site; $it.email = [string]$s.email; $it.phone = [string]$s.phone
        $it.verified = [bool]$s.verified; $it.found_in = [string]$s.found_in
        $sitesMatched++
      }
    } else {
      $items.Add([pscustomobject]@{
        unit = [string]$s.unit; unit_id = $null; name = [string]$s.name
        level = $(if ($s.level) { [string]$s.level } else { 'oras' })
        uat_id = $null; villages = $null
        site = $site; email = [string]$s.email; phone = [string]$s.phone
        verified = [bool]$s.verified; found_in = [string]$s.found_in })
      $byKey[$k] = $items[$items.Count-1]; $sitesAdded++
    }
  }
}
$withSite = @($items | Where-Object { $_.site })
$meta = [pscustomobject]@{
  generated  = (Get-Date -Format 'yyyy-MM-dd HH:mm')
  total      = $items.Count
  with_site  = $withSite.Count
  units      = (@($units.Keys) | Sort-Object).Count
  note       = 'структура реестра: primarii.casata.md / primarii.md; сайты — только подтверждённые в открытых источниках'
}
$sz = WriteJs (Join-Path $out 'primarii.js') 'PRIMARII' ([pscustomobject]@{ meta=$meta; items=$items })
Write-Host ("primarii.js  {0,7:N0} байт · сайтов {1} (совпадений {2}, новых строк {3})" -f $sz,$withSite.Count,$sitesMatched,$sitesAdded) -ForegroundColor Green

# ------------------------------------------------------------------- ленты новостей
$feedItems = [ordered]@{ WORLD=@(); MD=@() }
$feedMeta  = [ordered]@{ updated=$null; world=$null; md=$null }
foreach ($p in @(@('news_world.json','WORLD'), @('news_md.json','MD'))){
  $o = ReadJson (Join-Path $parts $p[0])
  if (-not $o) { Write-Warning ("нет ленты: " + $p[0]); continue }
  $arr = AsArray $o.items
  $feedItems[$p[1]] = $arr
  $feedMeta[$p[1].ToLower()] = @{ count=$arr.Count; updated=([string]$o.meta.updated) }
  if ($o.meta.updated) { $feedMeta['updated'] = [string]$o.meta.updated }
}
# живые карточки, добавленные update-cache.ps1
$liveW = ReadJson (Join-Path $parts 'news_live_world.json')
$liveM = ReadJson (Join-Path $parts 'news_live_md.json')
if ($liveW) { $feedItems['WORLD'] = @($liveW.items) + @($feedItems['WORLD'])
              $feedMeta['updated'] = [string]$liveW.meta.updated
              if ($liveW.meta.fx) { $feedMeta['fx'] = @($liveW.meta.fx); $feedMeta['fx_date'] = [string]$liveW.meta.fx_date } }
if ($liveM) { $feedItems['MD']    = @($liveM.items) + @($feedItems['MD'])
              $feedMeta['updated'] = [string]$liveM.meta.updated }
if (-not $feedMeta['updated']) { $feedMeta['updated'] = (Get-Date -Format 'yyyy-MM-dd HH:mm') }
foreach ($k in @('WORLD','MD')){
  $seen=@{}; $clean=@()
  foreach ($it in $feedItems[$k]){
    if (-not $it -or -not $it.title) { continue }
    $n = Norm ([string]$it.title)
    $len = $n.Length; if ($len -gt 64) { $len = 64 }
    $key = $n.Substring(0, $len)
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = 1; $clean += $it
  }
  $feedItems[$k] = $clean
}
$sz = WriteJs (Join-Path $out 'feeds.js') 'FEED' ([pscustomobject]@{ meta=$feedMeta; items=$feedItems })
Write-Host ("feeds.js     {0,7:N0} байт · МИР {1} · МОЛДОВА {2}" -f $sz,@($feedItems['WORLD']).Count,@($feedItems['MD']).Count) -ForegroundColor Green

# --------------------------------------------------------------------- справочники
$refMd    = ReadJson (Join-Path $parts 'reference_md.json')
$refWorld = ReadJson (Join-Path $parts 'reference_world.json')
$sz = WriteJs (Join-Path $out 'reference.js') 'REF' ([pscustomobject]@{
  MD = $(if ($refMd) { $refMd } else { @{} }); WORLD = $(if ($refWorld) { $refWorld } else { @{} }) })
Write-Host ("reference.js {0,7:N0} байт" -f $sz) -ForegroundColor Green

# ------------------------------------------------------------------- карта источников
$src = ReadJson (Join-Path $parts 'sources.json')
if (-not $src) { Write-Warning "нет карты источников (sources.json) — «обновить» в портале будет безоружен" }
$sz = WriteJs (Join-Path $out 'sources.js') 'SOURCES' $(if ($src) { $src } else { @{} })
Write-Host ("sources.js   {0,7:N0} байт" -f $sz) -ForegroundColor Green

Write-Host ""
Write-Host "готово. Открой: $Root\index.html" -ForegroundColor Cyan
