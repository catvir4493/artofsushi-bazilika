# Letölti a fotókat a régi oldalról az images\ mappába, hogy az új oldal ne függjön tőle.
# Futtatás: jobb klikk -> "Run with PowerShell", vagy:  powershell -ExecutionPolicy Bypass -File download-images.ps1
$base = "https://artofsushi.hu/istvan/wp-content/uploads/2025/10/"
$files = @("ART02922.jpg","ART02933.jpg","ART02955.jpg","ART02966.jpg","ART02977.jpg","ART02988.jpg",
           "1-3.jpg","1-4.jpg","2-1.jpg","2-2.jpg","2-3.jpg","2-4.jpg","2-5.jpg","2-6.jpg","2-7.jpg","2-8.jpg")
$dir = Join-Path $PSScriptRoot "images"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in $files) {
  $out = Join-Path $dir $f
  try { Invoke-WebRequest -Uri ($base + $f) -OutFile $out -UseBasicParsing; Write-Host "OK  $f" }
  catch { Write-Host "HIBA $f : $($_.Exception.Message)" }
}
Write-Host "Kesz."
