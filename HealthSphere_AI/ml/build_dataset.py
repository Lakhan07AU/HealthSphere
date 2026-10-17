"""Build a de-identified contrastive dataset for lab-report retrieval.

Source data: ONLY ml/data/analytes.json (test names + aliases exported from
the backend) plus hand-written templates below. No patient records, real or
otherwise, are used or needed. Every value/unit/range is synthetic and the
files are labeled as such.

Output (JSONL, one JSON object per line):
  train.jsonl / val.jsonl / test.jsonl, each row:
    {"anchor": str, "positive": str, "negative": [...], "kind": str, "synthetic": true}

Row kinds:
  - analyte-passage : "Find the X result ..." -> report passage with X
  - history-query   : "What was my X?"       -> prior record line for X
  - terminology     : "What does X mean?"    -> plain-language explanation

Usage:
  python ml/build_dataset.py [--out ml/data] [--seed 42]
"""
import argparse
import json
import os
import random
import re

HERE = os.path.dirname(os.path.abspath(__file__))

# Clinically distinct look-alikes: must NOT be treated as equivalent.
# (anchor_key, hard_negative_key)
HARD_NEGATIVES = [
    ("ast", "alt"), ("alt", "ast"),          # SGOT vs SGPT
    ("ast", "alp"), ("alp", "alt"),          # transaminases vs phosphatase
    ("bilirubin_total", "bilirubin_direct"),
    ("bilirubin_direct", "bilirubin_indirect"),
    ("albumin", "globulin"), ("globulin", "total_protein"),
    ("hemoglobin", "hematocrit"),
    ("sodium", "potassium"), ("potassium", "sodium"),
    ("ldl", "hdl"), ("hdl", "ldl"),
    ("glucose_fasting", "glucose_random"),
    ("urea", "uric_acid"), ("creatinine", "urea"),
    ("bp_systolic", "bp_diastolic"),
    ("wbc", "platelets"),
]

QUERY_TEMPLATES = [
    "Find the {alias} result in this laboratory report.",
    "Where is the {alias} value in my lab report?",
    "Show me the {alias} reading from this test report.",
]
HISTORY_TEMPLATES = [
    "What was my {name}?",
    "Show my {name} history.",
    "How has my {name} changed over time?",
]
TERM_TEMPLATES = [
    "What does {alias} mean?",
    "Explain {alias} in simple words.",
]

# Report-passage layouts (mirrors the layouts the parser must handle).
LAYOUTS = ["single_line", "method_line", "split_lines"]


def plain_aliases(alias_res):
    """Turn backend alias regexes into plain display strings (best effort)."""
    outs = []
    for a in alias_res:
        s = a
        s = re.sub(r'\(\?:([^)]+)\)\?\\s\*', r'\1 ', s)   # (?:serum )?sodium
        s = re.sub(r'\(\?:([^)]+)\)\?', r'\1', s)
        s = s.replace('\\s+', ' ').replace('\\s*', ' ').replace('\\b', '')
        s = s.replace('\\', '')
        s = re.sub(r'\s+', ' ', s).strip(' |?-')
        # expand "x[ ,]+y" style classes
        m = re.match(r'^(\w+)\[\s*,\s*\]\+(\w+)$', s)
        if m:
            outs.append(f"{m.group(1)} {m.group(2)}")
            outs.append(f"{m.group(1)}, {m.group(2)}")
            continue
        if re.fullmatch(r'[\w\s,/\-\(\)\+]+', s or 'x?') and s:
            outs.append(s)
    # dedupe, prefer shorter human forms
    seen, out = set(), []
    for s in sorted(outs, key=len):
        k = s.lower()
        if k and k not in seen:
            seen.add(k)
            out.append(s)
    return out or []


def synth_value(rng, a):
    lo, hi = a["refLow"], a["refHigh"]
    if hi is None or hi > 900000:
        hi = lo * 1.6 if lo else 100.0
    if lo is None or lo <= 0:
        lo = hi * 0.5
    span = hi - lo
    pick = rng.random()
    if pick < 0.6:
        v = lo + rng.random() * span            # in band
    elif pick < 0.8:
        v = hi + rng.random() * span * 0.3      # high
    else:
        v = max(0.01, lo - rng.random() * span * 0.3)  # low
    return round(v, 2)


def synth_range(rng, a):
    lo, hi = a["refLow"], a["refHigh"]
    style = rng.choice(["dash", "dash", "upto", "lt"])
    if style == "dash" and lo and hi and hi < 900000:
        return f"{lo} - {hi}"
    if style == "upto" or (lo in (0, 0.0, None)):
        return f"UP TO {hi}"
    if hi and hi < 900000 and rng.random() < 0.5:
        return f"< {hi}"
    if lo and hi and hi < 900000:
        return f"{lo} - {hi}"
    return f"< {hi}" if hi and hi < 900000 else ""


def passage(rng, a, alias, layout, noisy=False):
    v = synth_value(rng, a)
    unit = a["unit"]
    ref = synth_range(rng, a)
    if layout == "single_line":
        t = f"{alias} {v} {unit} {ref}".strip()
    elif layout == "method_line":
        t = f"{alias}\nMethod - Automated {v} {unit} {ref}".strip()
    else:
        t = f"{alias}\n{v}\n{unit}\n{ref}".strip()
    if noisy:
        t = ocr_noise(rng, t)
    return t


def ocr_noise(rng, t):
    """Simulate typical scan/phone-photo OCR degradations (labeled synthetic)."""
    if rng.random() < 0.5:
        t = t.replace("0", "O")
    if rng.random() < 0.4:
        t = re.sub(r"\bl\b", "1", t)
    if rng.random() < 0.5:
        t = t.replace("mg/dL", "mg/dl")
    if rng.random() < 0.5:
        t = re.sub(r" +", lambda m: "  " if rng.random() < 0.3 else " ", t)
    if rng.random() < 0.3:
        t = t.replace("Method", "Meth0d")
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "data"))
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--per-analyte", type=int, default=6,
                    help="triplets per analyte per layout family")
    args = ap.parse_args()
    rng = random.Random(args.seed)

    with open(os.path.join(HERE, "data", "analytes.json"), encoding="utf-8") as f:
        analytes = json.load(f)["analytes"]
    by_key = {a["key"]: a for a in analytes}
    for a in analytes:
        a["plain"] = plain_aliases(a["aliases"])
        if not a["plain"]:
            a["plain"] = [a["name"]]

    rows = []
    hard = {k: v for k, v in HARD_NEGATIVES if k in by_key and v in by_key}

    for a in analytes:
        keys = [x["key"] for x in analytes if x["key"] != a["key"]]
        for rep in range(args.per_analyte):
            alias = rng.choice(a["plain"])
            layout = rng.choice(LAYOUTS)
            noisy = rng.random() < 0.35
            pos = passage(rng, a, alias, layout, noisy)
            # negative: same layout, different analyte (hard negative ~40%)
            if rng.random() < 0.4 and a["key"] in hard:
                nk = hard[a["key"]]
            else:
                nk = rng.choice(keys)
            neg = passage(rng, by_key[nk], rng.choice(by_key[nk]["plain"]), layout, rng.random() < 0.3)
            q = rng.choice(QUERY_TEMPLATES).format(alias=alias)
            rows.append({"anchor": q, "positive": pos,
                         "negative": [neg], "kind": "analyte-passage",
                         "key": a["key"], "synthetic": True})
            if rep % 2 == 0:
                hq = rng.choice(HISTORY_TEMPLATES).format(name=a["name"])
                hist = f"{a['name']}: {synth_value(rng, a)} {a['unit']} on 2026-0{rng.randint(1,9)}-1{rng.randint(0,9)}"
                rows.append({"anchor": hq, "positive": hist,
                             "negative": [f"{by_key[nk]['name']}: {synth_value(rng, by_key[nk])} {by_key[nk]['unit']}"],
                             "kind": "history-query", "key": a["key"], "synthetic": True})
            if a.get("explanation") and rep % 3 == 0:
                tq = rng.choice(TERM_TEMPLATES).format(alias=alias)
                expl = f"{a['name']} is {a['explanation']}."
                rows.append({"anchor": tq, "positive": expl,
                             "negative": [f"{by_key[nk]['name']} is {by_key[nk].get('explanation') or 'a measured health indicator'}."],
                             "kind": "terminology", "key": a["key"], "synthetic": True})

    rng.shuffle(rows)
    n = len(rows)
    splits = {
        "train": rows[: int(n * 0.7)],
        "val": rows[int(n * 0.7): int(n * 0.85)],
        "test": rows[int(n * 0.85):],
    }
    os.makedirs(args.out, exist_ok=True)
    for name, part in splits.items():
        p = os.path.join(args.out, f"{name}.jsonl")
        with open(p, "w", encoding="utf-8") as f:
            for r in part:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        kinds = {}
        for r in part:
            kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        print(f"{name}: {len(part)} rows {kinds} -> {p}")
    print("All rows synthetic/de-identified. No patient data involved.")


if __name__ == "__main__":
    main()
