"""Evaluate retrieval quality: base vs fine-tuned, and embedding dimensions.

Metrics: Recall@1/3/5, MRR@5, nDCG@5 on the HELD-OUT test split (never used
in training). Compares:
  1. the base model vs a fine-tuned artifact (same queries, same candidates)
  2. embedding dims 768 (full) vs 256 vs 128 (prefix truncation + renorm)

  python ml/evaluate.py --models base=google/embeddinggemma-300m
  python ml/evaluate.py --models base=google/embeddinggemma-300m,tuned=ml/artifacts/HealthSphere-egemma-v1

Exit code 0 always (this is a measurement tool, not a gate); it prints a
table and writes ml/artifacts/eval-report.json.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
QUERY_PREFIX = "Given a medical query, retrieve the relevant laboratory passage: "
DOC_PREFIX = "Laboratory passage: "


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def metrics_for(ranks, ks=(1, 3, 5)):
    """ranks: 1-based rank of the gold passage per query."""
    out = {}
    for k in ks:
        out[f"recall@{k}"] = float(np.mean([r <= k for r in ranks]))
    out["mrr@5"] = float(np.mean([1.0 / r if r <= 5 else 0.0 for r in ranks]))
    # nDCG@5 with a single relevant doc == 1/log2(rank+1) when rank<=5
    out["ndcg@5"] = float(np.mean(
        [1.0 / np.log2(r + 1) if r <= 5 else 0.0 for r in ranks]))
    return out


def encode_texts(model, texts, batch=32):
    vecs = model.encode(texts, batch_size=batch, show_progress_bar=False,
                        convert_to_numpy=True, normalize_embeddings=False)
    return np.asarray(vecs, dtype=np.float64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True,
                    help="name=path_or_id pairs, e.g. base=google/embeddinggemma-300m,tuned=ml/artifacts/x")
    ap.add_argument("--test", default=os.path.join(HERE, "data", "test.jsonl"))
    ap.add_argument("--dims", default="768,256,128")
    ap.add_argument("--neg-per-query", type=int, default=19)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=os.path.join(HERE, "artifacts", "eval-report.json"))
    args = ap.parse_args()

    try:
        from sentence_transformers import SentenceTransformer
        import torch
    except ImportError as e:
        print("Missing ML dependencies. Run: pip install -r ml/requirements.txt")
        print(f"Import error: {e}")
        sys.exit(2)

    rng = np.random.default_rng(args.seed)
    rows = read_jsonl(args.test)
    print(f"test rows={len(rows)}")
    dim_list = [int(x) for x in args.dims.split(",") if x.strip()]

    # shared candidate pool per query: gold + negatives sampled once (fair)
    corpus_texts = []
    for r in rows:
        corpus_texts.append(DOC_PREFIX + r["positive"])
        for n in r.get("negative", [])[: args.neg_per_query]:
            corpus_texts.append(DOC_PREFIX + n)
    corpus_texts = list(dict.fromkeys(corpus_texts))  # dedupe, keep order
    gold_idx = []
    for r in rows:
        gold_idx.append(corpus_texts.index(DOC_PREFIX + r["positive"]))
    queries = [QUERY_PREFIX + r["anchor"] for r in rows]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device}")
    report = {"test_rows": len(rows), "dims": dim_list, "results": {}}
    for pair in args.models.split(","):
        name, path = pair.split("=", 1)
        name, path = name.strip(), path.strip()
        print(f"--- model {name} ({path}) ---")
        try:
            model = SentenceTransformer(path, trust_remote_code=True, device=device)
        except Exception as e:  # noqa: BLE001 - surface loader issues plainly
            print(f"  FAILED to load: {e}")
            report["results"][name] = {"error": str(e)}
            continue
        qv = encode_texts(model, queries)
        cv = encode_texts(model, corpus_texts)
        report["results"][name] = {}
        for d in dim_list:
            if d > qv.shape[1]:
                print(f"  dim {d}: wider than model output ({qv.shape[1]}), skipped")
                continue
            q, c = qv[:, :d], cv[:, :d]
            q = q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-12)
            c = c / (np.linalg.norm(c, axis=1, keepdims=True) + 1e-12)
            sims = q @ c.T
            ranks = []
            for i, g in enumerate(gold_idx):
                order = np.argsort(-sims[i], kind="stable")
                ranks.append(int(np.where(order == g)[0][0]) + 1)
            m = metrics_for(ranks)
            m["mean_rank"] = float(np.mean(ranks))
            report["results"][name][str(d)] = m
            print(f"  dim {d}: " + " ".join(f"{k}={v:.3f}" for k, v in m.items()))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
