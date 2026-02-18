# To run: pwsh ./infra/scripts/export-code.ps1

# ============================================================
# Project Code Dump Script (Monorepo / Chat-friendly)
# ============================================================

$root = (Resolve-Path ".").Path
$outputFile = Join-Path $root "project_dump.txt"

# Remove old dump if it exists
if (Test-Path $outputFile) {
    Remove-Item $outputFile
}

Write-Host "Creating project dump..."

# Helper: exclude noisy folders
function IsExcludedPath($fullName) {
    return ($fullName -match "node_modules|dist|\.git|\.idea|\.vscode|target|build|out")
}

$files = @()

# ------------------------------------------------------------
# 1) Web client files (apps/web)
# ------------------------------------------------------------
if (Test-Path "$root/apps/web") {
    $files += Get-ChildItem -Path "$root/apps/web/src" -Recurse -File -Filter "*.ts" -ErrorAction SilentlyContinue
    $files += Get-ChildItem -Path "$root/apps/web/public" -Recurse -File -Include "*.html","*.css","*.js","*.json","*.svg","*.png","*.jpg","*.jpeg","*.webp" -ErrorAction SilentlyContinue
    $files += Get-ChildItem -Path "$root/apps/web" -File -Include "package.json","tsconfig.json","vite.config.ts","Dockerfile" -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 2) Server files (apps/server) - Java + Maven + config
# ------------------------------------------------------------
if (Test-Path "$root/apps/server") {
    $files += Get-ChildItem -Path "$root/apps/server/src" -Recurse -File -Include `
        "*.java","*.kt","*.xml","*.yml","*.yaml","*.properties","*.sql" -ErrorAction SilentlyContinue

    $files += Get-ChildItem -Path "$root/apps/server" -File -Include `
        "pom.xml","Dockerfile",".dockerignore" -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 3) Infra (docker/nginx/etc.)
# ------------------------------------------------------------
if (Test-Path "$root/infra") {
    $files += Get-ChildItem -Path "$root/infra" -Recurse -File -Include `
        "*.yml","*.yaml","*.conf","*.sh","*.ps1","*.sql",".env","Dockerfile" -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 4) Protocol / packages
# ------------------------------------------------------------
if (Test-Path "$root/packages") {
    $files += Get-ChildItem -Path "$root/packages" -Recurse -File -Include `
        "*.md","*.json","*.yaml","*.yml","*.ts","*.js" -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 5) Docs (*.md) (already useful)
# ------------------------------------------------------------
if (Test-Path "$root/docs") {
    $files += Get-ChildItem -Path "$root/docs" -Recurse -File -Filter "*.md" -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 6) Important root configuration files
# ------------------------------------------------------------
$importantFiles = @(
    "package.json",
    "package-lock.json",
    ".gitignore",
    "docker-compose.yml"
)

foreach ($name in $importantFiles) {
    $path = Join-Path $root $name
    if (Test-Path -LiteralPath $path) {
        $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
        if ($null -ne $item) {
            $files += $item
        }
    }
}

# Remove excluded + duplicates and sort
$files = $files |
    Where-Object { $_ -ne $null } |
    Where-Object { -not (IsExcludedPath $_.FullName) } |
    Sort-Object FullName -Unique

# ------------------------------------------------------------
# Write header
# ------------------------------------------------------------
Add-Content $outputFile "PROJECT CODE DUMP"
Add-Content $outputFile "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Content $outputFile "Root: $root"
Add-Content $outputFile ""

# ------------------------------------------------------------
# Write files
# ------------------------------------------------------------
foreach ($file in $files) {

    $relativePath = $file.FullName.Substring($root.Length).TrimStart('\','/')

    Add-Content $outputFile "============================================================"
    Add-Content $outputFile "FILE: $relativePath"
    Add-Content $outputFile "============================================================"
    Add-Content $outputFile ""

    try {
        Get-Content -LiteralPath $file.FullName |
            Add-Content $outputFile
    }
    catch {
        Add-Content $outputFile "[Could not read file]"
    }

    Add-Content $outputFile ""
    Add-Content $outputFile ""
}

Write-Host "Done! Output written to $outputFile"
