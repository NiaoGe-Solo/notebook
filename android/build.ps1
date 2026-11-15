param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$AndroidSdk = $env:ANDROID_HOME
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Split-Path -Parent $ProjectRoot
$BuildRoot = Join-Path $ProjectRoot "build"
$AssetsRoot = Join-Path $ProjectRoot "assets"
$BuildTools = Join-Path $AndroidSdk "build-tools\35.0.0"
$AndroidJar = Join-Path $AndroidSdk "platforms\android-35\android.jar"

if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\javac.exe"))) {
    throw "Set JAVA_HOME to a JDK 17 installation."
}
if (-not (Test-Path (Join-Path $BuildTools "aapt2.exe"))) {
    throw "Android build-tools 35.0.0 was not found under $AndroidSdk."
}

$env:JAVA_HOME = $JavaHome
$env:PATH = "$(Join-Path $JavaHome "bin");$env:PATH"

New-Item -ItemType Directory -Path $AssetsRoot,$BuildRoot -Force | Out-Null
Get-ChildItem $AssetsRoot -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item (Join-Path $WebRoot "index.html"),(Join-Path $WebRoot "styles.css"),(Join-Path $WebRoot "tokens.css"),(Join-Path $WebRoot "base.css"),(Join-Path $WebRoot "app.js"),(Join-Path $WebRoot "media.js"),(Join-Path $WebRoot "manifest.webmanifest"),(Join-Path $WebRoot "icon.svg"),(Join-Path $WebRoot "icon-192.png"),(Join-Path $WebRoot "icon-512.png") $AssetsRoot

$CompiledResources = Join-Path $BuildRoot "compiled.zip"
$GeneratedSources = Join-Path $BuildRoot "generated"
$Classes = Join-Path $BuildRoot "classes"
$Dex = Join-Path $BuildRoot "dex"
$Unsigned = Join-Path $BuildRoot "unsigned.apk"
$Aligned = Join-Path $BuildRoot "aligned.apk"
$Final = Join-Path $WebRoot "xiaoye-notepad.apk"
$Keystore = Join-Path $BuildRoot "debug.keystore"

New-Item -ItemType Directory -Path $GeneratedSources,$Classes,$Dex -Force | Out-Null

& (Join-Path $BuildTools "aapt2.exe") compile --dir (Join-Path $ProjectRoot "res") -o $CompiledResources
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed." }
& (Join-Path $BuildTools "aapt2.exe") link -o $Unsigned -I $AndroidJar --manifest (Join-Path $ProjectRoot "AndroidManifest.xml") --java $GeneratedSources $CompiledResources
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed." }

$JavaSources = @(
    (Join-Path $ProjectRoot "src\com\xiaoye\notebook\MainActivity.java"),
    (Join-Path $GeneratedSources "com\xiaoye\notebook\R.java")
)
& (Join-Path $JavaHome "bin\javac.exe") -encoding UTF-8 -source 8 -target 8 -classpath $AndroidJar -d $Classes $JavaSources
if ($LASTEXITCODE -ne 0) { throw "javac failed." }

$ClassFiles = Get-ChildItem $Classes -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& (Join-Path $BuildTools "d8.bat") --lib $AndroidJar --min-api 23 --output $Dex $ClassFiles
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $Dex "classes.dex"))) { throw "d8 failed." }

& (Join-Path $JavaHome "bin\jar.exe") uf $Unsigned -C $Dex "classes.dex" -C $ProjectRoot "assets"
if ($LASTEXITCODE -ne 0) { throw "jar failed." }

& (Join-Path $BuildTools "zipalign.exe") -f 4 $Unsigned $Aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed." }

if (-not (Test-Path $Keystore)) {
    & (Join-Path $JavaHome "bin\keytool.exe") -genkeypair -keystore $Keystore -storepass android -keypass android -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
    if ($LASTEXITCODE -ne 0) { throw "keytool failed." }
}

& (Join-Path $BuildTools "apksigner.bat") sign --ks $Keystore --ks-pass pass:android --key-pass pass:android --out $Final $Aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed." }
& (Join-Path $BuildTools "apksigner.bat") verify --verbose $Final
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed." }

Write-Output "APK: $Final"
