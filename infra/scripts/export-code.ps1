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

# Helper: exclude noisy folders and generated/binary files
function IsExcludedPath($fullName) {
    return ($fullName -match "(^|[\\/])(node_modules|dist|\.git|\.idea|\.vscode|target|build|out|coverage|tmp|\.next)([\\/]|$)")
}

function IsExcludedFile($file) {
    $name = $file.Name
    $extension = $file.Extension.ToLowerInvariant()

    if ($name -eq "project_dump.txt") { return $true }

    $excludedExtensions = @(
        ".class", ".jar", ".war", ".ear",
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
        ".zip", ".tar", ".gz", ".7z",
        ".exe", ".dll", ".so", ".dylib",
        ".db", ".sqlite", ".sqlite3",
        ".lock"
    )

    return $excludedExtensions -contains $extension
}

function GetProjectFiles($basePath, $extensions) {
    if (-not (Test-Path $basePath)) {
        return @()
    }

    return Get-ChildItem -Path $basePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { -not (IsExcludedPath $_.FullName) } |
        Where-Object { -not (IsExcludedFile $_) } |
        Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }
}

function GetNamedFiles($basePath, $names) {
    if (-not (Test-Path $basePath)) {
        return @()
    }

    return Get-ChildItem -Path $basePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { -not (IsExcludedPath $_.FullName) } |
        Where-Object { -not (IsExcludedFile $_) } |
        Where-Object { $names -contains $_.Name }
}

$files = @()

$codeExtensions = @(
    ".md",
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".java", ".kt", ".kts",
    ".html", ".css", ".scss",
    ".json",
    ".xml",
    ".yml", ".yaml",
    ".properties",
    ".sql",
    ".sh", ".ps1", ".bat",
    ".env", ".example"
)

$importantFileNames = @(
    "package.json",
    "package-lock.json",
    "pom.xml",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".dockerignore",
    ".gitignore",
    ".env",
    ".env.example",
    "README.md"
)

# ------------------------------------------------------------
# 1) Web client files (apps/web)
# ------------------------------------------------------------
if (Test-Path "$root/apps/web") {
    $files += GetProjectFiles "$root/apps/web/src" $codeExtensions
    $files += GetProjectFiles "$root/apps/web/public" $codeExtensions
    $files += GetNamedFiles "$root/apps/web" $importantFileNames
}

# ------------------------------------------------------------
# 2) Server files (apps/server) - Java + Maven + config
# ------------------------------------------------------------
if (Test-Path "$root/apps/server") {
    $files += GetProjectFiles "$root/apps/server/src" $codeExtensions
    $files += GetNamedFiles "$root/apps/server" $importantFileNames
}

# ------------------------------------------------------------
# 3) Infra (docker/nginx/etc.)
# ------------------------------------------------------------
if (Test-Path "$root/infra") {
    $files += GetProjectFiles "$root/infra" ($codeExtensions + @(".conf"))
    $files += GetNamedFiles "$root/infra" $importantFileNames
}

# ------------------------------------------------------------
# 4) Protocol / packages
# ------------------------------------------------------------
if (Test-Path "$root/packages") {
    $files += GetProjectFiles "$root/packages" $codeExtensions
}

# ------------------------------------------------------------
# 5) Docs + root files
# ------------------------------------------------------------
if (Test-Path "$root/docs") {
    $files += GetProjectFiles "$root/docs" $codeExtensions
}

# ------------------------------------------------------------
# 6) Important root configuration files
# ------------------------------------------------------------
foreach ($name in $importantFileNames) {
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
    Where-Object { -not (IsExcludedFile $_) } |
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
