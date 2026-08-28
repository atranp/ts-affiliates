"""
Repairs the `slicewp_settings` option on the Local WordPress copy.

The prod -> Local clone ran a plain find-and-replace over the database, which
rewrote `true-sciences.com` to `true-sciences-04.local` inside a PHP-serialized
blob without updating the byte-length prefixes that precede each string. PHP's
unserialize() then rejects the whole option, so `slicewp_get_setting()` returns
its default for all 53 settings — including `affiliate_keyword` and
`friendly_affiliate_url`, which is why referral URLs came back as `/?=120`.

Recomputes every declared length from the bytes actually present. Content is
never altered, only the length prefixes. Local only: production was never
search-replaced and does not have this defect.

Usage:
    python3 scripts/fix-local-slicewp-settings.py            # report only
    python3 scripts/fix-local-slicewp-settings.py --write    # repair
"""

import re
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
MYSQL = HOME / (
    "Library/Application Support/Local/lightning-services"
    "/mysql-8.4.0/bin/darwin-arm64/bin/mysql"
)
SOCKET = HOME / "Library/Application Support/Local/run/CSuFeBXEl/mysql/mysqld.sock"
DATABASE = "local"
OPTION = "slicewp_settings"

# What a serialized value looks like at the start of a token. Used to confirm a
# candidate string terminator really is one, rather than a `";` inside content.
NEXT_TOKEN = re.compile(rb'^(?:s:\d+:"|i:-?\d+;|d:[^;]+;|b:[01];|a:\d+:\{|O:\d+:"|N;|\}|$)')


def mysql(sql: str, raw: bool = False) -> bytes:
    args = [str(MYSQL), "-u", "root", "-proot", "-S", str(SOCKET), "-N", DATABASE]
    if raw:
        args.append("--raw")
    result = subprocess.run(
        args + ["-e", sql], capture_output=True, check=True
    )
    return result.stdout.rstrip(b"\n")


def repair(data: bytes) -> tuple[bytes, int]:
    out = bytearray()
    i = 0
    fixed = 0

    while i < len(data):
        if data[i : i + 2] != b"s:":
            out.append(data[i])
            i += 1
            continue

        colon = data.index(b":", i + 2)
        declared = int(data[i + 2 : colon])
        start = colon + 2  # skip the `:` and the opening quote

        if data[colon + 1 : colon + 2] != b'"':
            out.append(data[i])
            i += 1
            continue

        # Trust the declared length when it already lands on a terminator.
        if data[start + declared : start + declared + 2] == b'";' and NEXT_TOKEN.match(
            data[start + declared + 2 : start + declared + 42]
        ):
            actual = declared
        else:
            actual = None
            search = start
            while True:
                candidate = data.find(b'";', search)
                if candidate == -1:
                    raise SystemExit(f"unterminated string at byte {i}")
                if NEXT_TOKEN.match(data[candidate + 2 : candidate + 44]):
                    actual = candidate - start
                    break
                search = candidate + 2

            fixed += 1
            print(f"  s:{declared} -> s:{actual}  {data[start:start + 54].decode('utf8', 'replace')!r}")

        out += b"s:%d:\"" % actual
        out += data[start : start + actual]
        out += b'";'
        i = start + actual + 2

    return bytes(out), fixed


def main() -> None:
    write = "--write" in sys.argv

    raw = mysql(f"SELECT option_value FROM zww_options WHERE option_name='{OPTION}';", raw=True)
    print(f"option `{OPTION}`: {len(raw)} bytes")

    print("\nlength prefixes that disagree with their content:")
    fixed_blob, fixed = repair(raw)

    if fixed == 0:
        print("  none — the option is already valid")
        return

    print(f"\n{fixed} prefix(es) corrected, {len(raw)} -> {len(fixed_blob)} bytes")

    # Re-run the checker over the result; it must find nothing left to fix.
    _, remaining = repair(fixed_blob)
    if remaining != 0:
        raise SystemExit(f"repair incomplete: {remaining} still wrong")
    print("verified: the repaired blob parses cleanly")

    if not write:
        print("\nreport only. Re-run with --write to apply.")
        return

    backup = Path("/tmp/slicewp_settings.before.txt")
    backup.write_bytes(raw)
    print(f"\noriginal saved to {backup}")

    escaped = fixed_blob.decode("utf8").replace("\\", "\\\\").replace("'", "\\'")
    mysql(f"UPDATE zww_options SET option_value='{escaped}' WHERE option_name='{OPTION}';")
    print("written")


if __name__ == "__main__":
    main()
