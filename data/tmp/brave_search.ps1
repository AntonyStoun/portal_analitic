# Search Brave HTML SERPs for official primarie websites (mun. Chisinau, Balti, Bender zone)
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\user\Documents\Strata\Workspace\portal-analitic\data\tmp'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

$targets = @(
  @{k='sector-centru';   qs=@('primaria sectorului Centru Chisinau site oficial','"Primăria Sectorului Centru" site')},
  @{k='sector-buiucani'; qs=@('primaria sectorului Buiucani site oficial','"Primăria Sectorului Buiucani"')},
  @{k='sector-ciocana';  qs=@('primaria sectorului Ciocana site oficial','"Primăria Sectorului Ciocana"')},
  @{k='sector-riscani';  qs=@('primaria sectorului Riscani Chisinau site oficial','"Primăria Sectorului Râșcani" site')},
  @{k='sector-botanica'; qs=@('primaria sectorului Botanica site oficial','"Primăria Sectorului Botanica"')},
  @{k='sector-cimpina';  qs=@('primaria sectorului Cimpa site oficial','"Primăria Sectorului Cîmpina"')},
  @{k='chisinau';        qs=@('primaria municipiului Chisinau site oficial chisinau.md','Consiliul Municipal Chisinau site cms.md')},
  @{k='oras-codru';      qs=@('primaria orasului Codru Chisinau site oficial','Primăria orașului Codru site')},
  @{k='oras-cricova';    qs=@('primaria orasului Cricova site oficial','Primăria orașului Cricova site oficial')},
  @{k='oras-durlesti';   qs=@('primaria orasului Durlesti site oficial','Primăria orașului Durlești site')},
  @{k='oras-singera';    qs=@('primaria orasului Singera Chisinau site oficial','Primăria orașului Sîngera site')},
  @{k='oras-vatra';      qs=@('primaria orasului Vatra Chisinau site oficial','Primăria orașului Vatra site')},
  @{k='oras-vadul-lui-voda'; qs=@('primaria orasului Vadul lui Voda site oficial','Primăria orașului Vadul lui Vodă site')},
  @{k='sat-ghidighici';  qs=@('primaria orasului Ghidighici site oficial','Primăria Ghidighici site')},
  @{k='comuna-colonita'; qs=@('primaria satului Colonita Chisinau site oficial','Primăria Colonița site')},
  @{k='sat-condrita';    qs=@('primaria satului Condrita Chisinau site oficial','Primăria Condrița site')},
  @{k='comuna-bacioi';   qs=@('primaria comunei Bacioi Chisinau site oficial','Primăria comunei Băcioi site')},
  @{k='comuna-bubuieci'; qs=@('primaria comunei Bubuieci site oficial','Primăria comunei Bubuieci site')},
  @{k='comuna-budesti';  qs=@('primaria comunei Budesti Chisinau site oficial','Primăria comunei Budești site')},
  @{k='comuna-ciorescu'; qs=@('primaria comunei Ciorescu site oficial','Primăria comunei Ciorescu site')},
  @{k='comuna-cruzesti'; qs=@('primaria comunei Cruzesti Chisinau site oficial','Primăria comunei Cruzești site')},
  @{k='comuna-gratiesti';qs=@('primaria comunei Gratiesti site oficial','Primăria comunei Grătiești site')},
  @{k='comuna-stauceni'; qs=@('primaria comunei Stauceni site oficial','Primăria comunei Stăuceni site')},
  @{k='comuna-tohatin';  qs=@('primaria comunei Tohatin site oficial','Primăria comunei Tohatin site')},
  @{k='comuna-truseni';  qs=@('primaria comunei Truseni Chisinau site oficial','Primăria comunei Trușeni site')},
  @{k='mun-balti';       qs=@('primaria municipiului Balti site oficial','Consiliul municipal Bălți site oficial')},
  @{k='sat-elizaveta';   qs=@('primaria satului Elizaveta Balti site oficial','Primăria Elizaveta Moldova site')},
  @{k='sat-sadovoe';     qs=@('primaria satului Sadovoe Balti site oficial','Primăria Sadovoe Moldova site')},
  @{k='mun-bender';      qs=@('primaria municipiului Bender site oficial','Primăria Bender Tighina site oficial contact')},
  @{k='sat-proteagailovca'; qs=@('primaria satului Proteagailovca site oficial','Primăria Proteagailovca Copaui site')},
  @{k='sat-parcani';     qs=@('primaria satului Parcani Bender site oficial','Primăria Parcani Gîdireni site')},
  @{k='sat-sitceni';     qs=@('primaria satului Sitceni site oficial','Primăria Sîtceni Bender site')},
  @{k='oras-balti-ucg';  qs=@('primariamea.md lista primariilor','site:primariamea.md Chisinau')},
  @{k='oras-codru-2';    qs=@('codru.md primăria','orasul Codru site oficial primaria')}
)

$rows = New-Object System.Collections.Generic.List[object]
foreach ($t in $targets) {
  foreach ($q in $t.qs) {
    $enc = [uri]::EscapeDataString($q)
    $url = "https://search.brave.com/search?q=$enc&source=web"
    $raw = curl.exe -sS -k -L -m 30 -A $ua -H 'Accept: text/html' -H 'Accept-Language: en-US,en;q=0.9' $url 2>$null
    $html = ($raw -join "`n")
    $safe = ($t.k + '__' + [math]::Round((Get-RandomSeed 2>$null)))
    Start-Sleep -Milliseconds 1200
    if ($html.Length -lt 500) { $rows.Add([pscustomobject]@{k=$t.k; q=$q; url=$url; kind='EMPTY'; val=''}); continue }
    # anchor hrefs
    $seen = @{}
    foreach ($m in [regex]::Matches($html, '<a[^>]+href="(https?://[^"]+)"')) {
      $u = $m.Groups[1].Value
      if ($u -match 'search\.brave\.com|brave\.com|/privacy|\.css|\.js|duckduckgo|google\.com|bing\.com') { continue }
      if (-not $seen.ContainsKey($u)) { $seen[$u] = $true; $rows.Add([pscustomobject]@{k=$t.k; q=$q; url=$url; kind='href'; val=$u}) }
    }
    # domains mentioned in visible text
    $text = ($html -replace '<script[\s\S]*?</script>','') -replace '<style[\s\S]*?</style>','' -replace '<[^>]+>',' '
    foreach ($m in [regex]::Matches($text, '(?i)\b((?:https?://)?[a-z0-9][a-z0-9\-\.]{2,60}\.(?:md|com|ro|eu|org|info|net)(?:/[^\s<"]{0,60})?)')) {
      $v = $m.Groups[1].Value
      if (-not $seen.ContainsKey('T'+$v)) { $seen['T'+$v] = $true; $rows.Add([pscustomobject]@{k=$t.k; q=$q; url=$url; kind='text'; val=$v}) }
    }
  }
  "done: $($t.k)"
}
$rows | ConvertTo-Json -Depth 4 | Out-File -FilePath (Join-Path $dir 'serp_results.json') -Encoding UTF8
"TOTAL ROWS: $($rows.Count)"
