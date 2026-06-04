#!/usr/bin/env python3
"""Collect PR feedback for the current branch PR or an explicit PR reference."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


QUESTION_PREFIXES = {
    "why",
    "what",
    "how",
    "can",
    "could",
    "would",
    "is",
    "are",
    "do",
    "does",
    "did",
    "should",
}


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def run_json(cmd: list[str]) -> Any:
    proc = run(cmd)
    if not proc.stdout.strip():
        return None
    return json.loads(proc.stdout)


def flatten_pages(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        if payload and isinstance(payload[0], list):
            merged: list[dict[str, Any]] = []
            for page in payload:
                merged.extend(page)
            return merged
        return payload
    raise ValueError("Unexpected paginated payload format")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def get_current_branch() -> str:
    proc = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    return proc.stdout.strip()


def get_repo(explicit_repo: str | None) -> str:
    if explicit_repo:
        return explicit_repo
    proc = run(["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])
    repo = proc.stdout.strip()
    if not repo:
        raise RuntimeError("Could not determine repository via gh repo view.")
    return repo


def get_pr_number(branch: str, explicit_pr: int | None) -> int:
    if explicit_pr is not None:
        return explicit_pr

    try:
        proc = run(["gh", "pr", "view", "--json", "number", "--jq", ".number"])
        value = proc.stdout.strip()
        if value:
            return int(value)
    except Exception:
        pass

    proc = run(
        [
            "gh",
            "pr",
            "list",
            "--head",
            branch,
            "--state",
            "open",
            "--json",
            "number",
            "--jq",
            ".[0].number",
        ]
    )
    value = proc.stdout.strip()
    if not value:
        raise RuntimeError(f"Could not find an open PR for branch '{branch}'.")
    return int(value)


def run_gh_json_comments(pr_number: int, repo: str) -> tuple[Any, str | None, str | None]:
    attempts: list[tuple[str, list[str]]] = []
    errors: list[str] = []

    if shutil.which("gh-json-comments"):
        attempts.append(("gh-json-comments", ["gh-json-comments"]))

    alias_probe = subprocess.run(
        ["bash", "-ic", "type gh-json-comments >/dev/null 2>&1"],
        check=False,
        text=True,
        capture_output=True,
    )
    if alias_probe.returncode == 0:
        attempts.append(("bash -ic gh-json-comments", ["bash", "-ic", "gh-json-comments"]))

    attempts.append(
        (
            "gh pr-review review view --unresolved --not_outdated "
            f"--include-comment-node-id --pr {pr_number} -R {repo}",
            [
                "gh",
                "pr-review",
                "review",
                "view",
                "--unresolved",
                "--not_outdated",
                "--include-comment-node-id",
                "--pr",
                str(pr_number),
                "-R",
                repo,
            ],
        )
    )

    for command_used, cmd in attempts:
        proc = subprocess.run(cmd, check=False, text=True, capture_output=True)
        if proc.returncode != 0:
            detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
            errors.append(f"{command_used}: {detail}")
            continue

        output = proc.stdout
        if not output.strip():
            return None, command_used, None

        try:
            data: Any = json.loads(output)
        except json.JSONDecodeError:
            data = {"_non_json_output": output}
        return data, command_used, None

    error_message = "; ".join(errors) if errors else None
    return None, None, error_message


def gh_api_list(endpoint: str) -> list[dict[str, Any]]:
    payload = run_json(["gh", "api", "--paginate", "--slurp", endpoint])
    return flatten_pages(payload)


def is_question_candidate(text: str) -> bool:
    body = text.strip().lower()
    if not body:
        return False
    if "?" in body:
        return True
    first = re.sub(r"^[^a-z]+", "", body).split(" ", 1)[0]
    return first in QUESTION_PREFIXES


def normalize_issue_comment(item: dict[str, Any]) -> dict[str, Any]:
    body = item.get("body") or ""
    return {
        "comment_key": f"issue:{item.get('id')}",
        "source": "issue_comment",
        "github_id": item.get("id"),
        "author": (item.get("user") or {}).get("login"),
        "body": body,
        "url": item.get("html_url"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "path": None,
        "line": None,
        "in_reply_to_id": None,
        "review_id": None,
        "question_candidate": is_question_candidate(body),
    }


def normalize_review_comment(item: dict[str, Any]) -> dict[str, Any]:
    body = item.get("body") or ""
    return {
        "comment_key": f"inline:{item.get('id')}",
        "source": "inline_review_comment",
        "github_id": item.get("id"),
        "author": (item.get("user") or {}).get("login"),
        "body": body,
        "url": item.get("html_url"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "path": item.get("path"),
        "line": item.get("line"),
        "start_line": item.get("start_line"),
        "side": item.get("side"),
        "start_side": item.get("start_side"),
        "subject_type": item.get("subject_type"),
        "in_reply_to_id": item.get("in_reply_to_id"),
        "review_id": item.get("pull_request_review_id"),
        "diff_hunk": item.get("diff_hunk"),
        "question_candidate": is_question_candidate(body),
    }


def normalize_review_body_comment(item: dict[str, Any]) -> dict[str, Any] | None:
    body = (item.get("body") or "").strip()
    if not body:
        return None
    return {
        "comment_key": f"review:{item.get('id')}",
        "source": "review_body_comment",
        "github_id": item.get("id"),
        "author": (item.get("user") or {}).get("login"),
        "body": body,
        "url": item.get("html_url"),
        "created_at": item.get("submitted_at"),
        "updated_at": item.get("submitted_at"),
        "path": None,
        "line": None,
        "in_reply_to_id": None,
        "review_id": item.get("id"),
        "state": item.get("state"),
        "question_candidate": is_question_candidate(body),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Collect PR comments and inline comments for the current branch PR or an explicit PR."
    )
    parser.add_argument("--out-dir", default="tmp/pr-feedback", help="Output directory")
    parser.add_argument("--repo", default=None, help="Explicit owner/repo (optional)")
    parser.add_argument("--pr", type=int, default=None, help="Explicit PR number (optional)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate local setup and write summary without API calls",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    raw_dir = out_dir / "raw"
    ensure_dir(out_dir)
    ensure_dir(raw_dir)

    summary: dict[str, Any] = {
        "status": "ok",
        "branch": None,
        "repo": None,
        "pr_number": None,
        "counts": {},
        "gh_json_comments_command": None,
        "gh_json_comments_error": None,
    }

    branch = get_current_branch()
    summary["branch"] = branch

    if branch in {"main", "master"} and args.pr is None:
        summary["status"] = "skipped_main_or_master"
        write_json(out_dir / "summary.json", summary)
        write_json(out_dir / "comments.json", [])
        print(f"Skipping: current branch is '{branch}'.")
        return 0

    if args.dry_run:
        summary["status"] = "dry_run"
        write_json(out_dir / "summary.json", summary)
        write_json(out_dir / "comments.json", [])
        print("Dry run complete.")
        return 0

    repo = get_repo(args.repo)
    pr_number = get_pr_number(branch, args.pr)
    summary["repo"] = repo
    summary["pr_number"] = pr_number

    gh_json_comments_raw, gh_json_command, gh_json_error = run_gh_json_comments(pr_number, repo)
    summary["gh_json_comments_command"] = gh_json_command
    summary["gh_json_comments_error"] = gh_json_error
    write_json(out_dir / "raw" / "gh_json_comments.json", gh_json_comments_raw)

    issue_comments = gh_api_list(f"/repos/{repo}/issues/{pr_number}/comments?per_page=100")
    inline_comments = gh_api_list(f"/repos/{repo}/pulls/{pr_number}/comments?per_page=100")
    reviews = gh_api_list(f"/repos/{repo}/pulls/{pr_number}/reviews?per_page=100")

    write_json(raw_dir / "issue_comments.json", issue_comments)
    write_json(raw_dir / "inline_comments.json", inline_comments)
    write_json(raw_dir / "reviews.json", reviews)

    comments: list[dict[str, Any]] = []
    comments.extend(normalize_issue_comment(item) for item in issue_comments)
    comments.extend(normalize_review_comment(item) for item in inline_comments)
    for item in reviews:
        normalized = normalize_review_body_comment(item)
        if normalized is not None:
            comments.append(normalized)

    comments.sort(key=lambda item: (item.get("created_at") or "", item["comment_key"]))
    write_json(out_dir / "comments.json", comments)

    summary["counts"] = {
        "issue_comments": len(issue_comments),
        "inline_comments": len(inline_comments),
        "review_body_comments": len([r for r in reviews if (r.get("body") or "").strip()]),
        "normalized_total": len(comments),
    }
    write_json(out_dir / "summary.json", summary)

    print(
        "Collected PR feedback:",
        f"branch={branch}",
        f"pr={pr_number}",
        f"total={summary['counts']['normalized_total']}",
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        if exc.stderr:
            print(exc.stderr.strip(), file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        raise SystemExit(exc.returncode)
    except Exception as exc:  # pragma: no cover - terminal error path
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
