"""
Antigravity History Manager — Repository Hygiene Scanner
Scans codebase for personal paths, usernames, tokens, and hardcoded absolute paths.
"""

import os
import re

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

IGNORE_DIRS = {
    "node_modules", "target", ".git", "build", "dist", "tmp", "EBWebView", ".turbo"
}
IGNORE_EXTS = {
    ".png", ".ico", ".icns", ".woff2", ".woff", ".ttf", ".exe", ".dll", ".zip"
}

PATTERNS = [
    ("User path 'C:\\Users\\'", re.compile(r'C:\\Users\\[a-zA-Z0-9_-]+', re.IGNORECASE)),
    ("Hardcoded drive root", re.compile(r'([A-Z]:\\[a-zA-Z0-9_\-\\]+)', re.IGNORECASE)),
    ("Raw UUID in code", re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.IGNORECASE)),
    ("CSRF Token secret", re.compile(r'csrf[_-]?token\s*[:=]\s*["\'][a-zA-Z0-9]{16,}["\']', re.IGNORECASE)),
]

current_user = os.environ.get("USERNAME", "")
if current_user and len(current_user) > 2:
    PATTERNS.append(("Current Username", re.compile(rf'\b{re.escape(current_user)}\b', re.IGNORECASE)))

findings = []

for root, dirs, files in os.walk(APP_DIR):
    dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext in IGNORE_EXTS:
            continue
        filepath = os.path.join(root, f)
        rel_path = os.path.relpath(filepath, APP_DIR)
        
        # Skip this scanner script itself
        if rel_path.endswith("scan_secrets.py"):
            continue

        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as fp:
                lines = fp.readlines()
        except Exception as e:
            continue

        for idx, line in enumerate(lines, 1):
            for label, pattern in PATTERNS:
                # Allow test scripts or scripts where D:\AGHistory_Tauri is deliberately used for local dev environment
                # But check src/ and src-tauri/src/ strictly!
                m = pattern.search(line)
                if m:
                    findings.append({
                        "file": rel_path,
                        "line": idx,
                        "label": label,
                        "match": m.group(0),
                        "snippet": line.strip()
                    })

print(f"=== Scan Report: {len(findings)} Potential Findings ===")
for item in findings:
    print(f"[{item['label']}] {item['file']}:{item['line']}")
    print(f"   Match: {item['match']}")
    print(f"   Code:  {item['snippet'][:120]}")
    print()

if not findings:
    print("ALL CLEAN: No personal data or paths detected in repository files!")
