"""Fetch all Hugging Face datasets needed for HealthSphere AI into ONE folder.
Output: backend/data/hf_datasets/<slug>/ + MANIFEST.json
- Small datasets: full download
- Large datasets: capped sample (to keep folder usable for hackathon)
Run: python scripts/fetch_hf_data.py
"""
import json, traceback
from pathlib import Path
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parents[1] / "data" / "hf_datasets"
OUT.mkdir(parents=True, exist_ok=True)

# (hf_id, local_slug, max_rows or None=full, config or None)
TARGETS = [
    ("ekacare/NidaanKosha-100k-V1.0", "nidaankosha-100k", 5000, None),
    ("masalahealthco/open-masala", "open-masala-south-asian-ranges", None, None),
    ("ekacare/BODHI-M", "bodhi-m-snomed-loinc", 2000, None),
    ("GB2024/diabetes", "diabetes-GB2024", None, None),
    ("BenchmarkDatasets/Diabetes_UCI", "diabetes-UCI-70k", 10000, None),
    ("edithatogo/uci-diabetes-130-us-hospitals", "uci-diabetes-130-hospitals", None, None),
    ("MaxPrestige/Synthetic-Diabetes-Dataset", "synthetic-diabetes", None, None),
    ("koushik1212/synthetic-diabetes-hypertension-NCD-screening-WHO-HEARTS", "ncd-screening-WHO-HEARTS", None, None),
    ("xpertsystems/hc01-t2d-sample", "hc01-t2d-500", None, None),
    ("xpertsystems/hc-end-002-sample", "hc-end-002-t2d-500", None, None),
    ("Auric-Grid/E1.L1-Cardiovascular-Heart-Failure-Risk-Prediction", "cardio-HF-50k", 10000, None),
    ("BenchmarkDatasets/MUSIC", "music-cardiac-992", None, None),
    ("mcvskfilho/ML_CVD_CKD", "cvd-ckd-nhanes", None, None),
    ("omid5/usda-fdc-foods-cleaned", "usda-foods-cleaned", 5000, None),
    ("thesisDeath/blood-pathology-lims-environment", "blood-pathology-lims", None, None),
    ("aai530-group6/pmdata", "pmdata-lifestyle", 1000, None),
    ("kmanikandan/atman-healthai-medical-dataset", "atman-medical", None, None),
    ("huzaifa525/Medical_Intelligence_Dataset_76k_2026_Edition", "medical-qa-76k", 10000, None),
    ("xpertsystems/hc-end-004-sample", "thyroid-disorders-500", None, None),
    ("BenchmarkDatasets/thyroid", "thyroid-7k", None, None),
    ("xpertsystems/hc-end-006-sample", "adrenal-disorders-500", None, None),
    ("odeyaaa/Predicting_level_of_mental_well-being_based_on_lifestyle", "mental-wellbeing-400k", 10000, None),
    ("Auric-Grid/E1.S5-SomniMetrics-BHDS-Synthetic-Dataset", "sleep-behavioral-health", None, None),
    ("tarekmasryo/digital-lifestyle-benchmark-dataset", "digital-lifestyle-3500", None, None),
    ("williamTLmiller/nutrimhm-bodyage-normalized", "bodyage-biomarkers", 5000, None),
    ("a1o/kidney", "kidney-dataset", None, None),
]
# fallback IDs if primary fails (owner renames)
FALLBACKS = {
    "koushik1212/synthetic-diabetes-hypertension-NCD-screening-WHO-HEARTS":
        ["electricsheepafrica/synthetic-diabetes-hypertension-NCD-screening-WHO-HEARTS"],
}

def fetch_one(hf_id, slug, max_rows, config):
    from datasets import load_dataset, get_dataset_config_names
    dest = OUT / slug
    dest.mkdir(parents=True, exist_ok=True)
    ids_to_try = [hf_id] + FALLBACKS.get(hf_id, [])
    last_err = None
    for cand in ids_to_try:
        try:
            # resolve config if needed (e.g. NCD has 3 burden configs, open-masala has configs)
            cfg = config
            if cfg is None:
                try:
                    cfgs = get_dataset_config_names(cand)
                    # prefer meaningful defaults
                    if cfgs and len(cfgs) > 1:
                        # NCD screening: fetch all configs separately below
                        if "ncd" in slug.lower() or "hearts" in cand.lower():
                            return fetch_multi_config(cand, slug, cfgs)
                        cfg = cfgs[0]
                except Exception:
                    pass
            kw = {"split": "train"} if cfg is None else {"split": "train", "name": cfg}
            try:
                ds = load_dataset(cand, **kw)
            except Exception:
                # try without explicit split (some datasets use different splits)
                kw2 = {} if cfg is None else {"name": cfg}
                ds = load_dataset(cand, **kw2)
                # pick first split
                if hasattr(ds, "keys"):
                    ds = ds[list(ds.keys())[0]]
            total = len(ds)
            if max_rows and total > max_rows:
                ds = ds.select(range(max_rows))
            # save
            csv_path = dest / "data.csv"
            ds.to_csv(str(csv_path))
            meta = {
                "hf_id": cand, "slug": slug, "config": cfg,
                "rows_saved": len(ds), "rows_total": total,
                "columns": ds.column_names,
                "capped": bool(max_rows and total > max_rows),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
            (dest / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
            print(f"OK  {slug} <- {cand} [{len(ds)}/{total} rows] cols={len(ds.column_names)}")
            return {"status": "ok", **meta}
        except Exception as e:
            last_err = f"{cand}: {e}"
            continue
    print(f"FAIL {slug} <- {hf_id} :: {last_err}")
    traceback.print_exc(limit=3)
    (dest / "ERROR.txt").write_text(str(last_err or "unknown error"), encoding="utf-8")
    return {"status": "failed", "slug": slug, "hf_id": hf_id, "error": str(last_err)}

def fetch_multi_config(hf_id, slug, configs):
    from datasets import load_dataset
    dest = OUT / slug
    dest.mkdir(parents=True, exist_ok=True)
    total_saved = 0
    per_cfg = {}
    for cfg in configs[:6]:  # safety cap
        try:
            ds = load_dataset(hf_id, name=cfg, split="train")
            sub = dest / f"data-{cfg}.csv"
            ds.to_csv(str(sub))
            per_cfg[cfg] = len(ds)
            total_saved += len(ds)
            print(f"OK  {slug}:{cfg} [{len(ds)} rows]")
        except Exception as e:
            per_cfg[cfg] = f"error: {e}"
    meta = {"hf_id": hf_id, "slug": slug, "configs": per_cfg,
            "rows_saved": total_saved,
            "fetched_at": datetime.now(timezone.utc).isoformat()}
    (dest / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {"status": "ok" if total_saved else "failed", **meta}

def main():
    from datasets import __version__ as ds_ver
    manifest = {"created_at": datetime.now(timezone.utc).isoformat(),
                "out_dir": str(OUT), "datasets_version": ds_ver, "results": []}
    for hf_id, slug, max_rows, cfg in TARGETS:
        r = fetch_one(hf_id, slug, max_rows, cfg)
        manifest["results"].append(r)
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    ok = sum(1 for r in manifest["results"] if r["status"] == "ok")
    print(f"\nDone: {ok}/{len(manifest['results'])} ok -> {OUT}")
    print("Manifest:", OUT / "MANIFEST.json")

if __name__ == "__main__":
    main()
